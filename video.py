"""AI video generation (text-to-video and image-to-video) via OpenRouter.

Flow
----
1. POST /api/video/generate  -> checks the plan + daily allowance, submits a job to
   OpenRouter (POST /api/v1/videos), stores a VideoJob row and starts a background
   watcher. Returns our own job id straight away.
2. The watcher polls OpenRouter (GET /api/v1/videos/{id}) until the job is done,
   downloads the MP4 (GET /api/v1/videos/{id}/content) to the persistent volume,
   and saves an assistant message in the chat, so the video appears even if the
   person closed the tab.
3. GET /api/video/status/{id} -> what the browser polls (reads our own DB row,
   so it never hammers OpenRouter).
4. GET /api/video/serve/{name} -> streams the saved MP4.

Video is billed per second of footage, so it is limited to paid plans with a daily
allowance. Everything is tunable with environment variables on Railway:

    VIDEO_MODEL              default model           (google/veo-3.1-lite)
    VIDEO_MODEL_ULTIMATE     model for Ultimate/staff (google/veo-3.1-fast)
    VIDEO_RESOLUTION         720p | 1080p             (720p)
    (how many clips each plan gets a day is set in the Vault: System -> Limits)
    VIDEO_ENABLED            set to "false" to switch the feature off
"""
import asyncio
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user_from_cookie
from database import Chat, Message, UsageLog, VideoJob, async_session, get_db
from limits import _is_guest, _is_pro, _is_ultimate, _as_utc

router = APIRouter(prefix="/api/video", tags=["video"])

OR_BASE = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
VIDEO_MODEL = os.environ.get("VIDEO_MODEL", "google/veo-3.1-lite").strip()
VIDEO_MODEL_ULTIMATE = os.environ.get("VIDEO_MODEL_ULTIMATE", "google/veo-3.1-fast").strip()
VIDEO_RESOLUTION = os.environ.get("VIDEO_RESOLUTION", "720p").strip()
# How many videos each plan gets a day now comes from the Vault (System → Limits).
DURATIONS = (4, 6, 8)          # what the Veo 3.1 family accepts
ASPECTS = ("16:9", "9:16")
POLL_EVERY = 12                 # seconds between OpenRouter polls
GIVE_UP_AFTER = 20 * 60         # seconds before a stuck job is marked failed
_SERVE_RE = re.compile(r"^vid_[0-9a-f]{16}\.mp4$")
_watchers: set = set()          # keep task references so they aren't garbage collected


def _enabled() -> bool:
    return os.environ.get("VIDEO_ENABLED", "true").strip().lower() not in ("0", "false", "no", "off")


def _video_dir() -> Path:
    """Railway volume (/data) first so videos survive redeploys; local folder in dev."""
    for p in (Path("/data/videos"), Path(__file__).parent / "generated_videos"):
        try:
            p.mkdir(parents=True, exist_ok=True)
            probe = p / ".probe"
            probe.write_text("x")
            probe.unlink()
            return p
        except Exception:
            continue
    return Path(__file__).parent / "generated_videos"


def _tier(user):
    """Which plan's numbers apply (guest, free, pro, ultimate, friend, admin, trusted, owner)."""
    import limits_config as LC
    return LC.plan_of(user)


async def _video_limit(db, user):
    """Videos a day for this person, from the Vault. None = no limit."""
    import limits_config as LC
    n = await LC.allowance(user, "videos", db)
    return n


def _model_for(tier: str) -> str:
    return VIDEO_MODEL_ULTIMATE if tier in ("ultimate", "staff", "friend") else VIDEO_MODEL


async def _used_today(db: AsyncSession, user_id: int) -> int:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    r = await db.execute(
        select(func.count()).select_from(UsageLog).where(
            UsageLog.user_id == user_id, UsageLog.action == "video_gen", UsageLog.created_at >= start
        )
    )
    return int(r.scalar() or 0)


