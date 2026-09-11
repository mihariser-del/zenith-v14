from datetime import datetime, timedelta, timezone
import os
import secrets
import time
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError, jwt
from pydantic import BaseModel

from database import (
    User,
    LoginHistory,
    get_db,
    settings,
    encrypt_pending_password,
    decrypt_pending_password,
    random_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

ALGORITHM = "HS256"
TOKEN_EXPIRY_HOURS = 720  # 30 days

# ---------------------------------------------------------------- passwords

def generate_token(num_bytes: int = 32) -> str:
    return secrets.token_urlsafe(num_bytes)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


# ---------------------------------------------------------------- session cookie

def set_auth_cookie(response: Response, token: str, request: Request = None):
    """Set the zenith_token cookie with secure=True except on localhost dev."""
    secure = True
    if request is not None:
        host = (request.url.hostname or "").lower()
        if host in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
            secure = False
    response.set_cookie(
        key="zenith_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=secure,
        max_age=TOKEN_EXPIRY_HOURS * 3600,
    )


# ---------------------------------------------------------------- brute-force protection
# In-memory sliding-window failure tracker (fine for a single-instance deploy on Railway).
_rate: dict = {}
_RATE_WINDOW = 600  # seconds


def _prune(key: str, window: int):
    now = time.time()
    lst = _rate.setdefault(key, [])
    while lst and now - lst[0] > window:
        lst.pop(0)
    return lst


def _record_failure(key: str, window: int = _RATE_WINDOW):
    _prune(key, window).append(time.time())


def _clear_failures(key: str):
    _rate.pop(key, None)


def _raise_if_locked(key: str, limit: int, window: int = _RATE_WINDOW):
    lst = _prune(key, window)
    if len(lst) >= limit:
        wait = max(1, int(window - (time.time() - lst[0])) + 1)
        raise HTTPException(
            status_code=429,
            detail=f"Too many attempts. Try again in about {wait // 60} minute(s) {wait % 60}s.",
            headers={"Retry-After": str(wait)},
        )


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _server_fingerprint(request: Request) -> str:
    """Server-side device fingerprint that farming can't dodge by clearing
    localStorage/incognito. Client-supplied device_ids are optional and fully
    spoofable, so an invite registration is ALWAYS pinned to the network it came
    from (IP + User-Agent). Same network reusing a second invite link is blocked."""
    import hashlib
    ip = _client_ip(request)
    ua = request.headers.get("user-agent", "") or ""
    raw = f"{ip}|{ua.strip().lower()}"
    return "net_" + hashlib.sha256(raw.encode("utf-8", "ignore")).hexdigest()[:40]


# ---------------------------------------------------------------- password reset email

def _send_email_brevo(to_email: str, link: str) -> bool:
    """Send via Brevo (Sendinblue) REST API over HTTPS (port 443).
    Works on Railway, unlike direct SMTP which is blocked."""
    api_key = os.getenv("BREVO_API_KEY", "").strip()
    if not api_key:
        print("[forgot-password] BREVO_API_KEY not set")
        return False
    import urllib.request
    import json
    sender = os.getenv("SMTP_FROM", "").strip() or "wanzu934@gmail.com"
    payload = {
        "sender": {"name": "Quolvex", "email": sender},
        "to": [{"email": to_email}],
        "subject": "Quolvex — password reset",
        "textContent": (
            f"Someone requested a password reset for your Quolvex account.\n\n"
            f"Open this link to choose a new password (expires in 30 minutes):\n{link}\n\n"
            f"If you didn't request this, you can ignore this email."
        ),
    }
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "api-key": api_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            status = resp.getcode()
            print(f"[forgot-password] Brevo email sent to {to_email} (status {status})")
            return status == 201
    except Exception as e:
        print(f"[forgot-password] Brevo email FAILED: {type(e).__name__}: {e}")
        return False


def _send_reset_email(to_email: str, link: str) -> bool:
    # Prefer Brevo (HTTPS) — Railway blocks outbound SMTP (port 587/465).
    if _send_email_brevo(to_email, link):
        return True

    host = os.getenv("SMTP_HOST", "").strip()
    if not host:
        print("[forgot-password] SMTP_HOST not set — skipping email")
        return False
    port = int(os.getenv("SMTP_PORT", "587") or 587)
    user = os.getenv("SMTP_USER", "").strip()
    pw = os.getenv("SMTP_PASSWORD", "").strip()
    sender = os.getenv("SMTP_FROM", "").strip() or user or "no-reply@zenith.local"
    subject = "Quolvex — password reset"
    body = (
        f"Someone requested a password reset for your Quolvex account.\n\n"
        f"Open this link to choose a new password (expires in 30 minutes):\n{link}\n\n"
        f"If you didn't request this, you can ignore this email."
    )
    msg = f"From: Quolvex <{sender}>\r\nTo: {to_email}\r\nSubject: {subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{body}"
    import smtplib
    import socket
    # Force IPv4: Railway containers have no IPv6 route, so Python's default
    # getaddrinfo (which prefers IPv6) fails with "Network is unreachable".
    orig_getaddrinfo = socket.getaddrinfo
    def _ipv4_getaddrinfo(*args, **kwargs):
        args = list(args)
        args[2] = socket.AF_INET
        return orig_getaddrinfo(*args, **kwargs)
    socket.getaddrinfo = _ipv4_getaddrinfo
    try:
        print(f"[forgot-password] Connecting to {host}:{port} as {user}...")
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=15) as s:
                if user:
                    s.login(user, pw)
                s.sendmail(sender, [to_email], msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as s:
                s.ehlo()
                s.starttls()
                s.ehlo()
                if user:
                    s.login(user, pw)
                s.sendmail(sender, [to_email], msg)
        print(f"[forgot-password] Email sent successfully to {to_email}")
        return True
    except Exception as e:
        print(f"[forgot-password] email delivery FAILED: {type(e).__name__}: {e}")
        return False
    finally:
        socket.getaddrinfo = orig_getaddrinfo


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    invite_token: str = ""
    device_id: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


class ForgotRequest(BaseModel):
    username: str
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_admin: bool
    is_banned: bool = False
    ban_reason: str = ""
    is_deleted: bool = False
    role: str = "user"
    banned_by: str = ""
    deleted_by: str = ""
    pending_password_by: str = ""
    permissions: str = ""
    pending_notification: str = ""
    is_chosen: bool = False
    display_name: str = ""
    is_pro: bool = False
    is_ultimate: bool = False

    model_config = {"from_attributes": True}


class AdminResetRequest(BaseModel):
    new_password: str


class AdminBanRequest(BaseModel):
    reason: str = ""


def create_token(user_id: int, username: str, is_admin: bool, token_version: int = 0, role: str = "") -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRY_HOURS)
    return jwt.encode(
        {"sub": str(user_id), "username": username, "is_admin": is_admin, "role": role, "ver": token_version, "exp": expire},
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_role(user) -> str:
    """Return the effective role of a user. Owner is supreme."""
    owned = getattr(user, "role", "") or ""
    if owned == "owner":
        return "owner"
    # if is_admin and role set to user (legacy), treat as admin
    if owned == "admin" or (user.is_admin and owned in ("user", "")):
        return "admin"
    return "user"


def is_owner(user) -> bool:
    return get_role(user) == "owner"


def is_staff(user) -> bool:
    """admin or owner"""
    return user.is_admin or is_owner(user)


def _role_label(role: str) -> str:
    if role == "owner": return "The Owner"
    return "an administrator"


async def get_current_user_from_cookie(request: Request, db: AsyncSession) -> User:
    token = request.cookies.get("zenith_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    sub = payload.get("sub")
    if sub is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if getattr(user, "is_banned", False):
        banned_by = getattr(user, "banned_by", "") or ""
        raise HTTPException(status_code=403, detail=f"Account banned. Reason: {getattr(user, 'ban_reason', '') or 'No reason provided'} Banned by: {banned_by or 'admin'}")
    if getattr(user, "is_deleted", False):
        deleted_by = getattr(user, "deleted_by", "") or ""
        raise HTTPException(status_code=404, detail=f"Account deleted. Deleted by: {deleted_by or 'admin'}")
    # token version check (logout-all)
    token_ver = payload.get("ver", 0)
    user_ver = getattr(user, "token_version", 0) or 0
    if token_ver != user_ver:
        raise HTTPException(status_code=401, detail="Session expired. Please login again.")
    return user


@router.post("/register")
async def register(req: RegisterRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    # Brute-force / abuse protection: per-IP, 10 registrations per hour.
    _raise_if_locked(f"register:{_client_ip(request)}", limit=10, window=3600)
    # Respect global registration toggle
    try:
        from sqlalchemy import text
        res = await db.execute(text("SELECT value FROM system_settings WHERE key='registrations'"))
        row = res.fetchone()
        if row and row[0] == "off":
            raise HTTPException(status_code=403, detail="Registration is currently disabled by the Owner")
    except HTTPException:
        raise
    except Exception:
        pass
    if len(req.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    from database import UsedDevice
    device_id = (req.device_id or "").strip()
    has_invite = bool((req.invite_token or "").strip() or request.cookies.get("zenith_invite_token", "").strip())
    # A device that already joined Quolvex can never consume another invite link.
    # The client-supplied device_id is easy to spoof/rotate (incognito, cleared
    # storage), so we ALSO pin the network fingerprint server-side — a second
    # invite registration from the same network/IP+UA is blocked regardless.
    if has_invite:
        if device_id:
            dev_result = await db.execute(
                select(UsedDevice).where(UsedDevice.device_id == device_id)
            )
            prior = dev_result.scalar_one_or_none()
            if prior:
                raise HTTPException(status_code=403, detail="This device already joined Quolvex")
        net_fp = _server_fingerprint(request)
        if net_fp:
            net_result = await db.execute(
                select(UsedDevice).where(
                    UsedDevice.ip_fp == net_fp,
                    UsedDevice.source == "invite",
                )
            )
            prior_net = net_result.scalar_one_or_none()
            if prior_net:
                raise HTTPException(status_code=403, detail="This network already joined Quolvex")

    existing = await db.execute(
        select(User).where((User.username == req.username) | (User.email == req.email))
    )
    existing_user = existing.scalar_one_or_none()
    # Allow reusing a username/email that belongs to a soft-deleted account by reactivating it.
    # This matches the expectation that deleting an account frees up its name/email.
    if existing_user:
        if existing_user.is_deleted:
            # Only reactivate if it's the SAME account holding BOTH the username and email
            # (i.e. no other active account owns these). Otherwise fail cleanly.
            conflict = await db.execute(
                select(User).where(
                    (User.username == req.username) | (User.email == req.email),
                    User.is_deleted == False
                )
            )
            if conflict.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Username or email already exists")
            existing_user.username = req.username
            existing_user.email = req.email
            existing_user.password_hash = hash_password(req.password)
            existing_user.is_deleted = False
            existing_user.deleted_by = ""
            existing_user.is_banned = False
            existing_user.ban_reason = ""
            existing_user.banned_by = ""
            existing_user.token_version = 0
            existing_user.pending_password = ""
            existing_user.pending_password_by = ""
            await db.commit()
            return {"message": "Account reactivated"}
        raise HTTPException(status_code=409, detail="Username or email already exists")

    user = User(
        username=req.username,
        email=req.email,
        password_hash=hash_password(req.password),
    )
    db.add(user)
    await db.flush()  # Get user.id for referral tracking

    # Record the fingerprint so this device/network can't farm future invite links.
    # Keep the FIRST association — a device that later registers again normally
    # (no invite) doesn't overwrite who the device is bound to.
    if device_id or has_invite:
        from sqlalchemy.dialects.sqlite import insert as sqlite_insert
        await db.execute(
            sqlite_insert(UsedDevice)
            .values(
                device_id=(device_id or _server_fingerprint(request)),
                user_id=user.id,
                username=user.username,
                source="invite" if has_invite else "landing",
                ip=_client_ip(request),
                ip_fp=_server_fingerprint(request),
            )
            .on_conflict_do_nothing(index_elements=["device_id"])
        )

    # ── Referral tracking via invite token ────────────────────────────────
    # The token is consumed on EVERY registration that carries it — including
    # self-referrals and registrations from a different device that already
    # visited the link — so a single invite link can never be replayed to
    # farm accounts.
    from database import InviteToken, Referral
    import secrets as _secrets
    invite_token = (req.invite_token or "").strip()
    if not invite_token:
        invite_token = request.cookies.get("zenith_invite_token", "").strip()
    invite = None
    if invite_token:
        token_result = await db.execute(
            select(InviteToken).where(InviteToken.token == invite_token, InviteToken.used == False)
        )
        invite = token_result.scalar_one_or_none()
        if invite:
            invite.used = True
            invite.used_by_user_id = user.id
            invite.used_by_username = user.username
            invite.used_at = datetime.now(timezone.utc)
    if invite and invite.referrer_id != user.id:
        # Create referral record
        referral = Referral(
            referrer_id=invite.referrer_id,
            referred_username=user.username,
            referred_user_id=user.id,
        )
        db.add(referral)
        await db.flush()
        # Auto-generate new invite token for the referrer
        new_token = InviteToken(
            token=_secrets.token_urlsafe(32),
            referrer_id=invite.referrer_id,
        )
        db.add(new_token)
        # Check if referrer now has 5+ pending referrals → auto-grant Pro
        from sqlalchemy import func, update as _update
        ref_result = await db.execute(select(User).where(User.id == invite.referrer_id))
        referrer = ref_result.scalar_one_or_none()
        if referrer and not referrer.username.startswith("guest_"):
            count_result = await db.execute(
                select(func.count()).where(Referral.referrer_id == referrer.id, Referral.rewarded == False)
            )
            pending = count_result.scalar() or 0
            if pending >= 5:
                now = datetime.now(timezone.utc)
                if getattr(referrer, "is_pro", False) and getattr(referrer, "trial_end", None):
                    te = referrer.trial_end
                    if te.tzinfo is None:
                        te = te.replace(tzinfo=timezone.utc)
                    if te > now:
                        referrer.trial_end = te + timedelta(days=3)
                    else:
                        referrer.trial_end = now + timedelta(days=3)
                else:
                    referrer.is_pro = True
                    referrer.pro_plan = "referral_pro"
                    referrer.trial_end = now + timedelta(days=3)
                await db.execute(
                    _update(Referral).where(
                        Referral.referrer_id == referrer.id,
                        Referral.rewarded == False
                    ).values(rewarded=True)
                )

    await db.commit()

    # Auto-login: sign the session in immediately so the invite flow lands
    # straight inside the app instead of bouncing back to the landing page.
    token = create_token(user.id, user.username, user.is_admin, getattr(user, "token_version", 0) or 0, get_role(user))
    set_auth_cookie(response, token, request)
    response.delete_cookie("zenith_invite_token")
    return {"message": "Account created", "user": UserResponse.model_validate(user)}


@router.post("/login")
async def login(req: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    ip = _client_ip(request)
    user_key = f"login:user:{req.username.lower()}"
    ip_key = f"login:ip:{ip}"
    result = await db.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()
    ua = request.headers.get("user-agent", "")[:500]

    if not user or not verify_password(req.password, user.password_hash):
        if user:
            db.add(LoginHistory(user_id=user.id, ip_address=ip, user_agent=ua, success=False))
            await db.commit()
        _record_failure(user_key)
        _record_failure(ip_key)
        _raise_if_locked(user_key, limit=5)
        _raise_if_locked(ip_key, limit=20)
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if getattr(user, 'is_deleted', False):
        raise HTTPException(status_code=404, detail="Account deleted.")
    if getattr(user, 'is_banned', False):
        raise HTTPException(status_code=403, detail=f"Account banned. Reason: {user.ban_reason or 'No reason provided'}")
    # Maintenance mode: only the Owner and chosen helpers can log in
    is_chosen = getattr(user, "is_chosen", False) or False
    if get_role(user) != "owner" and not is_chosen:
        try:
            from sqlalchemy import text
            res = await db.execute(text("SELECT value FROM system_settings WHERE key='maintenance_mode'"))
            row = res.fetchone()
            if row and row[0] == "on":
                raise HTTPException(status_code=503, detail="Platform under maintenance. Only the Owner can access right now.")
        except HTTPException:
            raise
        except Exception:
            pass

    # Successful login clears any accumulated failure counters.
    _clear_failures(user_key)
    _clear_failures(ip_key)
    db.add(LoginHistory(user_id=user.id, ip_address=ip, user_agent=ua, success=True))
    user.last_seen = datetime.now(timezone.utc)
    await db.commit()

    token = create_token(user.id, user.username, user.is_admin, getattr(user, "token_version", 0) or 0, get_role(user))
    set_auth_cookie(response, token, request)
    return {"user": UserResponse.model_validate(user)}


@router.post("/forgot-password")
async def forgot_password(req: ForgotRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # SECURITY: no longer resets the password directly on username+email knowledge.
    # A one-time token (with expiry) is issued and delivered via email (or server log
    # when SMTP is not configured) — an attacker who knows only the username/email
    # can no longer take the account over.
    ip = _client_ip(request)
    _raise_if_locked(f"forgot:ip:{ip}", limit=5, window=900)
    _record_failure(f"forgot:ip:{ip}")
    result = await db.execute(
        select(User).where(User.username == req.username, User.email == req.email)
    )
    user = result.scalar_one_or_none()
    # Generic reply regardless of whether the account exists (no account enumeration).
    generic = "If an account matches, a password reset link has been sent to that email."
    if not user:
        return {"message": generic}
    if getattr(user, "is_deleted", False):
        return {"message": generic}
    _raise_if_locked(f"forgot:user:{req.username.lower()}", limit=3, window=900)
    _record_failure(f"forgot:user:{req.username.lower()}")
    token = generate_token(32)
    user.reset_token = token
    user.reset_token_expires = datetime.now(timezone.utc) + timedelta(minutes=30)
    await db.commit()
    host = request.base_url.hostname or "localhost"
    scheme = request.url.scheme if request.url.scheme == "https" else ("https" if host not in ("localhost", "127.0.0.1") else "http")
    link = f"{scheme}://{host}/?reset_token={token}"
    sent = _send_reset_email(user.email, link)
    if not sent:
        print(f"[forgot-password] Reset link for '{user.username}' (email delivery failed - relay it manually): {link}")
    return {"message": generic}


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    if not req.token.strip():
        raise HTTPException(status_code=400, detail="Reset token missing")
    result = await db.execute(select(User).where(User.reset_token == req.token.strip()))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or already-used reset token")
    expires = getattr(user, "reset_token_expires", None)
    if not expires:
        raise HTTPException(status_code=400, detail="Invalid or already-used reset token")
    try:
        exp = expires if expires.tzinfo else expires.replace(tzinfo=timezone.utc)
    except Exception:
        exp = expires
    if datetime.now(timezone.utc) > exp:
        raise HTTPException(status_code=400, detail="Reset token has expired. Request a new one.")
    user.password_hash = hash_password(req.new_password)
    user.reset_token = ""
    user.reset_token_expires = None
    await db.commit()
    return {"message": "Password reset successful. Please login with your new password."}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("zenith_token")
    return {"message": "Logged out"}


@router.post("/logout-all")
async def logout_all(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if user.username.startswith("guest_"):
        raise HTTPException(status_code=403, detail="Guests cannot use this")
    ver = getattr(user, "token_version", 0) or 0
    user.token_version = ver + 1
    await db.commit()
    # issue new token for current session so it stays valid
    new_token = create_token(user.id, user.username, user.is_admin, user.token_version, get_role(user))
    set_auth_cookie(response, new_token, request)
    return {"message": "Logged out of all other devices"}


@router.post("/emergency-password")
async def owner_emergency_password(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Owner panic button. If the owner password is leaked/compromised:
    rotate it to a fresh random 13-char value, wipe any queued password reset,
    and instantly invalidate every OTHER signed-in session (only this one
    survives, by re-issuing a token with the new version)."""
    user = await get_current_user_from_cookie(request, db)
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    new_pw = random_password(13)
    user.password_hash = hash_password(new_pw)
    user.pending_password = ""
    user.pending_password_by = ""
    user.reset_token = ""
    user.reset_token_expires = None
    user.token_version = (getattr(user, "token_version", 0) or 0) + 1
    await db.commit()
    # Re-issue a cookie with the NEW token version so THIS browser stays logged in
    # while every other session (old version) is rejected on the next request.
    new_token = create_token(user.id, user.username, user.is_admin, user.token_version, get_role(user))
    set_auth_cookie(response, new_token, request)
    return {"message": "Owner password rotated and all other sessions were signed out.", "new_password": new_pw}


@router.get("/password-changed")
async def password_changed_status(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    pending = getattr(user, "pending_password", "") or ""
    pending_by = getattr(user, "pending_password_by", "") or ""
    return {"changed": bool(pending), "changed_by": pending_by}


@router.get("/password-changed/view")
async def password_changed_view(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    pending = getattr(user, "pending_password", "") or ""
    if not pending:
        raise HTTPException(status_code=404, detail="No pending password")
    pw = decrypt_pending_password(pending)
    if not pw:
        # Legacy plaintext stored before encryption was added — return it once.
        pw = pending
    # One-time view: clear immediately after retrieval.
    user.pending_password = ""
    user.pending_password_by = ""
    await db.commit()
    return {"password": pw}


@router.post("/password-changed/dismiss")
async def password_changed_dismiss(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    user.pending_password = ""
    user.pending_password_by = ""
    await db.commit()
    return {"message": "dismissed"}


class AdminRequest(BaseModel):
    username: str
    password: str
    secret: str = ""


@router.post("/guest")
async def guest_login(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    # Abuse protection: cap guest account creation per IP (60/day).
    _raise_if_locked(f"guest:{_client_ip(request)}", limit=60, window=86400)
    import uuid
    guest_name = f"guest_{uuid.uuid4().hex[:8]}"
    user = User(username=guest_name, email=f"{guest_name}@guest.local", password_hash=hash_password(uuid.uuid4().hex), is_admin=False)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_token(user.id, user.username, False, getattr(user, "token_version", 0) or 0, "user")
    set_auth_cookie(response, token, request)
    return {"user": UserResponse.model_validate(user), "guest": True}


@router.post("/admin/login")
async def admin_login(req: AdminRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    ip = _client_ip(request)
    user_key = f"adminlogin:user:{req.username.lower()}"
    ip_key = f"adminlogin:ip:{ip}"
    result = await db.execute(select(User).where(User.username == req.username, User.is_admin == True))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        _record_failure(user_key)
        _record_failure(ip_key)
        _raise_if_locked(user_key, limit=5)
        _raise_if_locked(ip_key, limit=20)
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    _clear_failures(user_key)
    _clear_failures(ip_key)
    token = create_token(user.id, user.username, True, getattr(user, "token_version", 0) or 0, get_role(user))
    set_auth_cookie(response, token, request)
    return {"user": UserResponse.model_validate(user), "admin": True}


@router.post("/admin/users")
async def create_admin(req: AdminRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Owner only — creating a brand-new admin account no longer relies on a hardcoded secret.
    actor = await get_current_user_from_cookie(request, db)
    if not is_owner(actor):
        raise HTTPException(status_code=403, detail="Owner only")
    username = (req.username or "").strip()
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username min 3")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password min 6")
    existing = await db.execute(select(User).where((User.username == username) | (User.email == username)))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")
    user = User(username=username, email=f"{username}@admin.local", password_hash=hash_password(req.password), is_admin=True, role="admin")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": user.id, "username": user.username, "message": "Admin created"}


@router.get("/admin/dashboard")
async def admin_dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import func
    from database import Chat, Message, Memory, KnowledgeBase
    from datetime import timedelta
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin):
        raise HTTPException(status_code=403, detail="Admin only")
    total_users = (await db.execute(select(func.count()).select_from(User).where(User.is_deleted == False))).scalar() or 0
    total_chats = (await db.execute(select(func.count()).select_from(Chat))).scalar() or 0
    total_messages = (await db.execute(select(func.count()).select_from(Message))).scalar() or 0
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    active_users = (await db.execute(select(func.count(func.distinct(Chat.user_id))).select_from(Chat).join(User, Chat.user_id == User.id).where(Chat.updated_at >= since, User.is_deleted == False))).scalar() or 0
    guest_count = (await db.execute(select(func.count()).select_from(User).where(User.username.like("guest_%"), User.is_deleted == False))).scalar() or 0
    banned_count = (await db.execute(select(func.count()).select_from(User).where(User.is_banned == True, User.is_deleted == False))).scalar() or 0
    deleted_count = (await db.execute(select(func.count()).select_from(User).where(User.is_deleted == True))).scalar() or 0
    admin_count = (await db.execute(select(func.count()).select_from(User).where(User.role == "admin", User.is_deleted == False))).scalar() or 0
    owner_count = (await db.execute(select(func.count()).select_from(User).where(User.role == "owner", User.is_deleted == False))).scalar() or 0
    return {"total_users": total_users, "active_users": active_users, "total_chats": total_chats, "total_messages": total_messages, "guest_count": guest_count, "banned_count": banned_count, "deleted_count": deleted_count, "admin_count": admin_count, "owner_count": owner_count}


@router.get("/admin/users")
async def list_all_users(request: Request, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import func
    from database import Chat, Message
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    enriched = []
    for u in users:
        chat_count = (await db.execute(select(func.count()).select_from(Chat).where(Chat.user_id == u.id))).scalar() or 0
        msg_count = (await db.execute(select(func.count()).select_from(Message).join(Chat, Message.chat_id == Chat.id).where(Chat.user_id == u.id))).scalar() or 0
        last_chat = (await db.execute(select(Chat.updated_at).where(Chat.user_id == u.id).order_by(Chat.updated_at.desc()).limit(1))).scalar_one_or_none()
        last_seen = getattr(u, "last_seen", None)
        online = False
        if last_seen:
            try:
                ls = last_seen if last_seen.tzinfo is None else last_seen.replace(tzinfo=None)
                online = (now_naive - ls).total_seconds() < 10
            except Exception:
                online = False
        enriched.append({**UserResponse.model_validate(u).model_dump(), "role": get_role(u), "chat_count": chat_count, "message_count": msg_count, "last_active": last_chat.strftime("%Y-%m-%d %H:%M") if last_chat else "Never", "created_at": u.created_at.strftime("%Y-%m-%d") if u.created_at else "", "online": online, "last_seen": last_seen.strftime("%Y-%m-%d %H:%M") if last_seen else ""})
    return {"users": enriched}


@router.post("/admin/users/{user_id}/ban")
async def admin_ban_user(user_id: int, req: AdminBanRequest, request: Request, db: AsyncSession = Depends(get_db)):
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin): raise HTTPException(status_code=403, detail="Admin only")
    if not req.reason or not req.reason.strip():
        raise HTTPException(status_code=400, detail="Ban reason is required")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target: raise HTTPException(status_code=404, detail="User not found")
    target_role = get_role(target)
    if target_role == "owner":
        raise HTTPException(status_code=400, detail="The Owner cannot be banned")
    if target_role == "admin" and get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Admins cannot take action on fellow admins")
    if get_role(admin) == "admin":
        import json
        perms = {}
        if admin.permissions:
            try: perms = json.loads(admin.permissions)
            except: pass
        if not perms.get("ban_users", True):
            raise HTTPException(status_code=403, detail="You do not have permission to ban users. Contact the Owner.")
    target.is_banned = True
    target.ban_reason = req.reason.strip()[:500]
    target.banned_by = get_role(admin)
    await db.commit()
    return {"message": f"{target.username} banned by {_role_label(get_role(admin))}"}


@router.post("/admin/users/{user_id}/unban")
async def admin_unban_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin): raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target: raise HTTPException(status_code=404, detail="User not found")
    target_role = get_role(target)
    if target_role == "owner":
        raise HTTPException(status_code=400, detail="The Owner cannot be unbanned")
    if target_role == "admin" and get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Admins cannot take action on fellow admins")
    target.is_banned = False
    target.ban_reason = ""
    target.banned_by = ""
    await db.commit()
    return {"message": f"{target.username} unbanned"}


@router.post("/admin/users/{user_id}/reset-password")
async def admin_reset_password(user_id: int, req: AdminResetRequest, request: Request, db: AsyncSession = Depends(get_db)):
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin): raise HTTPException(status_code=403, detail="Admin only")
    if len(req.new_password) < 6: raise HTTPException(status_code=400, detail="Password min 6 chars")
    if get_role(admin) == "admin":
        import json
        perms = {}
        if admin.permissions:
            try: perms = json.loads(admin.permissions)
            except: pass
        if not perms.get("reset_password", True):
            raise HTTPException(status_code=403, detail="You do not have permission to reset passwords. Contact the Owner.")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target: raise HTTPException(status_code=404, detail="User not found")
    target_role = get_role(target)
    if target_role == "owner":
        raise HTTPException(status_code=400, detail="The Owner's password cannot be reset")
    if target_role == "admin" and get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Reset option is disabled for fellow admins")
    target.password_hash = hash_password(req.new_password)
    # Store encrypted at rest; decrypted once on first view, then cleared.
    target.pending_password = encrypt_pending_password(req.new_password)
    target.pending_password_by = get_role(admin)
    await db.commit()
    return {"message": f"Password reset for {target.username}"}


@router.get("/admin/users/{user_id}/chats")
async def admin_user_chats(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    from database import Chat
    from sqlalchemy.orm import selectinload
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin): raise HTTPException(status_code=403, detail="Admin only")
    if get_role(admin) == "admin":
        import json
        perms = {}
        if admin.permissions:
            try: perms = json.loads(admin.permissions)
            except: pass
        if not perms.get("view_messages", True):
            raise HTTPException(status_code=403, detail="You do not have permission to view messages. Contact the Owner.")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    target_role = get_role(target) if target else "user"
    if target_role in ("admin", "owner") and get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Admins cannot view fellow staff chats")
    result = await db.execute(select(Chat).where(Chat.user_id == user_id).options(selectinload(Chat.messages)).order_by(Chat.updated_at.desc()).limit(50))
    chats = result.scalars().all()
    out = []
    for c in chats:
        msgs = [{"role": m.role, "content": m.content, "created_at": str(m.created_at)} for m in c.messages[-100:]]
        out.append({"id": c.id, "title": c.title, "message_count": len(c.messages), "updated_at": str(c.updated_at), "messages": msgs})
    return {"chats": out}


@router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin):
        raise HTTPException(status_code=403, detail="Admin only")
    if get_role(admin) == "admin":
        import json
        perms = {}
        if admin.permissions:
            try: perms = json.loads(admin.permissions)
            except: pass
        if not perms.get("delete_users", True):
            raise HTTPException(status_code=403, detail="You do not have permission to delete users. Contact the Owner.")
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target_role = get_role(target)
    if target_role == "owner":
        raise HTTPException(status_code=400, detail="The Owner cannot be deleted")
    if target_role == "admin" and get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Admins cannot delete fellow admins")
    target.is_deleted = True
    target.deleted_by = get_role(admin)
    await db.commit()
    return {"message": "User deleted (soft)"}


class BulkDeleteRequest(BaseModel):
    user_ids: list[int] = []


@router.post("/admin/users/bulk-delete")
async def admin_bulk_delete_users(req: BulkDeleteRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Soft-delete multiple users at once (Vault multi-select)."""
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin):
        raise HTTPException(status_code=403, detail="Admin only")
    if get_role(admin) == "admin":
        import json
        perms = {}
        if admin.permissions:
            try: perms = json.loads(admin.permissions)
            except: pass
        if not perms.get("delete_users", True):
            raise HTTPException(status_code=403, detail="You do not have permission to delete users. Contact the Owner.")
    admin_role = get_role(admin)
    ids = [i for i in sorted(set(req.user_ids)) if i != admin.id]
    if not ids:
        raise HTTPException(status_code=400, detail="No valid users to delete")
    result = await db.execute(select(User).where(User.id.in_(ids)))
    targets = result.scalars().all()
    deleted = 0
    skipped = []
    for target in targets:
        t_role = get_role(target)
        if t_role == "owner":
            skipped.append(f"{target.username} (Owner)")
            continue
        if t_role == "admin" and admin_role != "owner":
            skipped.append(f"{target.username} (admin)")
            continue
        target.is_deleted = True
        target.deleted_by = admin_role
        deleted += 1
    await db.commit()
    return {"message": f"Deleted {deleted} user(s)", "deleted": deleted, "skipped": skipped}


@router.post("/admin/users/{user_id}/role")
async def admin_change_role(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    admin = await get_current_user_from_cookie(request, db)
    if get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Only the Owner can change roles")
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    body = await request.json()
    new_role = body.get("role", "").strip().lower()
    if new_role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Role must be 'user' or 'admin'")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target_role = get_role(target)
    if target_role == "owner":
        raise HTTPException(status_code=400, detail="Cannot change the Owner's role")
    if target_role == new_role:
        return {"message": f"User is already {new_role}", "role": target_role}
    target.role = new_role
    if new_role == "user":
        target.is_admin = False
        target.pending_notification = 'demoted'
    elif new_role == "admin":
        target.is_admin = True
        target.pending_notification = 'promoted'
    await db.commit()
    return {"message": f"User role changed to {new_role}", "role": new_role}


@router.get("/admin/users/{user_id}/permissions")
async def admin_get_permissions(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    admin = await get_current_user_from_cookie(request, db)
    if get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Only the Owner can manage permissions")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    import json
    perms = {}
    if target.permissions:
        try:
            perms = json.loads(target.permissions)
        except Exception:
            perms = {}
    defaults = {"ban_users": True, "reset_password": True, "view_messages": True, "manage_chats": True}
    for k, v in defaults.items():
        if k not in perms:
            perms[k] = v
    return {"permissions": perms}


@router.post("/admin/users/{user_id}/permissions")
async def admin_set_permissions(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    admin = await get_current_user_from_cookie(request, db)
    if get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Only the Owner can manage permissions")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if get_role(target) == "owner":
        raise HTTPException(status_code=400, detail="Cannot change Owner's permissions")
    body = await request.json()
    import json
    perms = body.get("permissions", {})
    allowed_keys = {"ban_users", "reset_password", "view_messages", "manage_chats", "delete_users"}
    filtered = {k: bool(v) for k, v in perms.items() if k in allowed_keys}
    target.permissions = json.dumps(filtered)
    await db.commit()
    return {"message": "Permissions updated", "permissions": filtered}


@router.get("/me")
async def me(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    return {"user": UserResponse.model_validate(user)}


@router.post("/me/clear-notification")
async def clear_notification(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    user.pending_notification = ""
    await db.commit()
    return {"ok": True}


@router.post("/heartbeat")
async def heartbeat(request: Request, db: AsyncSession = Depends(get_db)):
    """Lightweight presence ping. Updates last_seen so staff can see live online users."""
    user = await get_current_user_from_cookie(request, db)
    user.last_seen = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}
