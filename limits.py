from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from database import Message, User, UsageLog, get_db
from fastapi import HTTPException

# ---- Tunables -------------------------------------------------------------
# Free (logged-in) cooldown timer after hitting a limit: dynamic 1h .. 18h,
# tuned by usage, activeness and exploitation.
FREE_TIMER_MIN = 60
FREE_TIMER_MAX = 18 * 60
# Pro: 10-30 min on normal usage, fixed 60 min when exploiting features.
PRO_TIMER_MIN = 10
PRO_TIMER_MAX = 30
PRO_EXPLOIT_TIMER = 60
# Chat media window: after 5 images OR 15 files in a single chat, a logged-in
# user may send 15 more messages (images and files count as messages), then a
# long cooldown timer starts.
MEDIA_IMAGE_CAP = 5
MEDIA_FILE_CAP = 15
MEDIA_MSGS_ALLOWED = 15
# File editor/generator system: logged-in (free) users get 10 combined
# create/edit actions per day, then a fixed 1 hour cooldown. Guests are blocked.
FILE_TOOL_LIMIT = 10
FILE_TOOL_COOLDOWN_MIN = 60
# Guest messaging budget + pause window
GUEST_MSG_LIMIT = 60
GUEST_PAUSE_MIN = 30

FREE_IMAGE_LIMIT = 5
GUEST_IMAGE_LIMIT = 2
PRO_IMAGE_LIMIT = 100
PRO_FILE_LIMIT = 100
GUEST_FILE_LIMIT = 3


def _is_guest(user):
    return user.username.startswith("guest_")


def _is_pro(user):
    return bool(user.is_pro or (user.trial_end and user.trial_end > datetime.now(timezone.utc)))


def _is_ultimate(user):
    return bool(user.is_ultimate)


def _fmt_wait(seconds):
    mm, ss = divmod(int(seconds), 60)
    return f"{mm}m {ss}s"


def _cooldown_remaining(user):
    """Remaining cooldown seconds for logged-in tiers; clears the flag when expired."""
    now = datetime.now(timezone.utc)
    if not user.cooldown_until:
        return 0
    rem = int((user.cooldown_until - now).total_seconds())
    if rem > 0:
        return rem
    user.cooldown_until = None
    return 0


async def _start_cooldown(db, user, minutes):
    user.cooldown_until = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    await db.commit()


async def _raise_cooldown(db, user, minutes, is_guest, label):
    await _start_cooldown(db, user, minutes)
    wait = _fmt_wait(minutes * 60)
    if is_guest:
        raise HTTPException(status_code=429, detail=f"Guest limit reached ({label}). Cooldown active — wait {wait}. Please login for unlimited chat.")
    raise HTTPException(status_code=429, detail=f"Limit reached ({label}). Cooldown active — wait {wait}.")


async def _count(db, user_id, action, since):
    q = select(func.count()).select_from(UsageLog).where(UsageLog.user_id == user_id)
    if isinstance(action, (list, tuple)):
        q = q.where(UsageLog.action.in_(list(action)))
    else:
        q = q.where(UsageLog.action == action)
    if since is not None:
        q = q.where(UsageLog.created_at >= since)
    r = await db.execute(q)
    return r.scalar() or 0


async def _usage_profile(db, user_id):
    """Usage intensity used by the dynamic timers."""
    now = datetime.now(timezone.utc)
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    h1 = now - timedelta(hours=1)
    m10 = now - timedelta(minutes=10)
    return {
        "msgs_today": await _count(db, user_id, "message", start_today),
        "msgs_hour": await _count(db, user_id, "message", h1),
        "burst": await _count(db, user_id, "message", m10),
        "images_today": await _count(db, user_id, "image_gen", start_today),
        "files_today": await _count(db, user_id, ("file_upload", "file_edit", "file_tool", "document_gen"), start_today),
    }


