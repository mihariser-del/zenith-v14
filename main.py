from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from pydantic import BaseModel

import os
import secrets
import asyncio
from datetime import datetime, timezone, timedelta
os.makedirs("uploads", exist_ok=True)

from database import init_db, get_db
from auth import router as auth_router, get_current_user_from_cookie, is_owner, _server_fingerprint
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

VERSION = "19.8"

# User-facing changelog: what actually matters to normal users (benefits, no internals).
USER_CHANGELOG = [
    "Files finally open up to the AI: upload a PDF, Word, Excel, PowerPoint, audio or video and Zenith actually reads it — it can summarize, answer questions about, edit, replicate and rewrite whatever you send",
    "Way more file types are welcome: Office docs, spreadsheets, slides, audio files, videos and code files all upload and get read",
    "Videos get processed too — Zenith grabs key frames from the video so it can describe what's on screen, plus audio transcription when a transcription key is configured",
    "Audio files report their metadata (duration, bitrate, format) and transcribe their speech when a Whisper-compatible key is set",
    "What's New finally stops repeating itself — you now only see features that were freshly added since the last time you checked",
    "Used invite links get their own flashy page: a spinning neon ticket portal that tells you the seat's already taken",
    "The invite page now scrolls smoothly on short screens instead of clipping its content",
    "The whole app got the vibrant neon makeover — deep purple, cyan and pink-gold gradients across the board, and your Theme & Accent settings now drive that look (owners keep the signature neon)",
    "Invite links are now locked to the device AND the network — incognito, clearing site data or swapping browsers won't let the same person farm multiple invites, so the 5-friend Pro reward stays honest",
    "Shared links now explain themselves — if a linked chat is private, deleted or you're logged out, you get a clear message with the right way back, instead of a blank redirect",
    "Shared-chat pages got a refresh: real chat bubbles with your name on it, a link you can copy straight from the top bar, and a cleaner conversation view",
    "Share popup polished: a live 'Public' status pill, one-tap copy, prettier social buttons and a clearer preview of who can see your chat",
    "Invites are now one per device — once a device joins Zenith it can't use another invite link, and it gets a friendly 'already joined' page if it tries",
    "Folders & pinning: organize chats into custom folders and pin favorites to the top of the sidebar",
    "Shared chats now collect reactions! People who view your shared link can tap emojis on any message, and you'll see viewer reactions in the chat",
    "Unlimited invites are now single-use — an invite link is consumed the moment someone registers, so it can't be replayed",
    "Billing now uses PesaPal instead of Stripe — works in Uganda with Visa, Mastercard, AMEX and mobile money (MTN/Airtel)",
    "Invited friends land straight inside the app after creating their account (no extra login step)",
    "Brand-new redesigned invite page — crisp, animated and ready to show off",
    "Reminders: pick 'Today' for same-day alerts, plus the usual weekdays or next-day",
    "Voice speed control: tune how fast Zenith speaks the replies out loud",
    "Long replies get a friendly 'ready for you' nudge the moment they finish",
    "Per-chat model picker: choose a different AI for each conversation without changing your global default",
    "Share & export polished: one-tap social sharing, txt/md/pdf export and a cleaner shared-chat view",
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
    "19.6 busy-proof downloads: if Zenith is busy when you ask for a file/doc generation, you get a test file you can still download (choose md/docx/pdf/pptx/xlsx/csv) to verify downloads work",
    "19.7 vibrant upgrade & guest login: the upgrade plans popup got a neon makeover; guests are told instantly why invites/sharing are off-limits with a colorful login prompt that never hides behind other popups",
]

