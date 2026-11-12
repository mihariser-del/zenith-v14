"""Real email addresses for every account.

- check_email(): is the address properly formed, not a throw-away inbox, and can its domain receive mail?
- send_mail(): one place that sends email (Brevo over HTTPS, or SMTP).
- /api/auth/email/*: add or change your email. When email sending is set up the address is
  confirmed with a 6-digit code; until then a checked address is accepted ("checked").
- Everyone without a good email gets EMAIL_GRACE_DAYS days of "Later" (from sign-up for new accounts,
  from the first reminder for older ones); after that they must add one to keep chatting. At sign-up
  people can choose "add it later". Guests are not asked.

users.email_status:  ""  not checked yet · "checked"  passed the checks · "verified"  code confirmed
"""

import asyncio
import hashlib
import hmac
import os
import re
import secrets
import time
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import User, get_db

router = APIRouter(prefix="/api/auth/email", tags=["email"])

EMAIL_GRACE_DAYS = int(os.getenv("EMAIL_GRACE_DAYS", "7"))
# Accounts created before this moment are "existing" and get the grace period.
EMAIL_RULE_DATE = datetime(2026, 11, 12, tzinfo=timezone.utc)
CODE_MINUTES = 15
MAX_TRIES = 6

_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]{1,64}@([A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$")
# Inboxes that vanish after a few minutes, and obvious placeholders.
_THROWAWAY = {
    "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com", "10minutemail.net",
    "tempmail.com", "temp-mail.org", "tempmail.net", "throwawaymail.com", "yopmail.com", "yopmail.net", "trashmail.com",
    "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "fakeinbox.com", "mintemail.com", "mohmal.com",
    "emailondeck.com", "tempinbox.com", "moakt.com", "mailnesia.com", "spamgourmet.com", "burnermail.io", "mytemp.email",
    "tempail.com", "tmpmail.org", "tmpmail.net", "discard.email", "mail.tm", "inboxkitten.com", "guerrillamailblock.com",
}
_PLACEHOLDER = {"example.com", "example.org", "example.net", "test.com", "email.com", "mail.com", "guest.local",
                "localhost", "none.com", "no.com", "x.com", "a.com", "asdf.com", "fake.com", "noemail.com"}
_TYPOS = {"gmial.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com", "gmail.co": "gmail.com",
          "gmail.con": "gmail.com", "gnail.com": "gmail.com", "gmal.com": "gmail.com", "hotmial.com": "hotmail.com",
          "hotmai.com": "hotmail.com", "hotmail.con": "hotmail.com", "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com",
          "yahoo.con": "yahoo.com", "outlok.com": "outlook.com", "outloo.com": "outlook.com", "icloud.con": "icloud.com",
          "iclod.com": "icloud.com"}
_KNOWN_GOOD = {"gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com",
               "proton.me", "protonmail.com", "aol.com", "msn.com", "yahoo.co.uk", "ymail.com", "gmx.com", "zoho.com"}
_mx_cache: dict = {}
_hits: dict = {}


def _now():
    return datetime.now(timezone.utc)


def _utc(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _limit(key: str, limit: int, window: int):
    now = time.time()
    lst = [t for t in _hits.get(key, []) if now - t < window]
    if len(lst) >= limit:
        raise HTTPException(status_code=429, detail="Too many tries — please wait a few minutes and try again.")
    lst.append(now)
    _hits[key] = lst


def normalize(email: str) -> str:
    return (email or "").strip().lower()


def looks_real(email: str) -> bool:
    """Quick local check only (no network): shape, placeholder and throw-away domains."""
    e = normalize(email)
    if len(e) > 120 or not _EMAIL_RE.match(e) or ".." in e:
        return False
    dom = e.rsplit("@", 1)[1]
    return dom not in _PLACEHOLDER and dom not in _THROWAWAY and not dom.endswith(".local")


async def _domain_gets_mail(domain: str) -> bool | None:
    """True / False from a DNS lookup (MX, else A). None when the lookup itself failed."""
    if domain in _KNOWN_GOOD:
        return True
    hit = _mx_cache.get(domain)
    if hit and hit[0] > time.time():
        return hit[1]
    result = None
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            for rtype in ("MX", "A"):
                r = await c.get("https://dns.google/resolve", params={"name": domain, "type": rtype})
                if r.status_code != 200:
                    continue
                d = r.json()
                if d.get("Status") == 3:           # NXDOMAIN — the domain does not exist
                    result = False
                    break
                answers = [a for a in d.get("Answer", []) if a.get("type") in (15, 1)]
                if rtype == "MX" and any(str(a.get("data", "")).strip().endswith(" .") for a in answers):
                    result = False                 # "null MX": the domain says it takes no mail
                    break
                if answers:
                    result = True
                    break
                result = False
    except Exception:
        result = None
    if result is not None:
        _mx_cache[domain] = (time.time() + 6 * 3600, result)
    return result


async def check_email(email: str) -> tuple[bool, str]:
    """(ok, reason shown to the person)."""
    e = normalize(email)
    if not e:
        return False, "Please enter your email address."
    if len(e) > 120 or not _EMAIL_RE.match(e) or ".." in e:
        return False, "That doesn't look like an email address. It should look like name@gmail.com."
    dom = e.rsplit("@", 1)[1]
    if dom in _TYPOS:
        return False, f"Did you mean {e.rsplit('@', 1)[0]}@{_TYPOS[dom]}? Please check the spelling."
    if dom in _PLACEHOLDER or dom.endswith(".local"):
        return False, "Please use your own real email address."
    if dom in _THROWAWAY:
        return False, "Temporary email addresses can't be used. Please use your normal email (Gmail, Outlook, iCloud…)."
    got = await _domain_gets_mail(dom)
    if got is False:
        return False, f"We couldn't find the email provider “{dom}”. Please check the spelling."
    return True, ""


# ──────────────────────────────────────────────── sending ──
def mail_configured() -> bool:
    return bool(os.getenv("BREVO_API_KEY", "").strip() or os.getenv("SMTP_HOST", "").strip())


def mail_sender() -> str:
    return os.getenv("SMTP_FROM", "").strip() or os.getenv("SMTP_USER", "").strip() or ""


def _send_blocking(to_email: str, subject: str, body: str) -> tuple[bool, str]:
    api_key = os.getenv("BREVO_API_KEY", "").strip()
    sender = mail_sender()
    if api_key:
        if not sender:
            return False, "SMTP_FROM (the address emails are sent from) is not set"
        try:
            r = httpx.post("https://api.brevo.com/v3/smtp/email", timeout=15,
                           headers={"api-key": api_key, "Content-Type": "application/json"},
                           json={"sender": {"name": "Zelpophai AI", "email": sender}, "to": [{"email": to_email}],
                                 "subject": subject, "textContent": body})
            if r.status_code in (200, 201, 202):
                return True, ""
            try:
                msg = r.json().get("message") or r.text
            except Exception:
                msg = r.text
            return False, f"Brevo said: {str(msg)[:200]}"
        except Exception as e:
            return False, f"Could not reach Brevo ({type(e).__name__})"
    host = os.getenv("SMTP_HOST", "").strip()
    if not host:
        return False, "Email sending is not set up"
    import smtplib
    from email.message import EmailMessage
    port = int(os.getenv("SMTP_PORT", "587") or 587)
    user = os.getenv("SMTP_USER", "").strip()
    pw = os.getenv("SMTP_PASSWORD", "").strip()
    msg = EmailMessage()
    msg["From"] = f"Zelpophai AI <{sender or user}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=15) as s:
                if user:
                    s.login(user, pw)
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as s:
                s.ehlo()
                s.starttls()
                s.ehlo()
                if user:
                    s.login(user, pw)
                s.send_message(msg)
        return True, ""
    except Exception as e:
        return False, f"SMTP failed ({type(e).__name__})"


async def send_mail(to_email: str, subject: str, body: str) -> tuple[bool, str]:
    ok, why = await asyncio.to_thread(_send_blocking, to_email, subject, body)
    if not ok:
        print(f"[email] not sent to {to_email[:3]}***: {why}")
    return ok, why


def _hash_code(user_id: int, code: str) -> str:
    from database import settings
    return hmac.new(str(settings.secret_key).encode(), f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


# ──────────────────────────────────────────────── who needs one ──
def exempt(user) -> bool:
    return (user.username or "").startswith("guest_")


def has_good_email(user) -> bool:
    return (getattr(user, "email_status", "") or "") in ("checked", "verified")


def state(user) -> dict:
    """needs: should we ask · required: can't keep chatting without it."""
    if exempt(user):
        return {"needs": False, "required": False, "email": "", "status": "guest", "can_send": mail_configured()}
    status = getattr(user, "email_status", "") or ""
    good = status in ("checked", "verified")
    out = {"needs": not good, "required": False, "email": user.email if looks_real(user.email or "") else "",
           "status": status, "pending": getattr(user, "pending_email", "") or "", "can_send": mail_configured(),
           "grace_days": EMAIL_GRACE_DAYS, "deadline": None, "days_left": None}
    if good:
        return out
    # Everyone gets the same grace period. For accounts made after the rule it starts at sign-up
    # (they chose "add it later" or haven't typed their code yet); for older accounts it starts the
    # first time we ask.
    created = _utc(user.created_at) or _now()
    asked = _utc(getattr(user, "email_prompt_at", None)) or (created if created >= EMAIL_RULE_DATE else None)
    if asked:
        deadline = asked + timedelta(days=EMAIL_GRACE_DAYS)
        out["deadline"] = deadline.isoformat()
        left = (deadline - _now()).total_seconds()
        out["days_left"] = max(0, int(left // 86400) + (1 if left % 86400 else 0)) if left > 0 else 0
        out["required"] = left <= 0
    else:
        out["days_left"] = EMAIL_GRACE_DAYS
    if (getattr(user, "role", "") or "") == "owner":
        out["required"] = False                     # the Owner is asked but never locked out
    return out


def require_ok(user):
    """Call before letting someone send a message."""
    st = state(user)
    if st["required"]:
        raise HTTPException(status_code=403, detail="Please add your email address to keep using Zelpophai.",
                            headers={"X-Email-Required": "1"})


async def auto_check_existing(db, user) -> None:
    """An older account whose email already passes the checks doesn't need to be asked."""
    if exempt(user) or (getattr(user, "email_status", "") or ""):
        return
    if looks_real(user.email or ""):
        ok, _ = await check_email(user.email)
        if ok:
            user.email_status = "checked"
            await db.commit()


# ──────────────────────────────────────────────── endpoints ──
async def _me(request: Request, db: AsyncSession):
    from auth import get_current_user_from_cookie
    return await get_current_user_from_cookie(request, db)


@router.get("/status")
async def status(request: Request, db: AsyncSession = Depends(get_db)):
    user = await _me(request, db)
    await auto_check_existing(db, user)
    st = state(user)
    # The grace period starts the first time we ask.
    if st["needs"] and not st["required"] and not getattr(user, "email_prompt_at", None):
        user.email_prompt_at = _now()
        await db.commit()
        st = state(user)
    return st


async def _save_checked(db, user, email: str) -> dict:
    ghost = (await db.execute(select(User).where(func.lower(User.email) == email, User.id != user.id))).scalars().first()
    if ghost:   # a deleted account still holds it (emails are unique) — free it up
        ghost.email = f"deleted_{ghost.id}@deleted.local"
        await db.flush()
    user.email = email
    user.email_status = "checked"
    user.pending_email = ""
    await db.commit()
    return {"done": True, "sent": False, "status": "checked", "email": email}


class StartIn(BaseModel):
    email: str


@router.post("/start")
async def start(req: StartIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Step 1: give an address. Sends a code when email sending works; otherwise saves the checked address."""
    user = await _me(request, db)
    if exempt(user):
        raise HTTPException(status_code=403, detail="Create an account first.")
    _limit(f"em-start:{user.id}", 8, 3600)
    email = normalize(req.email)
    ok, why = await check_email(email)
    if not ok:
        raise HTTPException(status_code=400, detail=why)
    taken = (await db.execute(select(User).where(func.lower(User.email) == email, User.id != user.id,
                                                 User.is_deleted == False))).scalars().first()  # noqa: E712
    if taken:
        raise HTTPException(status_code=409, detail="That email is already used by another account. Log in to that account, or use a different email.")
    if not mail_configured():
        return await _save_checked(db, user, email)
    code = f"{secrets.randbelow(1_000_000):06d}"
    user.pending_email = email
    user.email_code_hash = _hash_code(user.id, code)
    user.email_code_expires = _now() + timedelta(minutes=CODE_MINUTES)
    user.email_code_tries = 0
    await db.commit()
    sent, why = await send_mail(email, f"{code} is your Zelpophai code",
                                f"Hi {user.username},\n\nYour Zelpophai AI confirmation code is:\n\n    {code}\n\n"
                                f"Type it into Zelpophai to confirm this email address. It works for {CODE_MINUTES} minutes.\n\n"
                                "If you didn't ask for this, you can ignore this email — nothing will change.\n\n— Zelpophai AI")
    if not sent:
        # Sending is set up but failed right now: don't block the person on our problem.
        user.email_code_hash = ""
        return await _save_checked(db, user, email)
    return {"done": False, "sent": True, "email": email, "minutes": CODE_MINUTES}


class ConfirmIn(BaseModel):
    code: str


@router.post("/confirm")
async def confirm(req: ConfirmIn, request: Request, db: AsyncSession = Depends(get_db)):
    user = await _me(request, db)
    _limit(f"em-confirm:{user.id}", 20, 3600)
    pending = getattr(user, "pending_email", "") or ""
    if not pending or not getattr(user, "email_code_hash", ""):
        raise HTTPException(status_code=400, detail="Ask for a new code first.")
    exp = _utc(user.email_code_expires)
    if not exp or exp < _now():
        raise HTTPException(status_code=400, detail="That code has expired. Ask for a new one.")
    if (user.email_code_tries or 0) >= MAX_TRIES:
        raise HTTPException(status_code=429, detail="Too many wrong codes. Ask for a new one.")
    code = re.sub(r"\D", "", req.code or "")
    if not hmac.compare_digest(_hash_code(user.id, code), user.email_code_hash):
        user.email_code_tries = (user.email_code_tries or 0) + 1
        await db.commit()
        left = MAX_TRIES - user.email_code_tries
        raise HTTPException(status_code=400, detail=f"That code isn't right. {left} tr{'y' if left == 1 else 'ies'} left.")
    taken = (await db.execute(select(User).where(func.lower(User.email) == pending, User.id != user.id))).scalars().first()
    if taken and not taken.is_deleted:
        raise HTTPException(status_code=409, detail="That email is already used by another account.")
    if taken:
        taken.email = f"deleted_{taken.id}@deleted.local"
        await db.flush()
    user.email = pending
    user.email_status = "verified"
    user.pending_email = ""
    user.email_code_hash = ""
    user.email_code_expires = None
    await db.commit()
    return {"done": True, "status": "verified", "email": user.email}


@router.post("/later")
async def later(request: Request, db: AsyncSession = Depends(get_db)):
    """'Later' during the grace period. Starts the clock the first time."""
    user = await _me(request, db)
    st = state(user)
    if st["required"]:
        raise HTTPException(status_code=403, detail="Your email is needed now to keep using Zelpophai.")
    if st["needs"] and not getattr(user, "email_prompt_at", None):
        user.email_prompt_at = _now()
        await db.commit()
    return state(user)
