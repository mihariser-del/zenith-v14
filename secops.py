"""The Vault's security helpers: readable sign-ins, blocked places, and a check-up.

Three jobs:

1. **Plain language.** A browser identifies itself with a line like
   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 …". Nobody
   should have to read that, so `describe_device()` turns it into
   "Chrome on Windows", and `describe_place()` turns an address into something
   like "Nigeria" or "this computer".

2. **Blocking.** A list of places that may not sign in, kept in the database so
   it survives a restart. `is_blocked()` is synchronous and cached because the
   login path calls it on every attempt.

3. **The check-up.** `checkup()` looks over the whole setup and reports what is
   safe and what needs attention, in words the Owner can act on.
"""

import ipaddress
import re
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from database import BlockedAddress

# ── settings keys ─────────────────────────────────────────────────────────────
AUTOBLOCK_ON = "security_autoblock"          # "on" / "off"
AUTOBLOCK_TRIES = "security_autoblock_tries"  # wrong passwords from one place
AUTOBLOCK_HOURS = "security_autoblock_hours"  # how long the block lasts
DEFAULT_TRIES = 15
DEFAULT_HOURS = 24

# ── blocked places ────────────────────────────────────────────────────────────
# {ip: expiry timestamp or None}. Reloaded from the database on every change and
# every few minutes, so the login path never has to touch the database.
_blocks: dict[str, float | None] = {}
_blocks_at = 0.0
_BLOCK_TTL = 120.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def is_blocked(ip: str) -> bool:
    """Is this place blocked? Called on every sign-in attempt, so it stays cheap."""
    if not ip:
        return False
    hit = _blocks.get(ip, False)
    if hit is False:
        return False
    if hit is None:          # never expires
        return True
    if time.time() < hit:
        return True
    _blocks.pop(ip, None)    # expired
    return False


async def load_blocks(db=None) -> int:
    """Read the block list into memory."""
    global _blocks, _blocks_at
    from database import async_session
    try:
        if db is not None:
            rows = (await db.execute(select(BlockedAddress))).scalars().all()
        else:
            async with async_session() as s:
                rows = (await s.execute(select(BlockedAddress))).scalars().all()
    except Exception as e:
        print(f"[secops] couldn't read the block list: {e}")
        return len(_blocks)
    fresh: dict[str, float | None] = {}
    for r in rows:
        u = _aware(r.until)
        if u is None:
            fresh[r.ip] = None
        elif u > _now():
            fresh[r.ip] = u.timestamp()
    _blocks, _blocks_at = fresh, time.time()
    return len(fresh)


async def maybe_refresh(db=None):
    if time.time() - _blocks_at > _BLOCK_TTL:
        await load_blocks(db)


async def block(db, ip: str, reason: str = "", by: str = "", hours: int | None = None,
                auto: bool = False, tries: int = 0) -> BlockedAddress:
    """Stop this place signing in. hours=None blocks it for good."""
    ip = (ip or "").strip()
    if not ip:
        raise ValueError("No address given.")
    until = _now() + timedelta(hours=hours) if hours else None
    row = (await db.execute(select(BlockedAddress).where(BlockedAddress.ip == ip))).scalar_one_or_none()
    if row:
        row.reason, row.added_by, row.until, row.auto = reason or row.reason, by or row.added_by, until, auto
        row.tries = tries or row.tries
    else:
        row = BlockedAddress(ip=ip, reason=reason, added_by=by, until=until, auto=auto, tries=tries)
        db.add(row)
    await db.commit()
    await load_blocks(db)
    return row


async def unblock(db, ip: str) -> bool:
    row = (await db.execute(select(BlockedAddress).where(BlockedAddress.ip == ip))).scalar_one_or_none()
    if not row:
        return False
    await db.delete(row)
    await db.commit()
    await load_blocks(db)
    return True


async def blocks(db) -> list[dict]:
    rows = (await db.execute(select(BlockedAddress).order_by(BlockedAddress.created_at.desc()))).scalars().all()
    out = []
    for r in rows:
        u = _aware(r.until)
        out.append({"ip": r.ip, "reason": r.reason or "", "by": r.added_by or "",
                    "auto": bool(r.auto), "tries": r.tries or 0,
                    "at": _aware(r.created_at).isoformat() if r.created_at else "",
                    "until": u.isoformat() if u else "",
                    "expired": bool(u and u <= _now()),
                    "place": describe_place(r.ip)})
    return out