# Staff/admin changelog: current + technical notes (owners & admins see these too).
STAFF_CHANGELOG = [
    *USER_CHANGELOG,
    "19.7 upgrade/login vibrancy: billing.showUpgrade() fully restyled (zp-* scoped classes, gradient title/glows/top bar, plan cards cyan vs gold with POPULAR/SAVE 17%/ONE-TIME badges, animated gradient buttons, grid auto-fit for mobile) and modal z-index bumped 500→10000 so guest popups never sit behind the share (700) / invite (9999) modals; chat-share-btn and invite-btn now gate guests up-front to Billing.showUpgrade('Guest ...'); guest branch shows a bobbing rocket + vibrant Login/Register; limit popup (api.js) guest login button switched to cyan→violet→magenta animated gradient with limitDrift keyframes",
    "19.8 PesaPal billing: replaced Stripe with PesaPal API 3.0 (auth token caching, IPN webhook registration per order, SubmitOrderRequest with subscription_details for monthly/yearly, GetTransactionStatus verification); env vars PESAPAL_CONSUMER_KEY/PESAPAL_CONSUMER_SECRET/PESAPAL_SANDBOX; mock mode when unconfigured; stripe.py removed from requirements.txt; supports Visa/Mastercard/AMEX + MTN/Airtel mobile money in Uganda",
    "19.6 busy fallback: chat.js detects a streamed busy/too-many-requests error AND a generation-like user message (_looksLikeGenerationRequest regex) then _renderBusyFallback() injects the busy note + a .file-pill.ftest card with 6 format download buttons (md/docx/pdf/pptx/xlsx/csv) calling downloadAs() → /api/generate/document; .fp-dls styles in style.css (wraps full-width under 480px); also applied on regenerate()",
    "19.5 file-read pipeline: files.py extractors (docx/xlsx/pptx via python-docx/openpyxl/python-pptx, audio metadata via mutagen, video frames via imageio_ffmpeg, whisper-compatible transcription via WHISPER_API_KEY/WHISPER_BASE_URL/WHISPER_MODEL env); ALLOWED_TYPES + EXT_ALLOWLIST widened; chat.js auto-fetches /api/files/{id}/read for binary attachments and embeds content + video frames into the model context; each optional lib is import-guarded so the server keeps running without them",
    "changelog is now per-user 'seen' (users.changelog_seen_user/changelog_seen_staff); GET /api/changelog returns only newly-added entries (unseen prefix) when authed, POST /api/changelog/seen marks them; guests fall back to a local counter in app.js",
    "TEMPORARY owner tool: POST /api/referral/admin/reset {username} wipes a user's referral progress (deletes Referral rows + revokes referral_pro); exposed as a dashed button inside the owner's Invite Friends modal — remove in a later version",
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
    reminder_task = asyncio.create_task(_reminder_loop())
    try:
        yield
    finally:
        reminder_task.cancel()
        try:
            await reminder_task
        except asyncio.CancelledError:
            pass


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

from database import User, Referral, Chat, Message, Reminder, async_session
from sqlalchemy import select, func, update, delete
from database import InviteToken, UsedDevice


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


@app.post("/api/referral/admin/reset")
async def referral_admin_reset(request: Request, db=Depends(get_db)):
    """TEMPORARY owner tool: wipe a user's referral progress so they can earn the
    invite-friends reward again. Owner-only; removed in a later version."""
    user = await get_current_user_from_cookie(request, db)
    if not (user.role == "owner" or user.username == "WANZU-IBRAHIM"):
        raise HTTPException(status_code=403, detail="Owner only")
    body = await request.json()
    target_name = (body.get("username") or "").strip()
    if not target_name:
        raise HTTPException(status_code=400, detail="username required")
    tgt = (
        await db.execute(select(User).where(User.username == target_name))
    ).scalar_one_or_none()
    if not tgt:
        raise HTTPException(status_code=404, detail="User not found")
    deleted = (
        await db.execute(
            select(func.count()).where(Referral.referrer_id == tgt.id)
        )
    ).scalar() or 0
    await db.execute(delete(Referral).where(Referral.referrer_id == tgt.id))
    if getattr(tgt, "pro_plan", "") == "referral_pro":
        tgt.is_pro = False
        tgt.pro_plan = ""
        tgt.trial_end = None
    await db.commit()
    return {"message": f"Reset invite progress for {target_name}", "deleted": deleted}


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


@app.get("/invite.html", response_class=HTMLResponse)
async def serve_invite_page():
    return FileResponse("static/invite.html")


@app.get("/api/referral/validate")
async def validate_invite_token(request: Request, db=Depends(get_db)):
    token = request.query_params.get("token", "")
    device_id = request.query_params.get("device_id", "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token required")
    # Device already joined Zenith → it can never use another invite link.
    # Client device_ids are spoofable, so the server-side network fingerprint
    # (IP + User-Agent) counts too — same network that already joined via an
    # invite gets the same "already joined" treatment even after incognito.
    if device_id:
        dev_result = await db.execute(
            select(UsedDevice).where(UsedDevice.device_id == device_id)
        )
        used = dev_result.scalar_one_or_none()
        if used:
            user_result = await db.execute(select(User).where(User.id == used.user_id))
            owner = user_result.scalar_one_or_none()
            if owner and not owner.is_deleted:
                return {
                    "device_already_joined": True,
                    "detail": "This device already joined Zenith",
                    "username": owner.username,
                }
    net_fp = _server_fingerprint(request)
    if net_fp:
        net_result = await db.execute(
            select(UsedDevice).where(
                UsedDevice.ip_fp == net_fp,
                UsedDevice.source == "invite",
            )
        )
        used_net = net_result.scalar_one_or_none()
        if used_net:
            user_result = await db.execute(select(User).where(User.id == used_net.user_id))
            owner = user_result.scalar_one_or_none()
            if owner and not owner.is_deleted:
                return {
                    "device_already_joined": True,
                    "detail": "This device already joined Zenith",
                    "username": owner.username,
                }
    result = await db.execute(
        select(InviteToken).where(InviteToken.token == token)
    )
    invite = result.scalar_one_or_none()
    if invite and invite.used:
        raise HTTPException(status_code=410, detail="This invite link has already been used")
    if not invite:
        raise HTTPException(status_code=404, detail="Invite link not found or invalid")
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


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC CHAT SHARES
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/s/{share_id}", response_class=HTMLResponse)
async def shared_chat_page(share_id: str):
    return FileResponse("static/share.html")


@app.get("/api/s/{share_id}")
async def get_shared_chat(share_id: str):
    """Public read-only view of a shared conversation (no auth)."""
    async with async_session() as db:
        result = await db.execute(
            select(Chat).where(Chat.share_id == share_id)
        )
        chat = result.scalar_one_or_none()
        if not chat:
            raise HTTPException(status_code=404, detail="Shared chat not found")
        msg_result = await db.execute(
            select(Message).where(Message.chat_id == chat.id).order_by(Message.id)
        )
        messages = [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at.isoformat() if m.created_at else "",
                "viewer_reactions": m.viewer_reactions or "{}",
            }
            for m in msg_result.scalars().all()
        ]
        owner = await db.get(User, chat.user_id)
        return {
            "title": chat.title,
            "shared_at": chat.shared_at.isoformat() if chat.shared_at else "",
            "message_count": len(messages),
            "owner": owner.username if owner else "Unknown",
            "messages": messages,
        }


