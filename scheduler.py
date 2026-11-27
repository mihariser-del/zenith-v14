"""Scheduled jobs: things Zelpophai does by itself on a schedule.

"Every morning at 8, send me the top news." "Every Friday, summarise my week."
Each run is a normal answer — web search, pictures, code and all — written into
the job's own chat. The person is told when it's ready, the same way reminders
are.

A run goes through exactly the same answering path as a message the person
typed (ai.stream_chat), so it gets every tool, every safety rule and the
person's own settings. It counts as one message against their daily allowance;
if they've used everything up, that run is skipped and the reason recorded.

How many jobs someone can keep is set per plan in the Vault (System → Limits →
Scheduled jobs).
"""

import asyncio
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user_from_cookie
from database import Chat, Message, ScheduledJob, User, async_session, get_db

router = APIRouter(prefix="/api/jobs", tags=["scheduled-jobs"])

EVERY = ("daily", "weekdays", "weekly", "once")
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
RUN_TIMEOUT = 240           # seconds one run may take, web search and all
_running: set[int] = set()  # jobs being run right now, so a slow one isn't started twice


# ── schedule maths ────────────────────────────────────────────────────────────
def _zone(tz: str):
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(tz or "UTC")
    except Exception:
        return timezone.utc


def _hm(at: str) -> tuple[int, int]:
    m = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*", at or "")
    if not m:
        raise ValueError("Times look like 08:00 or 17:30.")
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 23 or mi > 59:
        raise ValueError("Times look like 08:00 or 17:30.")
    return h, mi


def next_run(every: str, at: str, day: int, tz: str, after: datetime | None = None) -> datetime:
    """The next time this schedule falls due, as UTC."""
    zone = _zone(tz)
    now = (after or datetime.now(timezone.utc)).astimezone(zone)
    h, mi = _hm(at)
    cand = now.replace(hour=h, minute=mi, second=0, microsecond=0)
    if cand <= now:
        cand += timedelta(days=1)
    if every == "weekdays":
        while cand.weekday() >= 5:
            cand += timedelta(days=1)
    elif every == "weekly":
        while cand.weekday() != (day or 0) % 7:
            cand += timedelta(days=1)
    return cand.astimezone(timezone.utc)


def describe(every: str, at: str, day: int) -> str:
    """'Every weekday at 08:00' — the plain sentence people see."""
    if every == "daily":
        return f"Every day at {at}"
    if every == "weekdays":
        return f"Every weekday at {at}"
    if every == "weekly":
        return f"Every {DAY_NAMES[(day or 0) % 7]} at {at}"
    return f"Once, at {at}"


def parse_day(v) -> int:
    if isinstance(v, int):
        return v % 7
    s = str(v or "").strip().lower()[:3]
    return DAYS.index(s) if s in DAYS else 0


def _iso(dt):
    if not dt:
        return ""
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def as_dict(j: ScheduledJob) -> dict:
    return {"id": j.id, "title": j.title, "prompt": j.prompt, "every": j.every, "at": j.at, "day": j.day,
            "tz": j.tz, "enabled": bool(j.enabled), "when": describe(j.every, j.at, j.day),
            "next_run": _iso(j.next_run) if j.enabled else "", "last_run": _iso(j.last_run),
            "last_status": j.last_status or "", "runs": j.runs or 0, "chat_id": j.chat_id,
            "running": j.id in _running}


# ── creating one (from the API or from the AI's <zjob> tag) ───────────────────
async def allowance(db, user):
    import limits_config as LC
    return await LC.allowance(user, "jobs", db)


