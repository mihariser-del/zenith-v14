from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from pydantic import BaseModel

import os
import secrets
from datetime import datetime, timezone, timedelta
os.makedirs("uploads", exist_ok=True)

from database import init_db, get_db
from auth import router as auth_router, get_current_user_from_cookie, is_owner
from chats import router as chats_router
from memories import router as memories_router
from user_settings import router as settings_router
from knowledge import router as knowledge_router
from search import router as search_router
from files import router as files_router
from generate import router as generate_router
from security import router as security_router
from codeexec import router as codeexec_router
from image import router as image_router
from feedback import router as feedback_router
from staff import router as staff_router
from announcements import router as announcements_router
from billing import router as billing_router
from google_auth import router as google_router
from system_stats import router as system_router
from analytics import router as analytics_router
from global_controls import router as global_controls_router
from personal_requests import router as personal_requests_router
from personality import router as personality_router

REFERRAL_REQUIRED = 5  # referrals needed for Pro reward
REFERRAL_PRO_DAYS = 3  # days of Pro granted per reward

VERSION = "18.2"

# User-facing changelog: what actually matters to normal users (benefits, no internals).
USER_CHANGELOG = [
    "Security hardening: password resets now use emailed one-time links, failed logins are rate-limited, and sessions use secure cookies",
    "Time-based limits: after heavy use your account takes a cooling break — from 1 hour up to 18 hours, tuned to your activity",
    "Media window: chats with lots of images/files get a 15-message allowance, then a long rest",
    "Voice: logged-in users get 30 minutes of voice chat per day, then it pauses until midnight (UTC)",
    "Files & documents: logged-in users can create/edit up to 10 files a day, then a 1-hour break — guests need to log in first",
    "Clear countdown popups: whenever a limit kicks in you'll see exactly how long to wait",
    "Just ask for an image: type something like 'generate a pic of...' and Zenith creates it automatically",
    "Changelog is now split — normal users see what affects them; staff see the deep technical notes",
    "Personal Requests: ask the admin for anything personally (a feature, a fix, a custom item) — they reply right here in the sidebar",
    "Personality Mirror: Zenith studies how you write and matches your tone, energy and vibe in its replies (tunable in Settings → System Prompt)",
]