async def settings_of(db) -> dict:
    from global_controls import _get_setting
    on = (await _get_setting(db, AUTOBLOCK_ON, "on") or "on") == "on"
    try:
        tries = int(await _get_setting(db, AUTOBLOCK_TRIES, str(DEFAULT_TRIES)) or DEFAULT_TRIES)
    except (TypeError, ValueError):
        tries = DEFAULT_TRIES
    try:
        hours = int(await _get_setting(db, AUTOBLOCK_HOURS, str(DEFAULT_HOURS)) or DEFAULT_HOURS)
    except (TypeError, ValueError):
        hours = DEFAULT_HOURS
    return {"on": on, "tries": max(3, min(1000, tries)), "hours": max(1, min(24 * 365, hours))}


async def note_failure(db, ip: str) -> bool:
    """Count a wrong password and block the place if it has had far too many.

    Returns True if this attempt tipped it over into a block.
    """
    if not ip or is_blocked(ip):
        return False
    cfg = await settings_of(db)
    if not cfg["on"]:
        return False
    from sqlalchemy import func
    from database import LoginHistory
    since = _now() - timedelta(hours=24)
    n = (await db.execute(
        select(func.count(LoginHistory.id)).where(
            LoginHistory.ip_address == ip, LoginHistory.success.is_(False), LoginHistory.login_at >= since)
    )).scalar() or 0
    if n < cfg["tries"]:
        return False
    await block(db, ip, reason=f"{n} wrong passwords in a day", by="Zelpophai",
                hours=cfg["hours"], auto=True, tries=int(n))
    return True


# ── plain language ────────────────────────────────────────────────────────────
_BROWSERS = [
    ("Zelpophai app", r"Zelpophai|ZenithApp|Electron"),
    ("Samsung Internet", r"SamsungBrowser"),
    ("Opera", r"\bOPR\b|Opera"),
    ("Microsoft Edge", r"\bEdge?[gAI]?\b|Edg/"),
    ("Firefox", r"Firefox|FxiOS"),
    ("Chrome", r"Chrome|CriOS|HeadlessChrome"),
    ("Safari", r"Safari"),
]
_SYSTEMS = [
    ("iPhone", r"iPhone"),
    ("iPad", r"iPad"),
    ("Android", r"Android"),
    ("Windows", r"Windows"),
    ("Mac", r"Mac OS X|Macintosh"),
    ("Linux", r"Linux|X11"),
]


def describe_device(ua: str) -> str:
    """"Mozilla/5.0 (Windows NT 10.0…" → "Chrome on Windows"."""
    s = ua or ""
    if not s.strip():
        return "Unknown device"
    if re.search(r"bot|crawler|spider|curl|python-requests|wget", s, re.I):
        return "A robot or script"
    browser = next((name for name, pat in _BROWSERS if re.search(pat, s, re.I)), "")
    system = next((name for name, pat in _SYSTEMS if re.search(pat, s, re.I)), "")
    if browser and system:
        return f"{browser} on {system}"
    return browser or system or "Unknown device"


def device_kind(ua: str) -> str:
    """phone / tablet / computer — for picking an icon."""
    s = ua or ""
    if re.search(r"iPhone|Android.*Mobile|Windows Phone", s, re.I):
        return "phone"
    if re.search(r"iPad|Tablet|Android", s, re.I):
        return "tablet"
    return "computer"


_HOME_NETS = [ipaddress.ip_network(n) for n in (
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8",
    "169.254.0.0/16", "::1/128", "fc00::/7", "fe80::/10")]


def _private(ip: str) -> bool:
    """Loopback or a home/office network. Python also calls the documentation
    ranges (203.0.113.x and friends) private, which would be misleading here."""
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(a in n for n in _HOME_NETS if a.version == n.version)


def is_local(ip: str) -> bool:
    """Your own machine or your own network — never worth offering to block."""
    return not ip or _private(ip)