def _intensity(prof):
    act = min(prof["msgs_today"] / 200.0, 1.0) * 0.25
    rapid = min(prof["msgs_hour"] / 60.0, 1.0) * 0.30
    burst = min(prof["burst"] / 30.0, 1.0) * 0.25
    media = min((prof["images_today"] + prof["files_today"]) / 20.0, 1.0) * 0.20
    return min(act + rapid + burst + media, 1.0)


def _free_timer_minutes(prof):
    i = _intensity(prof)
    return int(round(FREE_TIMER_MIN + i * (FREE_TIMER_MAX - FREE_TIMER_MIN)))


def _is_exploiting(prof):
    return prof["msgs_hour"] >= 60 or prof["burst"] >= 30 or (prof["images_today"] + prof["files_today"]) >= 15


def _pro_timer_minutes(prof):
    if _is_exploiting(prof):
        return PRO_EXPLOIT_TIMER
    i = min((prof["msgs_hour"] / 60.0) + (prof["files_today"] / 40.0), 1.0)
    return max(PRO_TIMER_MIN, int(round(PRO_TIMER_MIN + i * (PRO_TIMER_MAX - PRO_TIMER_MIN))))


async def check_limit(user: User, db: AsyncSession, action: str):
    # actions: image_gen, file_upload, file_edit, file_tool, document_gen, message
    is_guest = _is_guest(user)
    is_pro = _is_pro(user)
    is_ultimate = _is_ultimate(user)
    # Owner / Ultimate bypass all limits
    if user.role == "owner" or is_ultimate:
        return True

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Generic cooldown gate: while a cooldown timer runs, every limited action
    # is blocked (chat, images, files, voice-generation, everything).
    cd = _cooldown_remaining(user)
    if cd > 0:
        if is_guest:
            raise HTTPException(status_code=429, detail=f"Guest limit reached. Cooldown active — wait {_fmt_wait(cd)}. Please login for unlimited chat.")
        raise HTTPException(status_code=429, detail=f"Daily limit reached. Cooldown active — wait {_fmt_wait(cd)}.")

    if action == "message":
        if is_guest:
            count = await _count(db, user.id, "message", today_start)
            if count >= GUEST_MSG_LIMIT:
                # Guest pause window: 30 min, blocks chat AND image gen
                await _start_cooldown(db, user, GUEST_PAUSE_MIN)
                user.last_pause_at = now
                await db.commit()
                raise HTTPException(status_code=429, detail=f"Guest limit {GUEST_MSG_LIMIT} messages reached. Pause active — wait 30m 0s. Please login for unlimited chat.")
        db.add(UsageLog(user_id=user.id, action="message"))
        await db.commit()
        return True

    if action == "image_gen":
        # Guest: images stay blocked while inside the 30-min message pause
        if is_guest and user.last_pause_at:
            elapsed = (now - user.last_pause_at).total_seconds()
            if elapsed < GUEST_PAUSE_MIN * 60:
                remaining = int(GUEST_PAUSE_MIN * 60 - elapsed)
                raise HTTPException(status_code=429, detail=f"Guest pause: wait {_fmt_wait(remaining)}. Please login for unlimited. Image generation paused with chat.")
        count = await _count(db, user.id, "image_gen", today_start)
        limit = PRO_IMAGE_LIMIT if is_pro else (GUEST_IMAGE_LIMIT if is_guest else FREE_IMAGE_LIMIT)
        if count >= limit:
            if is_guest:
                raise HTTPException(status_code=429, detail=f"Guest limit {limit} image generations per day reached. Please login to continue.")
            minutes = _pro_timer_minutes(await _usage_profile(db, user.id)) if is_pro else _free_timer_minutes(await _usage_profile(db, user.id))
            await _raise_cooldown(db, user, minutes, False, "the daily image limit")
        db.add(UsageLog(user_id=user.id, action="image_gen"))
        db.add(UsageLog(user_id=user.id, action="message"))  # images count as messages
        await db.commit()
        return True

    if action in ("file_upload", "file_edit", "file_tool", "document_gen"):
        if is_guest:
            # Guests cannot use the file editor/generator system at all
            if action in ("file_edit", "file_tool", "document_gen"):
                raise HTTPException(status_code=403, detail="Guests are not allowed to use the file editor/generator. Please log in to continue.")
            # Uploads: guests keep 3/day (upsell only, no timer)
            count = await _count(db, user.id, "file_upload", today_start)
            if count >= GUEST_FILE_LIMIT:
                raise HTTPException(status_code=429, detail=f"Guest limit {GUEST_FILE_LIMIT} file uploads per day reached. Please login to continue.")
            db.add(UsageLog(user_id=user.id, action="file_upload"))
            db.add(UsageLog(user_id=user.id, action="message"))  # files count as messages
            await db.commit()
            return True
        if is_pro:
            # Pro keeps 100 uploads / edits per day (no file_tool cap)
            limit_map = {"file_upload": PRO_FILE_LIMIT, "file_edit": PRO_FILE_LIMIT}
            limit = limit_map.get(action)
            if limit:
                count = await _count(db, user.id, action, today_start)
                if count >= limit:
                    await _raise_cooldown(db, user, PRO_EXPLOIT_TIMER, False, "the daily file limit")
            db.add(UsageLog(user_id=user.id, action=action))
            db.add(UsageLog(user_id=user.id, action="message"))
            await db.commit()
            return True
        # Free logged-in: combined file editor/generator system — 10/day, then a fixed 1h cooldown
        count = await _count(db, user.id, ("file_upload", "file_edit", "file_tool", "document_gen"), today_start)
        if count >= FILE_TOOL_LIMIT:
            await _raise_cooldown(db, user, FILE_TOOL_COOLDOWN_MIN, False, "the file editor/generator limit")
        db.add(UsageLog(user_id=user.id, action="file_tool"))
        db.add(UsageLog(user_id=user.id, action="message"))  # files count as messages
        await db.commit()
        return True

    # Fallback: log unknown action and allow
    db.add(UsageLog(user_id=user.id, action=action))
    await db.commit()
    return True