def _keys():
    from ai import _get_openrouter_keys
    return _get_openrouter_keys() or []


class VideoRequest(BaseModel):
    prompt: str
    chat_id: int | None = None
    duration: int = 6
    aspect: str = "16:9"
    image: str | None = None      # optional data: URL or https URL -> image-to-video
    user_text: str | None = None  # what the person typed, saved so the chat reads naturally after a reload


@router.get("/config")
async def video_config(request: Request, db: AsyncSession = Depends(get_db)):
    """What the composer needs to know: can this person make videos, and how many are left today."""
    user = await get_current_user_from_cookie(request, db)
    tier = _tier(user)
    limit = await _video_limit(db, user)
    allowed = _enabled() and limit != 0 and bool(_keys())
    used = await _used_today(db, user.id) if allowed else 0
    return {
        "enabled": _enabled(),
        "allowed": allowed,
        "tier": tier,
        "daily_limit": limit,
        "remaining": None if limit is None else max(0, limit - used),
        "durations": list(DURATIONS),
        "aspects": list(ASPECTS),
        "default_duration": 6,
    }


async def start_video_job(db: AsyncSession, user, prompt: str, duration: int = 6, aspect: str = "16:9",
                          chat_id=None, image=None, user_text=None) -> dict:
    """Submit a clip for `user` (plan + daily allowance checked). Raises HTTPException.
    Used by the Video button/dialog and when the AI asks for a video itself."""
    if not _enabled():
        raise HTTPException(status_code=503, detail="Video generation is switched off right now.")
    tier = _tier(user)
    if (await _video_limit(db, user)) == 0:
        msg = ("Videos are a Pro feature. Log in and upgrade to make videos."
               if _is_guest(user) else "Videos aren't included in your plan. Upgrade to make them.")
        raise HTTPException(status_code=403, detail=msg)
    prompt = (prompt or "").strip()
    if len(prompt) < 3:
        raise HTTPException(status_code=400, detail="Describe the video you want.")
    if len(prompt) > 800:
        raise HTTPException(status_code=400, detail="Prompt too long (max 800 characters).")
    duration = duration if duration in DURATIONS else 6
    aspect = aspect if aspect in ASPECTS else "16:9"
    image = (image or "").strip() or None
    if image and not (image.startswith("data:image/") or image.startswith("https://")):
        image = None
    if image and len(image) > 8_000_000:
        raise HTTPException(status_code=400, detail="That image is too large for video (max ~6 MB).")

    limit = await _video_limit(db, user)
    used = await _used_today(db, user.id)
    if limit is not None and used >= limit:
        raise HTTPException(status_code=429, detail=f"You've used all {limit} videos for today. They come back at midnight (UTC).")

    chat = None
    if chat_id:
        r = await db.execute(select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id))
        chat = r.scalar_one_or_none()

    keys = _keys()
    if not keys:
        raise HTTPException(status_code=503, detail="Video generation isn't configured yet (no OpenRouter key).")

    model = _model_for(tier)
    payload = {
        "model": model,
        "prompt": prompt,
        "duration": duration,
        "resolution": VIDEO_RESOLUTION,
        "aspect_ratio": aspect,
        "generate_audio": True,
    }
    if image:
        payload["frame_images"] = [{"type": "image_url", "image_url": {"url": image}, "frame_type": "first_frame"}]

    job_id, last_err = None, ""
    async with httpx.AsyncClient(timeout=60) as client:
        for key in keys:
            try:
                r = await client.post(f"{OR_BASE}/videos", json=payload,
                                      headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
            except Exception as e:  # network trouble -> next key
                last_err = str(e)
                continue
            if r.status_code in (402, 429) and len(keys) > 1:
                last_err = f"key exhausted ({r.status_code})"
                continue
            if r.status_code >= 400:
                try:
                    last_err = (r.json().get("error") or {}).get("message") or r.text[:300]
                except Exception:
                    last_err = r.text[:300]
                break
            data = r.json()
            job_id = data.get("id")
            break
    if not job_id:
        print(f"[video] submit failed: {last_err}")
        raise HTTPException(status_code=502, detail="The video service didn't accept the request. Please try again in a moment.")

    log = UsageLog(user_id=user.id, action="video_gen")
    db.add(log)
    await db.flush()
    job = VideoJob(user_id=user.id, chat_id=chat.id if chat else None, provider_job_id=str(job_id), model=model,
                   prompt=prompt, duration=duration, aspect=aspect, status="pending", usage_log_id=log.id)
    db.add(job)
    try:
        import ai_meter
        ai_meter.record_video(user.id, model, duration)
    except Exception:
        pass
    if chat and (user_text or "").strip():
        db.add(Message(chat_id=chat.id, role="user", content=user_text.strip()[:2000]))
    if chat and (chat.title or "").startswith("New Chat"):
        chat.title = ("Video: " + prompt)[:60]
    await db.commit()
    await db.refresh(job)

    t = asyncio.create_task(_watch(job.id))
    _watchers.add(t)
    t.add_done_callback(_watchers.discard)
    return {"id": job.id, "status": job.status, "duration": duration, "aspect": aspect, "prompt": prompt,
            "remaining": max(0, limit - used - 1), "chat_title": chat.title if chat else None}


@router.post("/generate")
async def generate_video(req: VideoRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    return await start_video_job(db, user, req.prompt, req.duration, req.aspect, req.chat_id, req.image, req.user_text)


async def video_allowance(db: AsyncSession, user) -> dict:
    """(for the AI's tool list) plan tier, daily limit and what's left today."""
    tier = _tier(user)
    limit = (await _video_limit(db, user)) if _enabled() else 0
    used = await _used_today(db, user.id) if limit else 0
    return {"tier": tier, "limit": limit, "left": None if limit is None else max(0, limit - used)}


async def _finish(db: AsyncSession, job: VideoJob, status: str, url: str = "", error: str = ""):
    job.status = status
    job.url = url
    job.error = error[:500]
    job.updated_at = datetime.now(timezone.utc)
    if status == "completed" and job.chat_id:
        content = (f"**Video:** {job.prompt}\n\n"
                   f"[▶ Generated video ({job.duration}s, {job.aspect})]({url})")
        db.add(Message(chat_id=job.chat_id, role="assistant", content=content))
        r = await db.execute(select(Chat).where(Chat.id == job.chat_id))
        chat = r.scalar_one_or_none()
        if chat:
            chat.updated_at = datetime.now(timezone.utc)
    if status == "failed" and job.usage_log_id:
        # a failed clip shouldn't use up the day's allowance
        r = await db.execute(select(UsageLog).where(UsageLog.id == job.usage_log_id))
        ul = r.scalar_one_or_none()
        if ul:
            await db.delete(ul)
    await db.commit()


async def _watch(job_pk: int):
    """Background watcher: poll OpenRouter until the clip is ready, then save it."""
    started = datetime.now(timezone.utc)
    await asyncio.sleep(POLL_EVERY)
    while True:
        try:
            async with async_session() as db:
                r = await db.execute(select(VideoJob).where(VideoJob.id == job_pk))
                job = r.scalar_one_or_none()
                if not job or job.status in ("completed", "failed"):
                    return
                if (datetime.now(timezone.utc) - started).total_seconds() > GIVE_UP_AFTER:
                    await _finish(db, job, "failed", error="Timed out waiting for the video service.")
                    return
                state, err = await _poll_provider(job.provider_job_id)
                if state == "completed":
                    name = f"vid_{secrets.token_hex(8)}.mp4"
                    ok = await _download(job.provider_job_id, _video_dir() / name)
                    if ok:
                        await _finish(db, job, "completed", url=f"/api/video/serve/{name}")
                    else:
                        await _finish(db, job, "failed", error="Couldn't download the finished video.")
                    return
                if state == "failed":
                    await _finish(db, job, "failed", error=err or "The video service couldn't make this clip.")
                    return
                if state and state != job.status:
                    job.status = state
                    job.updated_at = datetime.now(timezone.utc)
                    await db.commit()
        except Exception as e:
            print(f"[video] watcher error for job {job_pk}: {e}")
        await asyncio.sleep(POLL_EVERY)


async def _poll_provider(provider_id: str):
    async with httpx.AsyncClient(timeout=30) as client:
        for key in _keys():
            try:
                r = await client.get(f"{OR_BASE}/videos/{provider_id}", headers={"Authorization": f"Bearer {key}"})
            except Exception:
                continue
            if r.status_code in (401, 403, 404) :
                continue  # a different key may own this job
            if r.status_code >= 400:
                return None, ""
            d = r.json()
            err = d.get("error")
            if isinstance(err, dict):
                err = err.get("message", "")
            return d.get("status"), (err or "")
    return None, ""


async def _download(provider_id: str, dest: Path) -> bool:
    async with httpx.AsyncClient(timeout=300, follow_redirects=True) as client:
        for key in _keys():
            try:
                r = await client.get(f"{OR_BASE}/videos/{provider_id}/content", params={"index": 0},
                                     headers={"Authorization": f"Bearer {key}"})
            except Exception:
                continue
            if r.status_code == 200 and r.content:
                dest.write_bytes(r.content)
                return True
    return False


def _resume_unfinished():
    """Called at startup: pick up jobs that were still rendering when the server restarted."""
    async def run():
        try:
            async with async_session() as db:
                cutoff = datetime.now(timezone.utc) - timedelta(seconds=GIVE_UP_AFTER)
                r = await db.execute(select(VideoJob).where(VideoJob.status.in_(("pending", "in_progress"))))
                for job in r.scalars().all():
                    if _as_utc(job.created_at) < cutoff:
                        await _finish(db, job, "failed", error="Timed out.")
                    else:
                        t = asyncio.create_task(_watch(job.id))
                        _watchers.add(t)
                        t.add_done_callback(_watchers.discard)
        except Exception as e:
            print(f"[video] resume skipped: {e}")
    return run()


@router.get("/status/{job_id}")
async def video_status(job_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    r = await db.execute(select(VideoJob).where(VideoJob.id == job_id, VideoJob.user_id == user.id))
    job = r.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Video not found")
    elapsed = int((datetime.now(timezone.utc) - _as_utc(job.created_at)).total_seconds())
    return {"id": job.id, "status": job.status, "url": job.url, "error": job.error, "prompt": job.prompt,
            "duration": job.duration, "aspect": job.aspect, "elapsed": elapsed, "chat_id": job.chat_id}


@router.get("/pending")
async def video_pending(request: Request, chat_id: int | None = None, db: AsyncSession = Depends(get_db)):
    """Jobs still rendering (so a reloaded page can show their progress again)."""
    user = await get_current_user_from_cookie(request, db)
    q = select(VideoJob).where(VideoJob.user_id == user.id, VideoJob.status.in_(("pending", "in_progress")))
    if chat_id:
        q = q.where(VideoJob.chat_id == chat_id)
    r = await db.execute(q.order_by(VideoJob.id))
    return {"jobs": [{"id": j.id, "prompt": j.prompt, "duration": j.duration, "aspect": j.aspect,
                      "chat_id": j.chat_id, "status": j.status} for j in r.scalars().all()]}


@router.get("/serve/{name}")
async def serve_video(name: str):
    if not _SERVE_RE.match(name):
        raise HTTPException(status_code=404, detail="Not found")
    p = _video_dir() / name
    if not p.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(p, media_type="video/mp4", filename=name,
                        headers={"Cache-Control": "public, max-age=604800"}, content_disposition_type="inline")
