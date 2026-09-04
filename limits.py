from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from database import User, UsageLog, get_db
from fastapi import HTTPException

# Free: 5 images/day, 15 uploads/day, 5 file edits/day
# Guest: 3 uploads, 2 images, 1 edit per day, 30 min pause after 60 msgs

async def check_limit(user: User, db: AsyncSession, action: str):
    # action: image_gen, file_upload, file_edit, message
    is_guest = user.username.startswith("guest_")
    is_pro = user.is_pro or (user.trial_end and user.trial_end > datetime.now(timezone.utc))
    is_ultimate = user.is_ultimate
    # Owner/Admin bypass? Owner has no limits, Admin also? Let's let owner/ultimate bypass all except maybe not needed
    if user.role == "owner" or is_ultimate:
        return True
    if is_pro:
        # Pro: 100 images/day, 100 uploads/day, unlimited edits? spec says Pro: give them 100? We'll set Pro 100 each
        limits = {"image_gen": 100, "file_upload": 100, "file_edit": 100, "message": 1000}
    elif is_guest:
        limits = {"image_gen": 2, "file_upload": 3, "file_edit": 1, "message": 60}
    else:  # free
        limits = {"image_gen": 5, "file_upload": 15, "file_edit": 5, "message": 1000}  # free chat forever, but image/file window 20 msgs handled elsewhere

    limit = limits.get(action, 1000)
    # While a guest is inside the post-limit pause window, image generation stays blocked too
    if is_guest and action == "image_gen" and user.last_pause_at:
        elapsed = (datetime.now(timezone.utc) - user.last_pause_at).total_seconds()
        if elapsed < 30 * 60:
            remaining = int(30 * 60 - elapsed)
            raise HTTPException(status_code=429, detail=f"Guest pause: wait {remaining//60}m {remaining%60}s. Please login for unlimited.")
    # Count today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    result = await db.execute(select(func.count()).select_from(UsageLog).where(UsageLog.user_id == user.id, UsageLog.action == action, UsageLog.created_at >= today_start))
    count = result.scalar() or 0
    if count >= limit:
        # Guest pause after the daily messaging budget runs out
        if is_guest and action == "message":
            # Check last_pause_at
            if user.last_pause_at and (datetime.now(timezone.utc) - user.last_pause_at).total_seconds() < 30*60:
                remaining = int(30*60 - (datetime.now(timezone.utc) - user.last_pause_at).total_seconds())
                raise HTTPException(status_code=429, detail=f"Guest pause: wait {remaining//60}m {remaining%60}s after 60 messages. Please login for unlimited.")
            # If 60 reached, set pause
            user.last_pause_at = datetime.now(timezone.utc)
            await db.commit()
            raise HTTPException(status_code=429, detail="Guest limit 60 messages reached. 30 minute pause. Please login for unlimited chat.")
        # For other limits, prompt upgrade
        if is_guest:
            raise HTTPException(status_code=429, detail=f"Guest limit {limit} {action} per day reached. Please login to continue.")
        else:
            raise HTTPException(status_code=429, detail=f"Free limit {limit} {action} per day reached. Upgrade to Pro for 100/day or Ultimate unlimited.")

    # Log usage
    log = UsageLog(user_id=user.id, action=action)
    db.add(log)
    await db.commit()
    return True

async def check_image_file_window(user: User, db: AsyncSession, chat_id: int):
    # Free: up to 20 messages from point of image generation or file upload
    is_guest = user.username.startswith("guest_")
    is_pro = user.is_pro or (user.trial_end and user.trial_end > datetime.now(timezone.utc))
    is_ultimate = user.is_ultimate
    if user.role == "owner" or is_ultimate or is_pro:
        return True
    # For free/guest, check if last image/file is within 20 messages
    # Count messages since last image/file upload in this chat
    from database import Message
    result = await db.execute(select(Message).where(Message.chat_id == chat_id).order_by(Message.id.desc()).limit(30))
    msgs = result.scalars().all()
    # Find last image/file marker: we store display_content with [File: or [Image
    # Simpler: count messages after last image/file log in UsageLog for this chat? But UsageLog not per chat.
    # For now, just allow 20 messages after last image/file in this chat by checking Message content
    count_since = 0
    for m in msgs:
        if "[Image" in m.content or "[File:" in m.content:
            break
        count_since += 1
    if count_since >= 20:
        raise HTTPException(status_code=429, detail="Free limit: 20 messages after image/file. Upgrade to Pro for unlimited.")
    return True