async def create(db, user, title: str, prompt: str, every: str, at: str, day=0, tz: str = "UTC") -> ScheduledJob:
    """Make a job, after checking the person's plan allows another one."""
    if (getattr(user, "username", "") or "").startswith("guest_"):
        raise HTTPException(status_code=403, detail="Create a free account to set up scheduled jobs.")
    prompt = (prompt or "").strip()
    if len(prompt) < 4:
        raise HTTPException(status_code=400, detail="Say what the job should do.")
    every = every if every in EVERY else "daily"
    try:
        _hm(at)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    limit = await allowance(db, user)
    have = (await db.execute(select(func.count()).select_from(ScheduledJob).where(ScheduledJob.user_id == user.id))).scalar() or 0
    if limit == 0:
        raise HTTPException(status_code=403, detail="Scheduled jobs aren't included in your plan yet.")
    if limit is not None and have >= limit:
        raise HTTPException(status_code=429, detail=f"You can keep {limit} scheduled job{'s' if limit != 1 else ''} on your plan. "
                                                    "Delete one to add another.")
    day = parse_day(day)
    tz = tz or "UTC"
    job = ScheduledJob(user_id=user.id, title=(title or prompt[:60]).strip()[:80], prompt=prompt[:2000],
                       every=every, at=at.strip(), day=day, tz=tz,
                       next_run=next_run(every, at, day, tz), enabled=True)
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


# ── running one ───────────────────────────────────────────────────────────────
def _notify(user: User, text: str):
    existing = getattr(user, "pending_notification", "") or ""
    user.pending_notification = (existing + "\n" + text).strip()


async def run(job_id: int, by_hand: bool = False) -> str:
    """Do the job now: write the request into its chat and let Zelpophai answer."""
    if job_id in _running:
        return "already running"
    _running.add(job_id)
    try:
        async with async_session() as db:
            job = await db.get(ScheduledJob, job_id)
            if not job:
                return "gone"
            user = await db.get(User, job.user_id)
            if not user or getattr(user, "is_banned", False) or getattr(user, "is_deleted", False):
                job.enabled = False
                job.last_status = "Stopped: the account can't be used"
                await db.commit()
                return job.last_status
            # One run is one message from their allowance.
            try:
                from limits import check_limit
                await check_limit(user, db, "message")
            except HTTPException as e:
                job.last_run = datetime.now(timezone.utc)
                job.last_status = "Skipped: you'd used today's messages"
                _notify(user, f"⏰ Skipped “{job.title}” — you'd used all of today's messages. It'll try again next time.")
                await db.commit()
                return job.last_status
            chat = await db.get(Chat, job.chat_id) if job.chat_id else None
            if not chat or chat.user_id != user.id:
                import uuid
                chat = Chat(user_id=user.id, title=f"⏰ {job.title}"[:80], link_id=uuid.uuid4().hex[:12])
                db.add(chat)
                await db.flush()
                job.chat_id = chat.id
            stamp = datetime.now(_zone(job.tz)).strftime("%a %d %b, %H:%M")
            db.add(Message(chat_id=chat.id, role="user",
                           content=f"⏰ {job.title} — {stamp}\n\n{job.prompt}"))
            chat.updated_at = datetime.now(timezone.utc)
            await db.commit()
            chat_id, tz, title, uid = chat.id, job.tz, job.title, user.id

        # The same path a typed message takes: every tool, every rule.
        from ai import stream_chat
        status = "Done"
        try:
            resp = await stream_chat(chat_id, think=False, client_tz=tz)

            async def drain():
                async for chunk in resp.body_iterator:
                    if isinstance(chunk, (bytes, bytearray)):
                        chunk = chunk.decode("utf-8", "replace")
                    if chunk.startswith('data: {"error"'):
                        raise RuntimeError(chunk[6:].strip()[:160])
            await asyncio.wait_for(drain(), timeout=RUN_TIMEOUT)
        except asyncio.TimeoutError:
            status = "Took too long, so it was stopped"
        except Exception as e:
            status = "Failed: " + (str(e)[:150] or type(e).__name__)

        async with async_session() as db:
            job = await db.get(ScheduledJob, job_id)
            user = await db.get(User, uid)
            if job:
                job.last_run = datetime.now(timezone.utc)
                job.last_status = status
                job.runs = (job.runs or 0) + (1 if status == "Done" else 0)
            if user:
                if status == "Done":
                    _notify(user, f"✅ “{title}” is ready — open the “⏰ {title}” chat to read it.")
                else:
                    _notify(user, f"⚠️ “{title}” didn't finish: {status.lower()}.")
            await db.commit()
        return status
    finally:
        _running.discard(job_id)


