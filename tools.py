"""Everyday tools (26.3): your day, reply writer, budget & spending with
receipt reading, translate, and polls in shared chats.

Small personal stores (budget, spending, preferences) live in user_data as
JSON under a fixed set of keys. Every AI call here counts as one message from
the person's allowance.
"""

import json
import re
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user_from_cookie
from database import Chat, Message, Poll, Reminder, ScheduledJob, StudyCard, StudyDeck, UserData, get_db

router = APIRouter(tags=["tools"])

KEYS = {"budget": 60_000, "spending": 400_000, "prefs": 8_000, "rewards": 20_000}
IMG_RE = re.compile(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$")


def _now():
    return datetime.now(timezone.utc)


async def _ai(messages, max_tokens=1500, temperature=0.4, heavy=False, timeout=60):
    from router_ai import HEAVY_MODEL, LIGHT_MODEL, _post
    data = await _post({"model": HEAVY_MODEL if heavy else LIGHT_MODEL, "temperature": temperature,
                        "max_tokens": max_tokens, "messages": messages}, timeout=timeout)
    return (((data or {}).get("choices") or [{}])[0].get("message") or {}).get("content") or ""


async def _spend(user, db):
    from limits import check_limit
    await check_limit(user, db, "message")


# ── personal stores ──────────────────────────────────────────────────────────
async def get_data(db, uid, key, default=None):
    row = (await db.execute(select(UserData).where(UserData.user_id == uid, UserData.key == key))).scalars().first()
    if not row:
        return default
    try:
        return json.loads(row.value or "null")
    except Exception:
        return default


async def put_data(db, uid, key, value):
    raw = json.dumps(value, ensure_ascii=False)
    if len(raw) > KEYS[key]:
        raise HTTPException(status_code=413, detail="That's more than can be kept here.")
    row = (await db.execute(select(UserData).where(UserData.user_id == uid, UserData.key == key))).scalars().first()
    if not row:
        row = UserData(user_id=uid, key=key)
        db.add(row)
    row.value = raw
    row.updated_at = _now()
    await db.commit()


@router.get("/api/tools/data/{key}")
async def read_data(key: str, request: Request, db: AsyncSession = Depends(get_db)):
    if key not in KEYS:
        raise HTTPException(status_code=404, detail="Unknown")
    user = await get_current_user_from_cookie(request, db)
    return {"value": await get_data(db, user.id, key)}


@router.put("/api/tools/data/{key}")
async def write_data(key: str, request: Request, db: AsyncSession = Depends(get_db)):
    if key not in KEYS or key == "rewards":
        raise HTTPException(status_code=404, detail="Unknown")
    user = await get_current_user_from_cookie(request, db)
    if (user.username or "").startswith("guest_"):
        raise HTTPException(status_code=403, detail="Create a free account to save this.")
    body = await request.json()
    await put_data(db, user.id, key, body.get("value"))
    return {"ok": True}


# ── reply writer ─────────────────────────────────────────────────────────────
class ReplyIn(BaseModel):
    message: str
    context: str = ""
    want: str = ""


@router.post("/api/tools/replies")
async def replies(body: ReplyIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Three ready-to-send replies to a message someone received."""
    user = await get_current_user_from_cookie(request, db)
    msg = (body.message or "").strip()[:8000]
    if not msg:
        raise HTTPException(status_code=400, detail="Paste the message you want to reply to.")
    await _spend(user, db)
    from router_ai import _json
    text = await _ai([
        {"role": "system", "content": "Write three different replies the user could send to the message below, in the same "
                                      "language as that message. Reply with JSON only: {\"replies\": [{\"label\": \"Short\", \"text\": \"...\"}, "
                                      "{\"label\": \"Friendly\", \"text\": \"...\"}, {\"label\": \"Formal\", \"text\": \"...\"}]}. "
                                      "Short = one or two sentences. Friendly = warm and natural. Formal = polite and professional. "
                                      "Make each a complete message ready to send, signed off only if the original was. Follow what "
                                      "the user says they want to say. Never invent facts, dates or promises they didn't give."},
        {"role": "user", "content": f"MESSAGE I GOT:\n{msg}\n\n" + (f"ABOUT IT / WHO IT'S FROM: {body.context[:1000]}\n" if body.context.strip() else "")
                                    + (f"WHAT I WANT TO SAY: {body.want[:1500]}" if body.want.strip() else "")}],
        max_tokens=1500, temperature=0.6)
    out = [r for r in (_json(text).get("replies") or []) if isinstance(r, dict) and str(r.get("text", "")).strip()]
    if not out:
        raise HTTPException(status_code=502, detail="Couldn't write replies just now — try again.")
    return {"replies": [{"label": str(r.get("label", "Reply"))[:20], "text": str(r["text"])[:4000]} for r in out[:3]]}


# ── translate ────────────────────────────────────────────────────────────────
class TranslateIn(BaseModel):
    text: str
    to: str = "English"


@router.post("/api/tools/translate")
async def translate(body: TranslateIn, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    text = re.sub(r"<(zrun|zout|zchart|zpage|zfile|zcanvas|zdeck)\b[\s\S]*?</\1>", "", body.text or "").strip()[:12000]
    to = re.sub(r"[^\w \-()]", "", body.to or "English")[:40] or "English"
    if not text:
        raise HTTPException(status_code=400, detail="Nothing to translate.")
    await _spend(user, db)
    out = await _ai([{"role": "system", "content": f"Translate the user's text into {to}. Keep the meaning, tone and markdown "
                                                   "formatting (headings, lists, bold, tables, links). Reply with only the translation."},
                     {"role": "user", "content": text}], max_tokens=4000, temperature=0.2)
    if not out.strip():
        raise HTTPException(status_code=502, detail="Couldn't translate just now.")
    return {"text": out.strip(), "to": to}


# ── receipts → spending ──────────────────────────────────────────────────────
CATEGORIES = ["Food & groceries", "Eating out", "Transport", "Bills & utilities", "Rent & housing", "Shopping",
              "Health", "Education", "Entertainment", "Phone & internet", "Family & gifts", "Business", "Other"]


class ReceiptIn(BaseModel):
    image: str


@router.post("/api/tools/receipt")
async def receipt(body: ReceiptIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Read a photo of a receipt or bill and add it to the person's spending."""
    user = await get_current_user_from_cookie(request, db)
    if (user.username or "").startswith("guest_"):
        raise HTTPException(status_code=403, detail="Create a free account to track spending.")
    img = body.image or ""
    if len(img) > 7_000_000 or not IMG_RE.fullmatch(img):
        raise HTTPException(status_code=400, detail="That picture couldn't be read — try a clearer, smaller photo.")
    await _spend(user, db)
    from router_ai import _json
    text = await _ai([
        {"role": "system", "content": "Read this receipt, bill or invoice photo. Reply with JSON only: "
                                      '{"ok": true, "merchant": "", "date": "YYYY-MM-DD or empty", "total": 0, "currency": "3-letter code or symbol", '
                                      f'"category": "one of {CATEGORIES}", "items": [{{"name": "", "amount": 0}}]}}. '
                                      'total is the final amount paid (a number, no commas). If it is not a receipt or bill, reply {"ok": false}.'},
        {"role": "user", "content": [{"type": "text", "text": "Read this receipt."}, {"type": "image_url", "image_url": {"url": img}}]}],
        max_tokens=1200, temperature=0)
    d = _json(text)
    try:
        total = float(str(d.get("total", "")).replace(",", ""))
    except ValueError:
        total = 0
    if not d.get("ok") or total <= 0:
        raise HTTPException(status_code=422, detail="I couldn't find a total on that — is it a receipt? Try a clearer photo.")
    date = str(d.get("date") or "")[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        date = _now().strftime("%Y-%m-%d")
    entry = {"id": int(time.time() * 1000), "date": date, "merchant": str(d.get("merchant") or "Receipt")[:80], "amount": round(total, 2),
             "currency": str(d.get("currency") or "")[:5], "category": d.get("category") if d.get("category") in CATEGORIES else "Other",
             "items": [{"name": str(i.get("name", ""))[:60], "amount": i.get("amount")} for i in (d.get("items") or []) if isinstance(i, dict)][:30],
             "from": "receipt"}
    spending = await get_data(db, user.id, "spending", {"entries": []}) or {"entries": []}
    spending.setdefault("entries", []).append(entry)
    spending["entries"] = spending["entries"][-1500:]
    await put_data(db, user.id, "spending", spending)
    return {"entry": entry}


# ── your day ─────────────────────────────────────────────────────────────────
_BRIEF_CACHE: dict = {}


@router.get("/api/tools/briefing")
async def briefing(request: Request, tz: str = "", city: str = "", fresh: bool = False, db: AsyncSession = Depends(get_db)):
    """A short morning briefing: weather and news (from the web), plus the
    person's own reminders, scheduled jobs, study cards due and projects."""
    user = await get_current_user_from_cookie(request, db)
    city = re.sub(r"[^\w ,.'\-]", "", city or "")[:60]
    try:
        from zoneinfo import ZoneInfo
        local = datetime.now(ZoneInfo(tz)) if tz else _now()
    except Exception:
        local = _now()
    key = (user.id, local.strftime("%Y-%m-%d"), city.lower())
    hit = _BRIEF_CACHE.get(key)
    if hit and not fresh and time.time() - hit[0] < 3 * 3600:
        return hit[1]
    await _spend(user, db)
    now = _now().replace(tzinfo=None)
    end = now + timedelta(hours=24)
    rem = (await db.execute(select(Reminder).where(Reminder.user_id == user.id, Reminder.next_run_at <= end)
                            .order_by(Reminder.next_run_at).limit(8))).scalars().all()
    jobs = (await db.execute(select(ScheduledJob).where(ScheduledJob.user_id == user.id).limit(8))).scalars().all()
    due = 0
    for d in (await db.execute(select(StudyDeck.id).where(StudyDeck.user_id == user.id))).all():
        due += len((await db.execute(select(StudyCard.id).where(StudyCard.deck_id == d[0], StudyCard.due_at <= now))).all())
    from database import Project
    projects = (await db.execute(select(Project).where(Project.user_id == user.id).order_by(Project.updated_at.desc()).limit(3))).scalars().all()
    budget = await get_data(db, user.id, "budget")
    spending = await get_data(db, user.id, "spending", {"entries": []}) or {"entries": []}
    month = local.strftime("%Y-%m")
    spent = sum(float(e.get("amount") or 0) for e in spending.get("entries", []) if str(e.get("date", "")).startswith(month))

    facts = ""
    if city:
        try:
            from router_ai import web_answer
            q = f"Weather today in {city} and the 4 most important news headlines today for people in {city}"
            facts, _src = await web_answer([{"role": "user", "content": q}], q, 700)
        except Exception:
            facts = ""
    mine = []
    for r in rem:
        t = r.next_run_at.replace(tzinfo=timezone.utc)
        try:
            from zoneinfo import ZoneInfo
            t = t.astimezone(ZoneInfo(tz)) if tz else t
        except Exception:
            pass
        mine.append(f"Reminder at {t.strftime('%H:%M')}: {r.text[:120]}")
    for j in jobs:
        mine.append(f"Scheduled job \"{j.title}\" ({j.every} at {j.at})")
    if due:
        mine.append(f"{due} flashcards are due for review in Study")
    for p in projects:
        mine.append(f"Recent project: {p.emoji} {p.name}")
    if budget and budget.get("income"):
        mine.append(f"Spent {spent:,.0f} so far this month out of a planned {float(budget.get('total_costs') or 0):,.0f} of costs")
    name = (getattr(user, "display_name", "") or user.username or "").split(" ")[0]
    text = await _ai([
        {"role": "system", "content": "Write the user's short morning briefing in markdown. Start with a warm one-line greeting "
                                      "using their name and the day. Then sections (only if there's something for them): "
                                      "**Weather**, **News** (3-4 one-line headlines), **Your day** (their reminders, jobs, study, "
                                      "projects, budget — as a short checklist), and end with one short encouraging line or tip. "
                                      "Under 220 words. Use only the facts given; don't invent weather or news."},
        {"role": "user", "content": f"NAME: {name}\nTODAY: {local.strftime('%A %d %B %Y, %H:%M')}\nCITY: {city or 'not given'}\n\n"
                                    f"WEB FACTS:\n{facts or '(none — no city set)'}\n\nTHEIR THINGS:\n" + ("\n".join(mine) or "(nothing scheduled)")}],
        max_tokens=900, temperature=0.5)
    from ai import strip_citations
    out = {"text": strip_citations(text).strip() or "Good morning! Nothing on your list today.", "city": city,
           "at": local.strftime("%H:%M")}
    _BRIEF_CACHE[key] = (time.time(), out)
    if len(_BRIEF_CACHE) > 3000:
        _BRIEF_CACHE.clear()
    return out


# ── polls in shared chats ────────────────────────────────────────────────────
class PollIn(BaseModel):
    question: str
    options: list[str]


def _pjson(p, me, names):
    try:
        votes = {int(k): v for k, v in json.loads(p.votes or "{}").items()}
    except Exception:
        votes = {}
    opts = json.loads(p.options or "[]")
    counts = [0] * len(opts)
    who = [[] for _ in opts]
    for uid, i in votes.items():
        if 0 <= i < len(opts):
            counts[i] += 1
            who[i].append(names.get(uid, "Someone"))
    return {"id": p.id, "question": p.question, "options": opts, "counts": counts, "who": who,
            "mine": votes.get(me), "total": sum(counts), "closed": bool(p.closed), "owner": p.user_id == me}


@router.post("/api/chats/{chat_id}/polls")
async def create_poll(chat_id: int, body: PollIn, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    import groupchats
    chat, _ = await groupchats.access(db, user, chat_id)
    q = (body.question or "").strip()[:300]
    opts = [o.strip()[:120] for o in body.options if o and o.strip()][:8]
    if not q or len(opts) < 2:
        raise HTTPException(status_code=400, detail="A poll needs a question and at least two choices.")
    p = Poll(chat_id=chat.id, user_id=user.id, question=q, options=json.dumps(opts), votes="{}")
    db.add(p)
    await db.flush()
    db.add(Message(chat_id=chat.id, role="user", author_id=user.id, content=f'<zpoll id="{p.id}">{q}</zpoll>'))
    chat.updated_at = _now()
    await db.commit()
    return {"id": p.id}


async def _poll(db, user, pid):
    p = await db.get(Poll, pid)
    if not p:
        raise HTTPException(status_code=404, detail="Poll not found")
    import groupchats
    chat, _ = await groupchats.access(db, user, p.chat_id)
    names = await groupchats.names(db, chat)
    return p, names


@router.get("/api/polls/{pid}")
async def get_poll(pid: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    p, names = await _poll(db, user, pid)
    return _pjson(p, user.id, names)


class VoteIn(BaseModel):
    option: int


@router.post("/api/polls/{pid}/vote")
async def vote(pid: int, body: VoteIn, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    p, names = await _poll(db, user, pid)
    if p.closed:
        raise HTTPException(status_code=400, detail="This poll has closed.")
    opts = json.loads(p.options or "[]")
    if not 0 <= body.option < len(opts):
        raise HTTPException(status_code=400, detail="No such choice.")
    votes = json.loads(p.votes or "{}")
    votes[str(user.id)] = body.option
    p.votes = json.dumps(votes)
    await db.commit()
    return _pjson(p, user.id, names)


@router.post("/api/polls/{pid}/close")
async def close_poll(pid: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    p, names = await _poll(db, user, pid)
    if p.user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the person who made the poll can close it.")
    p.closed = True
    await db.commit()
    return _pjson(p, user.id, names)