async def check_chat_media_window(user: User, db: AsyncSession, chat_id: int):
    """Chat media window: after 5 image generations OR 15 file uploads inside a
    single chat, a logged-in user may send 15 more messages (images and files
    count as messages), then a long cooldown timer starts."""
    if user.role == "owner" or _is_ultimate(user):
        return True

    result = await db.execute(select(Message).where(Message.chat_id == chat_id).order_by(Message.id))
    msgs = result.scalars().all()

    images = 0
    files = 0
    anchor_id = None
    for m in msgs:
        c = m.content or ""
        hit = False
        if "[Image" in c or "![Generated image]" in c:
            images += 1
            hit = True
        if "[File:" in c:
            files += 1
            hit = True
        if hit and (images >= MEDIA_IMAGE_CAP or files >= MEDIA_FILE_CAP):
            anchor_id = m.id  # first message where either cap is met (the 5th image / 15th file)
            break
    if anchor_id is None:
        return True

    # The 15-message allowance begins at the 5th image / 15th file; images and
    # files count as messages. Once used up, a long timer starts.
    result = await db.execute(select(func.count()).select_from(Message).where(Message.chat_id == chat_id, Message.id > anchor_id))
    after = result.scalar() or 0
    if after >= MEDIA_MSGS_ALLOWED:
        is_guest = _is_guest(user)
        is_pro = _is_pro(user)
        if is_pro:
            minutes = _pro_timer_minutes(await _usage_profile(db, user.id))
        elif is_guest:
            minutes = GUEST_PAUSE_MIN
        else:
            minutes = _free_timer_minutes(await _usage_profile(db, user.id))  # long timer (1-18h)
        await _start_cooldown(db, user, minutes)
        if is_guest:
            raise HTTPException(status_code=429, detail=f"Guest limit reached (media window in this chat). Cooldown active — wait {_fmt_wait(minutes * 60)}. Please login for unlimited chat.")
        raise HTTPException(status_code=429, detail=f"Limit reached (media window in this chat). Cooldown active — wait {_fmt_wait(minutes * 60)}.")
    return True