# Looked up once per address and remembered, so a busy page costs nothing.
_places: dict[str, str] = {}


def describe_place(ip: str) -> str:
    """A country name when we know it, otherwise something honest."""
    if not ip:
        return "Unknown place"
    if _private(ip):
        return "This computer or your own network"
    return _places.get(ip, "")


async def learn_places(ips) -> None:
    """Look up the countries we don't know yet. Fails quietly — it is a nicety."""
    todo = [ip for ip in dict.fromkeys(ips) if ip and ip not in _places and not _private(ip)][:40]
    if not todo:
        return
    try:
        import httpx
    except Exception:
        return
    try:
        async with httpx.AsyncClient(timeout=4) as c:
            # One request for the whole batch, so a busy page is still one call.
            r = await c.post("http://ip-api.com/batch?fields=status,country,query",
                             json=[{"query": ip} for ip in todo])
            if r.status_code != 200:
                raise RuntimeError(r.status_code)
            for row in r.json() or []:
                if isinstance(row, dict) and row.get("status") == "success" and row.get("query"):
                    _places[row["query"]] = row.get("country") or ""
    except Exception:
        # No internet, rate limited, whatever: addresses simply stay unnamed.
        for ip in todo:
            _places.setdefault(ip, "")


# ── the check-up ──────────────────────────────────────────────────────────────
def _item(key, title, state, detail, fix=None, href=None):
    return {"key": key, "title": title, "state": state, "detail": detail, "fix": fix, "href": href}