# Staff/admin changelog: current + technical notes (owners & admins see these too).
STAFF_CHANGELOG = [
    *USER_CHANGELOG,
    "SECURITY 18.2: code sandbox gated to Owner-only + shell execution removed; hardcoded admin/owner passwords removed (env-bootstrapped) + known-compromised creds auto-rotated on boot; SECRET_KEY auto-generated (persisted, never 'zenith-dev'); forgot-password now issues expiring emailed tokens (SMTP via SMTP_* env, link logged when unconfigured); new POST /api/auth/reset-password; brute-force protection (per-IP + per-username, 429 + Retry-After) on login/admin-login/guest/register/forgot; secure=True session cookies (except localhost); /api/debug/keys now Owner-only; pending_password encrypted at rest (Fernet) and shown once then cleared",
    "limits.py engine: cooldown_until column; dynamic free timer 60-1080 min from usage intensity (msgs today/1h/10m bounce + media volume); pro 10-30 min, 60 min on exploit",
    "chat media window: [Image xN]/[File: markers per chat; 15-msg allowance from 5th image/15th file; images+files logged as 'message' usage",
    "file_tool system: guests 403 on edit/document_gen; free logged-in 10/day combined upload+edit+gen then fixed 60-min cooldown",
    "image.py persists generated images as assistant messages (survives reload, counted in media window)",
    "client showLimitPopup (api.js) with live countdown; billing interceptor routes cooldown/pause messages to the popup",
    "voice 30-min/day meter (localStorage, resets UTC midnight) — voice mode blocks + popup after the cap",
    "auto image-gen: detectImageRequest() regex in chat prompts ('generate a pic of...', 'i want a pic of...')",
    "changelog endpoint returns user_changes + staff_changes; app shows per role",
    "personal requests: /api/requests (create/my/admin/respond/delete); UserRequest table; staff reply in the Request Inbox with badge, device push + Discord toast; users get reply popups",
    "personality mirror: /api/personality (profile/settings/refresh/reset); analyzer openai/gpt-4o-mini on last 40 user msgs (>=5 to trigger), REFRESH_MINUTES=15; first analysis synchronous in chats.py hook, later refreshes backgrounded; injected into build_system_prompt; columns personality_enabled/profile/updated_at",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
    except Exception as e:
        print(f"init_db failed (non-fatal): {e} — continuing, app will be live but DB may be ephemeral")
    yield


app = FastAPI(title="Zenith AI", version=VERSION, lifespan=lifespan)

app.include_router(auth_router)
app.include_router(chats_router)
app.include_router(memories_router)
app.include_router(settings_router)
app.include_router(knowledge_router)
app.include_router(search_router)
app.include_router(files_router)
app.include_router(generate_router)
app.include_router(security_router)
app.include_router(codeexec_router)
app.include_router(image_router)
app.include_router(feedback_router)
app.include_router(staff_router)
app.include_router(announcements_router)
app.include_router(billing_router)
app.include_router(google_router)
app.include_router(system_router)
app.include_router(analytics_router)
app.include_router(global_controls_router)
app.include_router(personal_requests_router)
app.include_router(personality_router)


# ─────────────────────────────────────────────────────────────────────────────
# REFERRAL SYSTEM
# ─────────────────────────────────────────────────────────────────────────────

from database import User, Referral, async_session
from sqlalchemy import select, func, update
from database import InviteToken


def _generate_token():
    return secrets.token_urlsafe(32)


@app.post("/api/referral/generate")
async def referral_generate(request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if user.username.startswith("guest_"):
        raise HTTPException(status_code=403, detail="Guests cannot generate invite links")
    existing = await db.execute(
        select(InviteToken).where(InviteToken.referrer_id == user.id, InviteToken.used == False)
    )
    active = existing.scalar_one_or_none()
    if active:
        return {"token": active.token, "created_at": active.created_at.isoformat()}
    token = InviteToken(token=_generate_token(), referrer_id=user.id)
    db.add(token)
    await db.commit()
    await db.refresh(token)
    return {"token": token.token, "created_at": token.created_at.isoformat()}


@app.get("/api/referral/stats")
async def referral_stats(request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if user.username.startswith("guest_"):
        raise HTTPException(status_code=403, detail="Guests cannot view referral stats")
    total_result = await db.execute(
        select(func.count()).where(Referral.referrer_id == user.id)
    )
    total = total_result.scalar() or 0
    rewarded_result = await db.execute(
        select(func.count()).where(Referral.referrer_id == user.id, Referral.rewarded == True)
    )
    rewarded = rewarded_result.scalar() or 0
    pending = total - rewarded
    has_pro = getattr(user, "is_pro", False) and getattr(user, "pro_plan", "") == "referral_pro"
    earned_from_referrals = has_pro or rewarded > 0
    return {
        "total": total,
        "rewarded": rewarded,
        "pending": pending,
        "required": REFERRAL_REQUIRED,
        "has_pro": has_pro,
        "earned_from_referrals": earned_from_referrals,
        "pro_days": REFERRAL_PRO_DAYS,
    }


@app.post("/api/referral/claim")
async def referral_claim(request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if user.username.startswith("guest_"):
        raise HTTPException(status_code=403, detail="Guests cannot claim referral rewards")
    result = await db.execute(
        select(func.count()).where(Referral.referrer_id == user.id, Referral.rewarded == False)
    )
    pending = result.scalar() or 0
    if pending < REFERRAL_REQUIRED:
        raise HTTPException(status_code=400, detail=f"Need {REFERRAL_REQUIRED - pending} more referrals to claim")
    now = datetime.now(timezone.utc)
    if getattr(user, "is_pro", False) and getattr(user, "trial_end", None):
        trial_end = user.trial_end
        if trial_end.tzinfo is None:
            trial_end = trial_end.replace(tzinfo=timezone.utc)
        if trial_end > now:
            user.trial_end = trial_end + timedelta(days=REFERRAL_PRO_DAYS)
        else:
            user.trial_end = now + timedelta(days=REFERRAL_PRO_DAYS)
    else:
        user.is_pro = True
        user.pro_plan = "referral_pro"
        user.trial_end = now + timedelta(days=REFERRAL_PRO_DAYS)
    await db.execute(
        update(Referral).where(
            Referral.referrer_id == user.id,
            Referral.rewarded == False
        ).values(rewarded=True)
    )
    await db.commit()
    return {"message": f"Pro activated for {REFERRAL_PRO_DAYS} days!", "trial_end": user.trial_end.isoformat()}


@app.get("/api/referral/link")
async def referral_link(request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if user.username.startswith("guest_"):
        raise HTTPException(status_code=403, detail="Guests cannot get invite links")
    existing = await db.execute(
        select(InviteToken).where(InviteToken.referrer_id == user.id, InviteToken.used == False)
    )
    active = existing.scalar_one_or_none()
    if not active:
        active = InviteToken(token=_generate_token(), referrer_id=user.id)
        db.add(active)
        await db.commit()
        await db.refresh(active)
    base = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    if not base:
        # Build from the incoming request so scheme + host + port are correct
        base = str(request.base_url).rstrip("/")
    return {"link": f"{base}/i/{active.token}", "token": active.token}


@app.get("/i/{token}")
async def invite_page(token: str, request: Request):
    async with async_session() as db:
        result = await db.execute(
            select(InviteToken).where(InviteToken.token == token)
        )
        invite = result.scalar_one_or_none()
        if not invite or invite.used:
            return RedirectResponse(url="/")
        ref_result = await db.execute(
            select(User).where(User.id == invite.referrer_id)
        )
        referrer = ref_result.scalar_one_or_none()
        if not referrer:
            return RedirectResponse(url="/")
    resp = RedirectResponse(url=f"/invite.html?token={token}")
    resp.set_cookie(
        key="zenith_invite_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=(request.url.scheme == "https"),
        max_age=7 * 24 * 3600,
    )
    return resp


@app.get("/api/referral/validate")
async def validate_invite_token(request: Request, db=Depends(get_db)):
    token = request.query_params.get("token", "")
    if not token:
        raise HTTPException(status_code=400, detail="Token required")
    result = await db.execute(
        select(InviteToken).where(InviteToken.token == token)
    )
    invite = result.scalar_one_or_none()
    if not invite or invite.used:
        raise HTTPException(status_code=404, detail="Invalid or used invite link")
    ref_result = await db.execute(
        select(User).where(User.id == invite.referrer_id)
    )
    referrer = ref_result.scalar_one_or_none()
    return {
        "referrer_name": referrer.username if referrer else "Someone",
        "created_at": invite.created_at.isoformat(),
    }


app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/api/debug/keys")
async def debug_keys(request: Request, db=Depends(get_db)):
    # Owner-only; exposes key rotation state (prefixes only, never full keys).
    user = await get_current_user_from_cookie(request, db)
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    from ai import _get_openrouter_keys
    keys = _get_openrouter_keys()
    return {"count": len(keys), "prefixes": [k[:12] + "..." for k in keys]}

@app.get("/api/changelog")
async def get_changelog():
    return {"version": VERSION, "changes": USER_CHANGELOG, "user_changes": USER_CHANGELOG, "staff_changes": STAFF_CHANGELOG}


@app.get("/", response_class=HTMLResponse)
async def landing():
    return FileResponse("static/index.html")


@app.get("/app", response_class=HTMLResponse)
async def chat_app():
    return FileResponse("static/app.html")


@app.get("/app/c/{link_id}", response_class=HTMLResponse)
async def chat_app_link(link_id: str):
    """ChatGPT-style deep link to a specific chat (/app/c/<link_id>).
    The frontend resolves the link_id and scopes it to the logged-in user."""
    return FileResponse("static/app.html")


@app.get("/admin", response_class=HTMLResponse)
async def admin_page():
    return FileResponse("static/admin.html")


@app.get("/vault", response_class=HTMLResponse)
async def vault_page():
    return FileResponse("static/vault.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
