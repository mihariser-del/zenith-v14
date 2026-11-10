"""Small background helpers that feed the Vault: errors, app versions and
content-safety flags. All of them are fire-and-forget and never raise."""

import asyncio
import re
from datetime import datetime, timezone


def _bg(coro):
    try:
        asyncio.get_running_loop().create_task(coro)
    except Exception:
        pass


# ───────────────────────────────────────────── errors ──
async def _err(kind, message, path, user_id):
    try:
        from database import ErrorEvent, async_session
        async with async_session() as db:
            db.add(ErrorEvent(kind=kind[:20], message=str(message)[:2000], path=str(path or "")[:300], user_id=user_id))
            await db.commit()
    except Exception:
        pass


def log_error(kind: str, message, path: str = "", user_id=None):
    _bg(_err(kind, message, path, user_id))


# ─────────────────────────────────────── app versions ──
_UA_RE = re.compile(r"Zelpophai(Desktop|Android)/([\w.\-]+)")


def platform_from_ua(ua: str):
    m = _UA_RE.search(ua or "")
    if not m:
        return "web", ""
    return ("windows" if m.group(1) == "Desktop" else "android"), m.group(2)[:30]


async def _seen(user_id, platform, version):
    try:
        from sqlalchemy import select
        from database import ClientSeen, async_session
        async with async_session() as db:
            row = (await db.execute(select(ClientSeen).where(ClientSeen.user_id == user_id,
                                                             ClientSeen.platform == platform))).scalar_one_or_none()
            now = datetime.now(timezone.utc)
            if row:
                row.version, row.last_seen = version, now
            else:
                db.add(ClientSeen(user_id=user_id, platform=platform, version=version, last_seen=now))
            await db.commit()
    except Exception:
        pass


def client_seen(user_id, user_agent: str):
    if not user_id:
        return
    platform, version = platform_from_ua(user_agent)
    _bg(_seen(user_id, platform, version))


# ───────────────────────────────────── content safety ──
# Deliberately conservative patterns: they put a message in the staff review
# queue, they never block anything. Staff decide what happens next.
_PATTERNS = [
    ("self_harm", re.compile(r"\b(kill myself|end my life|want to die|suicid(e|al)|self[- ]harm|cut(ting)? myself|"
                             r"no reason to live|overdose on)\b", re.I)),
    ("violence", re.compile(r"\b(i('| a)?m going to|i will|gonna) (kill|shoot|stab|bomb|hurt) (him|her|them|you|my|the|everyone)\b|"
                            r"\b(make|build) (a )?(bomb|explosive|pipe bomb)\b|\bschool shooting\b", re.I)),
    ("sexual_minors", re.compile(r"\b(child|kid|minor|underage|\d{1,2} ?(yo|year[- ]old))\b.{0,40}\b(nude|naked|sex|porn|explicit)\b|"
                                 r"\b(nude|naked|sex|porn|explicit)\b.{0,40}\b(child|kid|minor|underage)\b", re.I)),
    ("hate", re.compile(r"\b(kill all|exterminate|gas the) (\w+ )?(jews|muslims|christians|blacks|whites|gays|immigrants)\b", re.I)),
]


def scan(text: str):
    t = (text or "")[:4000]
    for cat, rx in _PATTERNS:
        m = rx.search(t)
        if m:
            return cat, m
    return None, None


async def _flag(**kw):
    try:
        from database import ContentFlag, async_session
        async with async_session() as db:
            db.add(ContentFlag(**kw))
            await db.commit()
    except Exception:
        pass


def check_message(user_id, chat_id, message_id, text):
    cat, m = scan(text)
    if not cat:
        return
    s = max(0, m.start() - 80)
    excerpt = ("…" if s else "") + text[s:m.end() + 160].strip()
    _bg(_flag(kind="message", category=cat, user_id=user_id, chat_id=chat_id, message_id=message_id,
              excerpt=excerpt[:600], reason="Matched the " + cat.replace("_", " ") + " safety filter"))


def report_share(share_id, chat_id, owner_id, reason, excerpt=""):
    _bg(_flag(kind="share_report", category="report", user_id=owner_id, chat_id=chat_id, share_id=share_id,
              excerpt=(excerpt or "")[:600], reason=(reason or "Reported by a visitor")[:500]))