@app.post("/api/s/{share_id}/messages/{message_id}/react")
async def react_shared_message(share_id: str, message_id: int, request: Request):
    """Anonymous viewer reactions on a shared chat. Counts per emoji, capped to stop spam."""
    import json
    body = await request.json()
    emoji = (body.get("emoji") or "").strip()[:8]
    remove = bool(body.get("remove"))
    if not emoji:
        raise HTTPException(status_code=400, detail="Emoji required")
    async with async_session() as db:
        chat_result = await db.execute(
            select(Chat).where(Chat.share_id == share_id)
        )
        chat = chat_result.scalar_one_or_none()
        if not chat:
            raise HTTPException(status_code=404, detail="Shared chat not found")
        msg_result = await db.execute(
            select(Message).where(Message.id == message_id, Message.chat_id == chat.id)
        )
        msg = msg_result.scalar_one_or_none()
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found")
        try:
            counts = json.loads(msg.viewer_reactions or "{}")
        except Exception:
            counts = {}
        current = int(counts.get(emoji, 0))
        if remove:
            counts[emoji] = current - 1
            if counts[emoji] <= 0:
                counts.pop(emoji, None)
        else:
            counts[emoji] = min(current + 1, 99)
        msg.viewer_reactions = json.dumps(counts)
        await db.commit()
        return {"viewer_reactions": counts}


