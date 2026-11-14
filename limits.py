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


def _as_utc(dt):
    """SQLite returns naive datetimes; treat them as UTC so we never subtract a
    naive from an aware datetime (which raises TypeError and 500s the request)."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# Plans that only last until users.trial_end (free trial, invite rewards, timed gifts).
TIMED_PLANS = ("pro_trial", "referral_pro", "invite_pro", "invite_ultimate", "gift_ultimate_until")


def _timed_active(user) -> bool:
    return bool(user.trial_end and _as_utc(user.trial_end) > datetime.now(timezone.utc))


def _is_pro(user):
    if (getattr(user, "pro_plan", "") or "") in TIMED_PLANS:
        return _timed_active(user)          # a trial or reward stops when its time is up
    return bool(user.is_pro or _timed_active(user))


def _is_ultimate(user):
    if getattr(user, "role", "") == "owner":
        return True
    # Friends of the Owner get Ultimate-level limits.
    if (getattr(user, "pro_plan", "") or "") in ("gift_ultimate_until", "invite_ultimate"):
        # Ultimate gifted from the Vault (or earned by inviting) for a set number of days.
        end = getattr(user, "trial_end", None)
        if not end or _as_utc(end) <= datetime.now(timezone.utc):
            return "friend" in (getattr(user, "tags", "") or "").lower().split(",")
    elif (getattr(user, "pro_plan", "") or "") in TIMED_PLANS:
        return "friend" in (getattr(user, "tags", "") or "").lower().split(",")
    return bool(user.is_ultimate) or "friend" in (getattr(user, "tags", "") or "").lower().split(",")


def _fmt_wait(seconds):
    mm, ss = divmod(int(seconds), 60)
    return f"{mm}m {ss}s"


def _cooldown_remaining(user):
    """Remaining cooldown seconds for logged-in tiers; clears the flag when expired."""
    now = datetime.now(timezone.utc)
    if not user.cooldown_until:
        return 0
    rem = int((_as_utc(user.cooldown_until) - now).total_seconds())
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
    """One gate for everything that costs money: messages, pictures, files, videos.
    The numbers come from the Vault (System → Limits), not from this file."""
    import limits_config as LC
    # An account without a real email can't keep using the AI once its grace period is over.
    import emailcheck
    emailcheck.require_ok(user)
    if user.role == "owner":
        return True

    plan = LC.plan_of(user)
    nums = (await LC.load(db)).get(plan, LC.DEFAULTS["free"])
    is_guest = _is_guest(user)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # While a pause is running, nothing that costs money is allowed.
    cd = _cooldown_remaining(user)
    if cd > 0:
        raise HTTPException(status_code=429, detail=(
            f"You've used everything for today. You can carry on in {_fmt_wait(cd)}."
            + (" Create a free account for more." if is_guest else "")),
            headers={"X-Limit": "cooldown"})

    FOR = {"message": "messages", "image_gen": "images", "video_gen": "videos",
           "file_upload": "files", "file_edit": "files", "file_tool": "files", "document_gen": "files"}
    key = FOR.get(action)
    if key is None:
        db.add(UsageLog(user_id=user.id, action=action))
        await db.commit()
        return True

    limit = nums.get(key)
    if limit is not None:
        if limit <= 0:
            raise HTTPException(status_code=403, detail=_blocked_msg(key, is_guest), headers={"X-Limit": key})
        actions = ("file_upload", "file_edit", "file_tool", "document_gen") if key == "files" else action
        used = await _count(db, user.id, actions, today_start)
        if used >= limit:
            mins = int(nums.get("cooldown") or 0)
            if mins > 0:
                await _start_cooldown(db, user, mins)
                if is_guest:
                    user.last_pause_at = now
                await db.commit()
            raise HTTPException(status_code=429, detail=_used_up_msg(key, limit, mins, is_guest), headers={"X-Limit": key})

    db.add(UsageLog(user_id=user.id, action=action))
    if action != "message":
        db.add(UsageLog(user_id=user.id, action="message"))   # pictures, files and videos count as messages too
    await db.commit()
    return True


_THING = {"messages": ["message", "messages"], "images": ["picture", "pictures"], "files": ["file", "files"],
          "videos": ["video", "videos"], "mini": ["Mini task", "Mini tasks"]}


def _blocked_msg(key, is_guest) -> str:
    one, many = _THING.get(key, ["thing", "things"])
    if is_guest:
        return f"{many.capitalize()} aren't available to guests. Create a free account to use them."
    return f"{many.capitalize()} aren't included in your plan. See the plans to unlock them."


def _used_up_msg(key, limit, mins, is_guest) -> str:
    one, many = _THING.get(key, ["thing", "things"])
    what = f"all {limit} {many if limit != 1 else one}" if key != "messages" else f"all {limit} messages"
    when = f" You can carry on in {mins} minutes." if mins else " They come back at midnight (UTC)."
    more = " Create a free account for more." if is_guest else " Upgrade for more."
    return f"You've used {what} for today.{when}{more}"


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


async def expire_timed_plans():
    """Switch off trials and rewards whose time is up (called every few minutes)."""
    from sqlalchemy import select
    from database import async_session
    now = datetime.now(timezone.utc)
    async with async_session() as db:
        rows = (await db.execute(select(User).where(User.pro_plan.in_(TIMED_PLANS), User.trial_end != None))).scalars().all()  # noqa: E711
        n = 0
        for u in rows:
            if _as_utc(u.trial_end) <= now and (u.is_pro or u.is_ultimate):
                u.is_pro = False
                u.is_ultimate = False
                n += 1
        if n:
            await db.commit()
            print(f"[plans] {n} trial/reward plan(s) ended")
