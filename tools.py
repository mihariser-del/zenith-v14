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


# ═══════════════════════════ 26.4 ═══════════════════════════
# Audio (answers read aloud as an MP3, music), invoices & quotes, meeting
# notes, and rewards. Audio comes from OpenRouter models that answer with
# sound: openai/gpt-audio-mini for speech and Google's Lyria 3 for music.
import base64 as _b64
import os as _os
import secrets as _secrets
import subprocess as _sp
import tempfile as _tmp

from fastapi.responses import FileResponse, Response
from sqlalchemy import func as _func

TTS_MODEL = _os.getenv("TTS_MODEL", "openai/gpt-audio-mini")
MUSIC_CLIP_MODEL = _os.getenv("MUSIC_CLIP_MODEL", "google/lyria-3-clip-preview")
MUSIC_SONG_MODEL = _os.getenv("MUSIC_SONG_MODEL", "google/lyria-3-pro-preview")
VOICES = {"alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"}


def _audio_dir():
    from files import UPLOAD_DIR
    d = _os.path.join(UPLOAD_DIR, "audio")
    _os.makedirs(d, exist_ok=True)
    return d


def _ffmpeg():
    try:
        from files import _ffmpeg_exe
        return _ffmpeg_exe()
    except Exception:
        return None


def _wav_from_pcm16(pcm: bytes, rate=24000) -> bytes:
    import struct
    return (b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
            + b"data" + struct.pack("<I", len(pcm)) + pcm)


def _to_mp3(data: bytes, ext: str) -> tuple[bytes, str]:
    """Convert to MP3 with ffmpeg when we have it; otherwise keep the original."""
    exe = _ffmpeg()
    if not exe or ext == "mp3":
        return data, ext
    with _tmp.TemporaryDirectory() as td:
        src, dst = _os.path.join(td, "in." + ext), _os.path.join(td, "out.mp3")
        open(src, "wb").write(data)
        try:
            _sp.run([exe, "-y", "-i", src, "-codec:a", "libmp3lame", "-b:a", "128k", dst], capture_output=True, timeout=120)
            if _os.path.exists(dst) and _os.path.getsize(dst) > 0:
                return open(dst, "rb").read(), "mp3"
        except Exception:
            pass
    return data, ext


def _find_audio(obj):
    """Dig the sound out of a reply, whatever shape the provider used."""
    if isinstance(obj, dict):
        for k in ("data", "b64_json", "audio_data"):
            v = obj.get(k)
            if isinstance(v, str) and len(v) > 200:
                fmt = obj.get("format") or obj.get("mime_type") or ""
                return v, fmt
        for k in ("url", "audio_url"):
            v = obj.get(k)
            if isinstance(v, dict):
                v = v.get("url")
            if isinstance(v, str) and (v.startswith("data:audio") or v.startswith("http")):
                return v, ""
        for v in obj.values():
            r = _find_audio(v)
            if r:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = _find_audio(v)
            if r:
                return r
    return None


async def _audio_call(payload: dict, timeout=180) -> tuple[bytes, str]:
    """Ask a model for sound. Returns (bytes, ext). Tries a normal reply first,
    then a streamed one (some audio models only stream)."""
    import httpx
    from ai import _get_openrouter_keys
    from router_ai import OR_URL
    keys = _get_openrouter_keys()
    if not keys:
        raise HTTPException(status_code=503, detail="Sound isn't set up yet.")
    last_err = ""
    for key in keys[:3]:
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=timeout) as c:
                r = await c.post(OR_URL, json=payload, headers=headers)
                if r.status_code in (401, 402, 429):
                    last_err = r.text[:300]
                    continue
                if r.status_code == 200:
                    got = _find_audio(r.json())
                    if got:
                        return await _decode(got)
                    last_err = "no audio in reply: " + r.text[:300]
                else:
                    last_err = r.text[:300]
                # Streaming fallback: audio arrives as base64 PCM16 chunks.
                sp = dict(payload, stream=True)
                if "audio" in sp:
                    sp["audio"] = dict(sp["audio"], format="pcm16")
                pcm, fmt = bytearray(), ""
                async with c.stream("POST", OR_URL, json=sp, headers=headers) as s:
                    if s.status_code != 200:
                        last_err = (await s.aread())[:300].decode("utf-8", "replace")
                        continue
                    async for line in s.aiter_lines():
                        if not line.startswith("data: ") or line[6:].strip() == "[DONE]":
                            continue
                        try:
                            ev = json.loads(line[6:])
                        except Exception:
                            continue
                        got = _find_audio(((ev.get("choices") or [{}])[0].get("delta") or {}))
                        if got and not got[0].startswith(("http", "data:")):
                            try:
                                pcm += _b64.b64decode(got[0])
                            except Exception:
                                pass
                if pcm:
                    return _wav_from_pcm16(bytes(pcm)), "wav"
                last_err = last_err or "streamed reply had no audio"
        except httpx.TimeoutException:
            last_err = "timed out"
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
    try:
        from vault_events import log_error
        log_error("audio", last_err, f"model:{payload.get('model')}", None)
    except Exception:
        pass
    raise HTTPException(status_code=502, detail="Couldn't make the sound just now — please try again in a minute.")