async def checkup(db) -> dict:
    """Look over the whole setup and say what is safe and what needs attention.

    state is "good", "warn" (worth doing) or "bad" (fix this).
    """
    from sqlalchemy import func, or_
    from database import User, LoginHistory
    from global_controls import _get_setting

    items = []

    # 1. Can Zelpophai answer at all?
    try:
        import aikeys
        st = await aikeys.status(db)
        if st.get("working"):
            items.append(_item("aikey", "The AI key is working", "good", "Zelpophai can answer messages."))
        elif st.get("count"):
            items.append(_item("aikey", "The AI key is being refused", "bad",
                               st.get("error") or "OpenRouter isn't accepting the key.", "Fix the key", "#/settings"))
        else:
            items.append(_item("aikey", "No AI key is set", "bad",
                               "Zelpophai can't answer anyone until you add one.", "Add a key", "#/settings"))
    except Exception:
        pass

    # 2. Can you get back in if you forget your password?
    owner = (await db.execute(select(User).where(User.role == "owner"))).scalars().first()
    if owner is not None:
        if (owner.email or "").strip():
            items.append(_item("owneremail", "Your account has an email address", "good",
                               "If you're ever locked out, a reset can reach you."))
        else:
            items.append(_item("owneremail", "Your account has no email address", "bad",
                               "If you forget your password there is no way to reset it. Add one in Zelpophai → Settings → Account.",
                               "Open Zelpophai", "/app"))

    try:
        em_ok = bool((await _get_setting(db, "brevo_api_key", "")) or __import__("os").getenv("BREVO_API_KEY"))
    except Exception:
        em_ok = False
    items.append(_item("email", "Password-reset emails can be sent" if em_ok else "Password-reset emails can't be sent",
                       "good" if em_ok else "warn",
                       "Email sending is set up." if em_ok else "Nobody — including you — can reset a forgotten password by email yet.",
                       None if em_ok else "Set up email", None if em_ok else "#/settings"))

    # 3. Admins
    admins = (await db.execute(select(User).where(User.role == "admin", User.is_deleted.is_(False)))).scalars().all()
    if not admins:
        items.append(_item("admins", "You have no other admins", "good", "Only you can open the Vault."))
    else:
        import perms
        forever = [a for a in admins if not (perms.extras(a) or {}).get("until")]
        trusted = [a for a in admins if "trusted" in (a.tags or "").lower()]
        if forever:
            items.append(_item("adminend", f"{len(forever)} admin{'s' if len(forever) > 1 else ''} with no end date", "warn",
                               "They stay admins until you remove them by hand. An end date removes the role by itself: "
                               + ", ".join("@" + a.username for a in forever[:5]) + ".",
                               "Set end dates", "#/staff"))
        else:
            items.append(_item("adminend", "Every admin has an end date", "good", "Their access removes itself when it expires."))
        if trusted:
            items.append(_item("trusted", f"{len(trusted)} Trusted admin{'s' if len(trusted) > 1 else ''}", "warn",
                               "Trusted admins can do everything you can, with no limits: "
                               + ", ".join("@" + a.username for a in trusted[:5]) + ".",
                               "Review them", "#/staff"))

    # 4. Is anything emergency-ish left switched on?
    locked = await _get_setting(db, "locked", "off")
    maint = await _get_setting(db, "maintenance_mode", "off")
    if locked == "on":
        items.append(_item("locked", "Every account is locked", "bad",
                           "Nobody but you and your helpers can sign in. Did you mean to leave this on?", "Unlock", "#/security"))
    if maint == "on":
        items.append(_item("maint", "Maintenance mode is on", "warn",
                           "Everyone except staff sees the maintenance screen.", "Turn it off", "#/security"))

    # 5. Wrong passwords lately
    since = _now() - timedelta(hours=24)
    failed = (await db.execute(select(func.count(LoginHistory.id)).where(
        LoginHistory.success.is_(False), LoginHistory.login_at >= since))).scalar() or 0
    if failed > 50:
        items.append(_item("failed", f"{failed} wrong passwords in the last day", "bad",
                           "That's a lot. Someone may be guessing. Check the Sign-ins tab and block the place."))
    elif failed > 10:
        items.append(_item("failed", f"{failed} wrong passwords in the last day", "warn",
                           "Higher than usual. Worth a look in the Sign-ins tab."))
    else:
        items.append(_item("failed", "No unusual sign-in activity", "good",
                           f"{failed} wrong password{'s' if failed != 1 else ''} in the last day."))

    # 6. Automatic blocking
    cfg = await settings_of(db)
    items.append(_item("autoblock", "Automatic blocking is on" if cfg["on"] else "Automatic blocking is off",
                       "good" if cfg["on"] else "warn",
                       f"A place that gets {cfg['tries']} passwords wrong in a day is blocked for {cfg['hours']} hours."
                       if cfg["on"] else "Someone can keep guessing passwords all day without being stopped.",
                       None if cfg["on"] else "Turn it on"))

    # 7. Backups
    newest = None
    try:
        from vault_jobs import list_backups
        for b in list_backups() or []:
            t = b.get("created") or b.get("at") or b.get("mtime")
            if isinstance(t, (int, float)):
                t = datetime.fromtimestamp(t, timezone.utc)
            elif isinstance(t, str):
                try:
                    t = datetime.fromisoformat(t.replace("Z", "+00:00"))
                except ValueError:
                    t = None
            t = _aware(t)
            if t and (newest is None or t > newest):
                newest = t
    except Exception:
        newest = None
    if newest is None:
        items.append(_item("backup", "No backup has been made yet", "warn",
                           "If anything goes wrong there is nothing to restore from.", "Make one", "#/backups"))
    else:
        age = (_now() - newest).days
        if age <= 2:
            items.append(_item("backup", "Backups are recent", "good",
                               "The last one was " + ("today." if age == 0 else f"{age} day{'s' if age > 1 else ''} ago.")))
        else:
            items.append(_item("backup", f"The last backup is {age} days old", "warn",
                               "Worth making a fresh one.", "Make one", "#/backups"))

    # 8. People with no email (they can't recover their own accounts)
    no_email = (await db.execute(select(func.count(User.id)).where(
        User.is_deleted.is_(False), or_(User.email.is_(None), User.email == "")))).scalar() or 0
    if no_email:
        items.append(_item("noemail", f"{no_email} {'person has' if no_email == 1 else 'people have'} no email address", "warn",
                           "They can't reset their own password if they forget it.", "See who", "#/users"))

    score = {"good": 0, "warn": 0, "bad": 0}
    for i in items:
        score[i["state"]] += 1
    return {"items": items, "counts": score,
            "state": "bad" if score["bad"] else ("warn" if score["warn"] else "good")}