# ─────────────────────────────────────────────────────────────────────────────
# USAGE METER (free-tier nudge)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/usage/meter")
async def usage_meter(request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    chat_ids = (await db.execute(select(Chat.id).where(Chat.user_id == user.id))).scalars().all()
    if chat_ids:
        msg_count = (await db.execute(
            select(func.count()).where(Message.chat_id.in_(chat_ids), Message.created_at >= today_start)
        )).scalar() or 0
    else:
        msg_count = 0
    is_pro = bool(getattr(user, "is_pro", False) or getattr(user, "is_ultimate", False))
    limit = None if is_pro else 60
    cooldown_until = getattr(user, "cooldown_until", None)
    return {
        "messages_today": msg_count,
        "limit": limit,
        "is_pro": is_pro,
        "cooldown_until": cooldown_until.isoformat() if cooldown_until else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# REMINDERS (scheduled in-app push, in-process loop)
# ─────────────────────────────────────────────────────────────────────────────

class ReminderRequest(BaseModel):
    text: str
    run_at: str  # ISO datetime
    repeat_days: int = 0


@app.get("/api/reminders")
async def list_reminders(request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Reminder).where(Reminder.user_id == user.id).order_by(Reminder.next_run_at)
    )
    return {"reminders": [
        {"id": r.id, "text": r.text, "next_run_at": r.next_run_at.isoformat(), "repeat_days": r.repeat_days}
        for r in result.scalars().all()
    ]}


@app.post("/api/reminders")
async def create_reminder(req: ReminderRequest, request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Reminder text required")
    try:
        next_run = datetime.fromisoformat(req.run_at.replace("Z", "+00:00"))
        if next_run.tzinfo is None:
            next_run = next_run.replace(tzinfo=timezone.utc)
        next_run = next_run.astimezone(timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="run_at must be ISO datetime")
    if next_run < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="run_at must be in the future")
    reminder = Reminder(user_id=user.id, text=text[:500], next_run_at=next_run, repeat_days=max(0, int(req.repeat_days)))
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)
    return {"message": "Reminder scheduled", "id": reminder.id}


@app.post("/api/reminders/{reminder_id}/delete")
async def delete_reminder(reminder_id: int, request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == user.id)
    )
    rem = result.scalar_one_or_none()
    if not rem:
        raise HTTPException(status_code=404, detail="Reminder not found")
    await db.delete(rem)
    await db.commit()
    return {"message": "Reminder deleted"}


async def _reminder_loop():
    """Checks due reminders every 30s and pushes them as in-app notifications."""
    while True:
        try:
            async with async_session() as db:
                now = datetime.now(timezone.utc)
                due = await db.execute(select(Reminder).where(Reminder.next_run_at <= now))
                for rem in due.scalars().all():
                    user = await db.get(User, rem.user_id)
                    if user:
                        existing = getattr(user, "pending_notification", "")
                        entry = f"⏰ Reminder: {rem.text}"
                        user.pending_notification = (existing + "\n" + entry).strip()
                    if rem.repeat_days > 0:
                        nxt = now + timedelta(days=rem.repeat_days)
                        rem.next_run_at = nxt
                        rem.last_run_at = now
                    else:
                        await db.delete(rem)
                await db.commit()
        except Exception as e:
            print(f"reminder loop: {e}")
        await asyncio.sleep(30)


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC STATUS PAGE
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/status", response_class=HTMLResponse)
async def status_page():
    return FileResponse("static/status.html")