async def _decode(got) -> tuple[bytes, str]:
    data, fmt = got
    if data.startswith("http"):
        import httpx
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.get(data)
            ctype = r.headers.get("content-type", "")
            return r.content, ("mp3" if "mpeg" in ctype else "wav" if "wav" in ctype else "mp3")
    if data.startswith("data:"):
        head, data = data.split(",", 1)
        fmt = fmt or head
    raw = _b64.b64decode(data)
    f = (fmt or "").lower()
    if "pcm" in f:
        return _wav_from_pcm16(raw), "wav"
    ext = "mp3" if ("mp3" in f or "mpeg" in f or raw[:3] == b"ID3" or raw[:2] == b"\xff\xfb") else \
          "wav" if ("wav" in f or raw[:4] == b"RIFF") else "ogg" if raw[:4] == b"OggS" else "flac" if raw[:4] == b"fLaC" else "mp3"
    return raw, ext


def _speakable(t: str) -> str:
    """Markdown and Zelpophai's tags → plain sentences worth reading aloud."""
    t = re.sub(r"<(zrun|zout|zchart|zpage|zfile|zdeck|zpoll|zask|ztodo)\b[\s\S]*?</\1>", " ", t or "")
    t = re.sub(r"<zcanvas\b[^>]*>([\s\S]*?)</zcanvas>", r"\1", t)
    t = re.sub(r"```[\s\S]*?```", " (some code) ", t)
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", t)
    t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"^\s*[#>*\-|]+\s*", "", t, flags=re.M)
    t = re.sub(r"[*_`|]+", "", t)
    return re.sub(r"[ \t]+", " ", t).strip()


class SpeechIn(BaseModel):
    text: str
    voice: str = "coral"