async def loop():
    """Every minute: run whatever has fallen due. The next time is worked out
    BEFORE running, so a crash mid-run can never make a job repeat."""
    await asyncio.sleep(20)
    while True:
        try:
            now = datetime.now(timezone.utc)
            async with async_session() as db:
                due = (await db.execute(select(ScheduledJob).where(
                    ScheduledJob.enabled.is_(True), ScheduledJob.next_run.isnot(None),
                    ScheduledJob.next_run <= now).limit(20))).scalars().all()
                ids = []
                for j in due:
                    if j.id in _running:
                        continue
                    if j.every == "once":
                        j.enabled = False
                        j.next_run = None
                    else:
                        j.next_run = next_run(j.every, j.at, j.day, j.tz, after=now)
                    ids.append(j.id)
                await db.commit()
            for jid in ids:
                asyncio.create_task(run(jid))
                await asyncio.sleep(2)          # don't start twenty AI calls in the same instant
        except Exception as e:
            print(f"[scheduler] {type(e).__name__}: {e}")
        await asyncio.sleep(60)


# ── the API ───────────────────────────────────────────────────────────────────
class JobIn(BaseModel):
    title: str = ""
    prompt: str
    every: str = "daily"
    at: str = "08:00"
    day: int | str = 0
    tz: str = "UTC"


class JobPatch(BaseModel):
    title: str | None = None
    prompt: str | None = None
    every: str | None = None
    at: str | None = None
    day: int | str | None = None
    tz: str | None = None
    enabled: bool | None = None


async def _mine(db, user, job_id) -> ScheduledJob:
    job = await db.get(ScheduledJob, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@router.get("")
async def list_jobs(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    rows = (await db.execute(select(ScheduledJob).where(ScheduledJob.user_id == user.id)
                             .order_by(ScheduledJob.created_at.desc()))).scalars().all()
    return {"jobs": [as_dict(j) for j in rows], "limit": await allowance(db, user), "count": len(rows)}


@router.post("")
async def add_job(body: JobIn, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    job = await create(db, user, body.title, body.prompt, body.every, body.at, body.day, body.tz)
    return {"job": as_dict(job)}


@router.patch("/{job_id}")
async def edit_job(job_id: int, body: JobPatch, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    job = await _mine(db, user, job_id)
    if body.title is not None:
        job.title = body.title.strip()[:80] or job.title
    if body.prompt is not None:
        if len(body.prompt.strip()) < 4:
            raise HTTPException(status_code=400, detail="Say what the job should do.")
        job.prompt = body.prompt.strip()[:2000]
    if body.every is not None:
        job.every = body.every if body.every in EVERY else job.every
    if body.at is not None:
        try:
            _hm(body.at)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        job.at = body.at.strip()
    if body.day is not None:
        job.day = parse_day(body.day)
    if body.tz:
        job.tz = body.tz
    if body.enabled is not None:
        job.enabled = bool(body.enabled)
    job.next_run = next_run(job.every, job.at, job.day, job.tz) if job.enabled else None
    await db.commit()
    return {"job": as_dict(job)}


@router.delete("/{job_id}")
async def delete_job(job_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    job = await _mine(db, user, job_id)
    await db.delete(job)
    await db.commit()
    return {"ok": True}


@router.post("/{job_id}/run")
async def run_now(job_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Run it now, without waiting for its time. The schedule doesn't change."""
    user = await get_current_user_from_cookie(request, db)
    job = await _mine(db, user, job_id)
    if job.id in _running:
        raise HTTPException(status_code=409, detail="It's already running.")
    asyncio.create_task(run(job.id, by_hand=True))
    return {"ok": True, "chat_id": job.chat_id}