@app.get("/api/status")
async def api_status(request: Request, db=Depends(get_db)):
    status = {"app": "ok", "version": VERSION, "time": datetime.now(timezone.utc).isoformat(), "database": "ok"}
    try:
        from sqlalchemy import text as _text
        await db.execute(_text("SELECT 1"))
    except Exception:
        status["database"] = "error"
    try:
        from ai import _get_openrouter_keys
        status["ai_keys"] = len(_get_openrouter_keys())
        status["ai"] = "ok" if status["ai_keys"] else "unconfigured"
    except Exception:
        status["ai"] = "error"
    try:
        from sqlalchemy import text as _text
        res = await db.execute(_text("SELECT value FROM system_settings WHERE key='ai_enabled'"))
        row = res.fetchone()
        status["ai_enabled"] = (row[0] if row else "on")
    except Exception:
        pass
    return status


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
async def get_changelog(request: Request, db=Depends(get_db)):
    """Returns only NEWLY-ADDED changelog entries for the logged-in user (prepended
    to the top since their last 'seen' watermark), so older releases' features stop
    repeating. Guests/anon get the full lists and the app falls back to local tracking."""
    try:
        user = await get_current_user_from_cookie(request, db)
    except HTTPException:
        user = None
    if user and not user.username.startswith("guest_"):
        seen_user = getattr(user, "changelog_seen_user", 0) or 0
        seen_staff = getattr(user, "changelog_seen_staff", 0) or 0
        u_new = max(0, len(USER_CHANGELOG) - seen_user)
        user_changes = USER_CHANGELOG[:u_new]
        # STAFF list = user entries + staff extras; staff extras prepend within their block.
        extras = STAFF_CHANGELOG[len(USER_CHANGELOG):]
        extras_seen = max(0, seen_staff - len(USER_CHANGELOG))
        extra_new = max(0, len(extras) - extras_seen)
        staff_changes = user_changes + extras[:extra_new]
        authed = True
    else:
        user_changes = USER_CHANGELOG
        staff_changes = STAFF_CHANGELOG
        authed = False
    return {
        "version": VERSION,
        "changes": user_changes,
        "user_changes": user_changes,
        "staff_changes": staff_changes,
        "authed": authed,
    }


@app.post("/api/changelog/seen")
async def changelog_seen(request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if user.username.startswith("guest_"):
        return {"ok": True}
    body = await request.json()
    which = body.get("list", "user")
    if which == "staff":
        # The staff list includes the user entries (user_changes + extras), so
        # acknowledging it must clear both watermarks or the user block would
        # keep reappearing on every reload for staff.
        user.changelog_seen_staff = len(STAFF_CHANGELOG)
        user.changelog_seen_user = len(USER_CHANGELOG)
    else:
        user.changelog_seen_user = len(USER_CHANGELOG)
    await db.commit()
    return {"ok": True}


@app.get("/", response_class=HTMLResponse)
async def landing():
    return FileResponse("static/index.html")


@app.get("/app", response_class=HTMLResponse)
async def chat_app():
    return FileResponse("static/app.html")


@app.get("/app/c/{link_id}", response_class=HTMLResponse)
async def chat_app_link(link_id: str, request: Request, db=Depends(get_db)):
    """ChatGPT-style deep link to a specific chat (/app/c/<link_id>).
    Logged-out visitors get a clear 'please log in' page instead of being silently
    bounced to the welcome screen. Ownership is enforced client-side via by-link."""
    try:
        await get_current_user_from_cookie(request, db)
    except HTTPException:
        return RedirectResponse(
            url=f"/denied.html?reason=login&link={link_id}",
            status_code=302,
        )
    return FileResponse("static/app.html")


@app.get("/denied.html", response_class=HTMLResponse)
async def denied_page():
    return FileResponse("static/denied.html")


@app.get("/admin", response_class=HTMLResponse)
async def admin_page():
    return FileResponse("static/admin.html")


@app.get("/vault", response_class=HTMLResponse)
async def vault_page():
    return FileResponse("static/vault.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