@router.post("/api/tools/speech")
async def speech(body: SpeechIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Read text aloud and hand back an MP3 to keep."""
    user = await get_current_user_from_cookie(request, db)
    text = _speakable(body.text)[:4000]
    if not text.strip():
        raise HTTPException(status_code=400, detail="Nothing to read.")
    await _spend(user, db)
    voice = body.voice if body.voice in VOICES else "coral"
    data, ext = await _audio_call({
        "model": TTS_MODEL, "modalities": ["text", "audio"], "audio": {"voice": voice, "format": "mp3"}, "temperature": 0.2,
        "messages": [{"role": "system", "content": "You are a narrator. Read the user's text aloud exactly as written, word for "
                                                   "word, clearly and warmly. Don't add or answer anything."},
                     {"role": "user", "content": text}]}, timeout=240)
    data, ext = _to_mp3(data, ext)
    return Response(content=data, media_type="audio/mpeg" if ext == "mp3" else f"audio/{ext}",
                    headers={"Content-Disposition": f'attachment; filename="zelpophai-answer.{ext}"'})


def _music_allowance(user):
    import limits_config as LC
    return {"guest": 0, "free": 2, "pro": 10, "ultimate": 30, "friend": 10, "admin": 30, "trusted": 30, "owner": None}.get(LC.plan_of(user), 2)


class MusicIn(BaseModel):
    prompt: str
    style: str = ""
    mood: str = ""
    lyrics: str = ""
    instrumental: bool = True
    length: str = "clip"           # clip (30 s) | song


@router.post("/api/tools/music")
async def music(body: MusicIn, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    from database import UsageLog
    limit = _music_allowance(user)
    start = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    used = (await db.execute(select(_func.count()).select_from(UsageLog).where(
        UsageLog.user_id == user.id, UsageLog.action == "music", UsageLog.created_at >= start))).scalar() or 0
    if limit is not None and used >= limit:
        raise HTTPException(status_code=429, detail=("Make a free account to create music." if limit == 0 else
                                                     f"You've made {limit} pieces of music today — more tomorrow."))
    idea = (body.prompt or "").strip()[:800]
    if not idea:
        raise HTTPException(status_code=400, detail="Describe the music you want.")
    desc = idea + (f". Style: {body.style[:80]}" if body.style.strip() else "") + (f". Mood: {body.mood[:80]}" if body.mood.strip() else "")
    if body.instrumental or not body.lyrics.strip():
        desc += ". Instrumental, no vocals."
    else:
        desc += ". Lyrics:\n" + body.lyrics[:2000]
    model = MUSIC_SONG_MODEL if body.length == "song" else MUSIC_CLIP_MODEL
    data, ext = await _audio_call({"model": model, "messages": [{"role": "user", "content": desc}]}, timeout=300)
    db.add(UsageLog(user_id=user.id, action="music"))
    await db.commit()
    data, ext = _to_mp3(data, ext)
    name = f"{user.id}_{_secrets.token_hex(10)}.{ext}"
    open(_os.path.join(_audio_dir(), name), "wb").write(data)
    return {"url": f"/api/tools/audio/{name}", "ext": ext, "left": None if limit is None else max(0, limit - used - 1)}


@router.get("/api/tools/audio/{name}")
async def audio_file(name: str, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not re.fullmatch(r"\d+_[0-9a-f]{20}\.(mp3|wav|ogg|flac)", name or "") or not name.startswith(f"{user.id}_"):
        raise HTTPException(status_code=404, detail="Not found")
    p = _os.path.join(_audio_dir(), name)
    if not _os.path.exists(p):
        raise HTTPException(status_code=404, detail="Not found")
    ext = name.rsplit(".", 1)[1]
    return FileResponse(p, media_type="audio/mpeg" if ext == "mp3" else f"audio/{ext}", filename=f"zelpophai-music.{ext}")


# ── invoices & quotes ────────────────────────────────────────────────────────
class LineIn(BaseModel):
    desc: str
    qty: float = 1
    price: float = 0


class InvoiceIn(BaseModel):
    kind: str = "invoice"          # invoice | quote | receipt
    business: str = ""
    business_details: str = ""
    client: str = ""
    client_details: str = ""
    number: str = ""
    date: str = ""
    due: str = ""
    currency: str = ""
    items: list[LineIn] = []
    tax_rate: float = 0
    discount: float = 0
    notes: str = ""
    fmt: str = "pdf"               # pdf | docx


def _m(v):
    return f"{v:,.2f}"


@router.post("/api/tools/invoice")
async def invoice(body: InvoiceIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Make a tidy invoice / quote / receipt PDF (or Word). Exact sums, no AI needed."""
    user = await get_current_user_from_cookie(request, db)
    kind = body.kind if body.kind in ("invoice", "quote", "receipt") else "invoice"
    items = [i for i in body.items if i.desc.strip()][:60]
    if not items:
        raise HTTPException(status_code=400, detail="Add at least one item.")
    from decimal import Decimal, ROUND_HALF_UP
    q = lambda x: Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    sub = sum((q(i.qty) * q(i.price) for i in items), Decimal(0))
    disc = q(body.discount or 0)
    tax = q((sub - disc) * Decimal(str(body.tax_rate or 0)) / 100)
    total = sub - disc + tax
    cur = (body.currency or "").strip()[:5]
    # Keep a running number per kind unless they typed one.
    prefs = await get_data(db, user.id, "prefs", {}) or {}
    nums = prefs.setdefault("invoice_numbers", {})
    number = body.number.strip()[:30]
    if not number:
        nums[kind] = int(nums.get(kind, 0)) + 1
        number = {"invoice": "INV", "quote": "QUO", "receipt": "REC"}[kind] + f"-{nums[kind]:04d}"
        await put_data(db, user.id, "prefs", prefs)
    title = {"invoice": "INVOICE", "quote": "QUOTE", "receipt": "RECEIPT"}[kind]
    esc_md = lambda s: (s or "").replace("|", "/").strip()
    lines = [f"# {title}", "", f"**{esc_md(body.business) or 'Your business'}**  "]
    lines += [esc_md(l) + "  " for l in (body.business_details or "").splitlines() if l.strip()][:6]
    lines += ["", f"**{title.title()} number:** {number}  ", f"**Date:** {body.date or _now().strftime('%d %B %Y')}  "]
    if body.due and kind != "receipt":
        lines.append(f"**{'Valid until' if kind == 'quote' else 'Due'}:** {body.due}  ")
    lines += ["", f"**{'Received from' if kind == 'receipt' else 'Bill to' if kind == 'invoice' else 'Prepared for'}:** {esc_md(body.client) or '—'}  "]
    lines += [esc_md(l) + "  " for l in (body.client_details or "").splitlines() if l.strip()][:6]
    lines += ["", f"| Item | Qty | Unit price ({cur or 'amount'}) | Amount ({cur or 'amount'}) |", "|---|---:|---:|---:|"]
    for i in items:
        qty = q(i.qty)
        qs = str(int(qty)) if qty == qty.to_integral() else format(qty.normalize(), "f")
        lines.append(f"| {esc_md(i.desc)[:120]} | {qs} | {_m(q(i.price))} | {_m(qty * q(i.price))} |")
    lines += ["", "| Summary | |", "|---|---:|", f"| Subtotal | {cur} {_m(sub)} |"]
    if disc:
        lines.append(f"| Discount | − {cur} {_m(disc)} |")
    if body.tax_rate:
        lines.append(f"| Tax ({body.tax_rate:g}%) | {cur} {_m(tax)} |")
    lines.append(f"| **{'Total paid' if kind == 'receipt' else 'Total due' if kind == 'invoice' else 'Total'}** | **{cur} {_m(total)}** |")
    if body.notes.strip():
        lines += ["", "**Notes**", "", body.notes.strip()[:2000]]
    lines += ["", "_Thank you for your business._"]
    import docgen
    fmt = "docx" if body.fmt == "docx" else "pdf"
    data = docgen.render("\n".join(lines), f"{title.title()} {number}", fmt)
    media = "application/pdf" if fmt == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return Response(content=data, media_type=media, headers={"Content-Disposition": f'attachment; filename="{number}.{fmt}"',
                                                             "X-Total": f"{total}", "X-Number": number})


# ── meeting notes ────────────────────────────────────────────────────────────
class MeetingIn(BaseModel):
    file_id: int
    title: str = ""


@router.post("/api/tools/meeting")
async def meeting(body: MeetingIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Recording of a meeting (audio or video) → transcript → notes with decisions and actions."""
    user = await get_current_user_from_cookie(request, db)
    from database import UploadedFile
    from files import UPLOAD_DIR
    f = await db.get(UploadedFile, body.file_id)
    if not f or f.user_id != user.id:
        raise HTTPException(status_code=404, detail="Recording not found")
    exe = _ffmpeg()
    if not exe:
        raise HTTPException(status_code=503, detail="Meeting notes aren't available on this server yet.")
    await _spend(user, db)
    src = _os.path.join(UPLOAD_DIR, f.stored_name)
    from router_ai import HEAVY_MODEL, _post
    import miniagent
    parts = []
    with _tmp.TemporaryDirectory() as td:
        # 10-minute pieces of 16 kHz mono MP3 — small enough to send, long enough to keep sentences whole.
        _sp.run([exe, "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-f", "segment", "-segment_time", "600",
                 _os.path.join(td, "p%03d.mp3")], capture_output=True, timeout=600)
        pieces = sorted(x for x in _os.listdir(td) if x.endswith(".mp3"))[:12]          # 2 hours at most
        if not pieces:
            raise HTTPException(status_code=422, detail="I couldn't find any sound in that recording.")
        for n, name in enumerate(pieces):
            b64 = _b64.b64encode(open(_os.path.join(td, name), "rb").read()).decode()
            data = await _post({"model": miniagent.AUDIO_MODEL, "max_tokens": 8000, "temperature": 0, "messages": [
                {"role": "system", "content": "Transcribe this part of a meeting recording accurately, in the language spoken. "
                                              "Start a new line whenever the speaker changes, labelled Speaker 1, Speaker 2… (or "
                                              "their name if it's said). No notes or commentary."},
                {"role": "user", "content": [{"type": "input_audio", "input_audio": {"data": b64, "format": "mp3"}}]}]}, timeout=240)
            t = ((((data or {}).get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
            parts.append(f"[{n * 10:02d}:00]\n{t}")
    transcript = "\n\n".join(parts).strip()
    if len(transcript) < 20:
        raise HTTPException(status_code=422, detail="I couldn't make out any speech in that recording.")
    data = await _post({"model": HEAVY_MODEL, "max_tokens": 3000, "temperature": 0.2, "messages": [
        {"role": "system", "content": "Write clear meeting notes from this transcript, in its language, in markdown: "
                                      "## Summary (4-6 sentences), ## Decisions (bullets), ## Action items (a checklist: '- [ ] who — what — by when' "
                                      "when said), ## Key points by topic, ## Open questions. Use only what was said; if names "
                                      "aren't known keep Speaker labels. Don't invent dates or owners."},
        {"role": "user", "content": transcript[:120000]}]}, timeout=180)
    notes = ((((data or {}).get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    return {"title": (body.title or f.filename or "Meeting")[:120], "notes": notes, "transcript": transcript[:200000]}


# ── rewards ──────────────────────────────────────────────────────────────────
@router.get("/api/tools/rewards")
async def rewards(request: Request, tz: str = "", db: AsyncSession = Depends(get_db)):
    """Badges and a level, worked out from what the person has done."""
    user = await get_current_user_from_cookie(request, db)
    from database import (Assistant, Canvas, ChatMember, Project, ScheduledJob, StudyDay, UsageLog)
    n_msgs = (await db.execute(select(_func.count()).select_from(Message).join(Chat, Chat.id == Message.chat_id)
                               .where(Chat.user_id == user.id, Message.role == "user"))).scalar() or 0
    n_days = (await db.execute(select(_func.count()).select_from(StudyDay).where(StudyDay.user_id == user.id))).scalar() or 0
    reviewed = (await db.execute(select(_func.sum(StudyDay.reviewed)).where(StudyDay.user_id == user.id))).scalar() or 0
    import study
    streak, _ = await study._streak(db, user.id, tz)
    n_proj = (await db.execute(select(_func.count()).select_from(Project).where(Project.user_id == user.id))).scalar() or 0
    n_asst = (await db.execute(select(_func.count()).select_from(Assistant).where(Assistant.user_id == user.id))).scalar() or 0
    n_canvas = (await db.execute(select(_func.count()).select_from(Canvas).where(Canvas.user_id == user.id))).scalar() or 0
    n_group = (await db.execute(select(_func.count()).select_from(Chat).where(Chat.user_id == user.id, Chat.is_group == True))).scalar() or 0  # noqa: E712
    n_group += (await db.execute(select(_func.count()).select_from(ChatMember).where(ChatMember.user_id == user.id))).scalar() or 0
    n_jobs = (await db.execute(select(_func.count()).select_from(ScheduledJob).where(ScheduledJob.user_id == user.id))).scalar() or 0
    n_img = (await db.execute(select(_func.count()).select_from(UsageLog).where(UsageLog.user_id == user.id, UsageLog.action.in_(("image", "image_gen"))))).scalar() or 0
    n_music = (await db.execute(select(_func.count()).select_from(UsageLog).where(UsageLog.user_id == user.id, UsageLog.action == "music"))).scalar() or 0
    spending = await get_data(db, user.id, "spending", {"entries": []}) or {"entries": []}
    budget = await get_data(db, user.id, "budget")
    try:
        from database import Referral
        n_inv = (await db.execute(select(_func.count()).select_from(Referral).where(Referral.referrer_id == user.id))).scalar() or 0
    except Exception:
        n_inv = 0
    B = [
        ("first", "👋", "Hello there", "Send your first message", n_msgs >= 1),
        ("chatty", "💬", "Chatterbox", "Send 100 messages", n_msgs >= 100),
        ("thousand", "🏆", "Regular", "Send 1,000 messages", n_msgs >= 1000),
        ("study1", "🎓", "Student", "Review your first flashcards", reviewed >= 1),
        ("study100", "🧠", "Memory master", "Review 100 flashcards", reviewed >= 100),
        ("streak3", "🔥", "On fire", "A 3-day study streak", streak >= 3),
        ("streak7", "🌟", "Week warrior", "A 7-day study streak", streak >= 7),
        ("streak30", "💎", "Unstoppable", "A 30-day study streak", streak >= 30),
        ("project", "📁", "Organised", "Create a project", n_proj >= 1),
        ("assistant", "🤖", "Inventor", "Make your own assistant", n_asst >= 1),
        ("canvas", "✍️", "Writer", "Work on a canvas", n_canvas >= 1),
        ("group", "👥", "Team player", "Chat together in a shared chat", n_group >= 1),
        ("jobs", "⏰", "On autopilot", "Set up a scheduled job", n_jobs >= 1),
        ("artist", "🎨", "Artist", "Create 10 pictures", n_img >= 10),
        ("music", "🎵", "Composer", "Make a piece of music", n_music >= 1),
        ("money", "💰", "Money-wise", "Plan a budget and track spending", bool(budget and budget.get("income")) and len(spending.get("entries", [])) > 0),
        ("friend", "🤝", "Good friend", "Invite a friend who joins", n_inv >= 1),
    ]
    earned = [b for b in B if b[4]]
    xp = n_msgs * 2 + reviewed + n_days * 10 + len(earned) * 50
    level, need = 1, 100
    left = xp
    while left >= need:
        left -= need
        level += 1
        need = int(need * 1.35)
    return {"badges": [{"id": b[0], "icon": b[1], "name": b[2], "how": b[3], "got": bool(b[4])} for b in B],
            "earned": len(earned), "total": len(B), "xp": xp, "level": level, "into": left, "need": need, "streak": streak}
