from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta

from database import get_db, User, Chat, Message, LoginHistory, Referral, UserSettings, Memory
from auth import get_current_user_from_cookie, is_staff, get_role
from audit import log_action

router = APIRouter(prefix="/api/auth/admin/analytics", tags=["analytics"])


@router.get("/referrals")
async def referral_analytics(request: Request, db: AsyncSession = Depends(get_db)):
    from fastapi import HTTPException
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Admin only")
    now = datetime.now(timezone.utc)
    total = (await db.execute(select(func.count()).select_from(Referral))).scalar() or 0
    rewarded = (await db.execute(select(func.count()).select_from(Referral).where(Referral.rewarded == True))).scalar() or 0
    distinct_referrers = (await db.execute(select(func.count(func.distinct(Referral.referrer_id))).select_from(Referral))).scalar() or 0
    # Signups via referral per day (last 14 days)
    days = []
    for i in range(13, -1, -1):
        d = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        d_next = d + timedelta(days=1)
        count = (await db.execute(select(func.count()).select_from(Referral).where(Referral.created_at >= d, Referral.created_at < d_next))).scalar() or 0
        days.append({"date": d.strftime("%Y-%m-%d"), "count": count})
    # Top referrers
    rows = await db.execute(
        select(Referral.referrer_id, Referral.rewarded, User.username)
        .join(User, User.id == Referral.referrer_id)
        .order_by(Referral.referrer_id)
    )
    tally = {}
    for rid, rew, uname in rows.all():
        t = tally.setdefault(uname, {"total": 0, "rewarded": 0})
        t["total"] += 1
        if rew:
            t["rewarded"] += 1
    top = [{"username": k, "total": v["total"], "rewarded": v["rewarded"]} for k, v in tally.items()]
    top.sort(key=lambda x: x["total"], reverse=True)
    return {"total": total, "rewarded": rewarded, "distinct_referrers": distinct_referrers, "days": days, "top": top[:20]}


@router.get("/overview")
async def analytics_overview(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    total_users = (await db.execute(select(func.count()).select_from(User).where(User.is_deleted == False))).scalar() or 0
    total_chats = (await db.execute(select(func.count()).select_from(Chat))).scalar() or 0
    total_messages = (await db.execute(select(func.count()).select_from(Message))).scalar() or 0
    banned_count = (await db.execute(select(func.count()).select_from(User).where(User.is_banned == True, User.is_deleted == False))).scalar() or 0
    deleted_count = (await db.execute(select(func.count()).select_from(User).where(User.is_deleted == True))).scalar() or 0
    admin_count = (await db.execute(select(func.count()).select_from(User).where(User.role == "admin", User.is_deleted == False))).scalar() or 0
    owner_count = (await db.execute(select(func.count()).select_from(User).where(User.role == "owner", User.is_deleted == False))).scalar() or 0
    guest_count = (await db.execute(select(func.count()).select_from(User).where(User.username.like("guest_%"), User.is_deleted == False))).scalar() or 0
    messages_today = (await db.execute(select(func.count()).select_from(Message).where(Message.created_at >= today_start))).scalar() or 0
    new_this_week = (await db.execute(select(func.count()).select_from(User).where(User.created_at >= week_ago, User.is_deleted == False))).scalar() or 0
    online_users = (await db.execute(select(func.count()).select_from(User).where(User.last_seen >= now - timedelta(seconds=10), User.is_deleted == False))).scalar() or 0
    active_chats = (await db.execute(select(func.count()).select_from(Chat).where(Chat.updated_at >= now - timedelta(hours=24)))).scalar() or 0
    suspended_count = (await db.execute(select(func.count()).select_from(User).where(User.is_banned == True, User.is_deleted == False))).scalar() or 0
    verified_count = total_users - guest_count
    pro_count = (await db.execute(select(func.count()).select_from(User).where(User.is_pro == True, User.is_deleted == False))).scalar() or 0
    ultimate_count = (await db.execute(select(func.count()).select_from(User).where(User.is_ultimate == True, User.is_deleted == False))).scalar() or 0

    return {
        "total_users": total_users, "total_chats": total_chats, "total_messages": total_messages,
        "banned_count": banned_count, "deleted_count": deleted_count, "admin_count": admin_count,
        "owner_count": owner_count, "guest_count": guest_count, "messages_today": messages_today,
        "new_this_week": new_this_week, "online_users": online_users, "active_chats": active_chats,
        "suspended_count": suspended_count, "verified_count": verified_count,
        "pro_count": pro_count, "ultimate_count": ultimate_count,
    }


@router.get("/messages-per-day")
async def messages_per_day(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
    now = datetime.now(timezone.utc)
    days = []
    for i in range(29, -1, -1):
        d = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        d_next = d + timedelta(days=1)
        count = (await db.execute(select(func.count()).select_from(Message).where(Message.created_at >= d, Message.created_at < d_next))).scalar() or 0
        days.append({"date": d.strftime("%Y-%m-%d"), "count": count})
    return {"days": days}


@router.get("/chats-per-day")
async def chats_per_day(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
    now = datetime.now(timezone.utc)
    days = []
    for i in range(29, -1, -1):
        d = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        d_next = d + timedelta(days=1)
        count = (await db.execute(select(func.count()).select_from(Chat).where(Chat.created_at >= d, Chat.created_at < d_next))).scalar() or 0
        days.append({"date": d.strftime("%Y-%m-%d"), "count": count})
    return {"days": days}


@router.get("/accounts-per-day")
async def accounts_per_day(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
    now = datetime.now(timezone.utc)
    days = []
    for i in range(29, -1, -1):
        d = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        d_next = d + timedelta(days=1)
        count = (await db.execute(select(func.count()).select_from(User).where(User.created_at >= d, User.created_at < d_next, User.is_deleted == False))).scalar() or 0
        days.append({"date": d.strftime("%Y-%m-%d"), "count": count})
    return {"days": days}


@router.get("/messages-per-hour")
async def messages_per_hour(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    hours = []
    for h in range(24):
        hour_start = today_start + timedelta(hours=h)
        hour_end = hour_start + timedelta(hours=1)
        count = (await db.execute(select(func.count()).select_from(Message).where(Message.created_at >= hour_start, Message.created_at < hour_end))).scalar() or 0
        hours.append({"hour": h, "count": count})
    return {"hours": hours}


@router.get("/all-chats")
async def all_chats(request: Request, limit: int = 50, offset: int = 0, db: AsyncSession = Depends(get_db)):
    from fastapi import HTTPException
    from sqlalchemy import func as _func
    from sqlalchemy.orm import selectinload
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Admin only")
    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)
    total = (await db.execute(select(_func.count()).select_from(Chat))).scalar() or 0
    result = await db.execute(select(Chat).options(selectinload(Chat.user)).order_by(Chat.updated_at.desc()).limit(limit).offset(offset))
    chats = result.scalars().all()
    out = []
    for c in chats:
        if get_role(user) != "owner":
            owner = c.user
            if owner and get_role(owner) in ("admin", "owner"):
                continue
        msg_count = (await db.execute(select(_func.count()).select_from(Message).where(Message.chat_id == c.id))).scalar() or 0
        out.append({
            "id": c.id, "title": c.title, "user_id": c.user_id,
            "username": c.user.username if c.user else "?",
            "message_count": msg_count,
            "created_at": c.created_at.strftime("%Y-%m-%d %H:%M") if c.created_at else "",
            "updated_at": c.updated_at.strftime("%Y-%m-%d %H:%M") if c.updated_at else "",
        })
    return {"chats": out, "total": total, "offset": offset, "limit": limit}


@router.get("/all-messages")
async def all_messages(request: Request, limit: int = 100, offset: int = 0, db: AsyncSession = Depends(get_db)):
    from fastapi import HTTPException
    from sqlalchemy import func as _func
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Admin only")
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)
    total = (await db.execute(select(_func.count()).select_from(Message))).scalar() or 0
    result = await db.execute(select(Message).join(Chat).order_by(Message.created_at.desc()).limit(limit).offset(offset))
    msgs = result.scalars().all()
    out = []
    for m in msgs:
        chat = (await db.execute(select(Chat).where(Chat.id == m.chat_id))).scalar_one_or_none()
        if get_role(user) != "owner" and chat:
            cowner = (await db.execute(select(User).where(User.id == chat.user_id))).scalar_one_or_none()
            if cowner and get_role(cowner) in ("admin", "owner"):
                continue
        out.append({
            "id": m.id, "chat_id": m.chat_id, "role": m.role,
            "content": m.content[:200], "chat_title": chat.title if chat else "?",
            "created_at": m.created_at.strftime("%Y-%m-%d %H:%M") if m.created_at else "",
        })
    return {"messages": out, "total": total, "offset": offset, "limit": limit}


@router.get("/chat/{chat_id}/messages")
async def chat_messages_admin(chat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    from fastapi import HTTPException
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Admin only")
    from sqlalchemy.orm import selectinload
    result = await db.execute(select(Chat).where(Chat.id == chat_id).options(selectinload(Chat.messages)))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    owner = (await db.execute(select(User).where(User.id == chat.user_id))).scalar_one_or_none()
    if owner and get_role(owner) in ("admin", "owner") and get_role(user) != "owner":
        raise HTTPException(status_code=403, detail="Admins cannot view fellow staff chats")
    return {
        "chat": {"id": chat.id, "title": chat.title, "user_id": chat.user_id, "username": owner.username if owner else "?"},
        "messages": [{"role": m.role, "content": m.content, "created_at": m.created_at.strftime("%Y-%m-%d %H:%M") if m.created_at else ""} for m in chat.messages],
    }


@router.get("/export/users")
async def export_users(request: Request, db: AsyncSession = Depends(get_db)):
    from fastapi import HTTPException
    from fastapi.responses import Response
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()

    def esc(v):
        s = str(v) if v is not None else ""
        return '"' + s.replace('"', '""') + '"' if ("," in s or '"' in s or "\n" in s) else s

    lines = ["id,username,email,role,is_admin,is_banned,is_deleted,is_pro,is_ultimate,created_at,last_active"]
    for u in users:
        last_chat = (await db.execute(select(Chat.updated_at).where(Chat.user_id == u.id).order_by(Chat.updated_at.desc()).limit(1))).scalar_one_or_none()
        row = [u.id, u.username, u.email, get_role(u), u.is_admin, u.is_banned, u.is_deleted, u.is_pro, u.is_ultimate,
               u.created_at.strftime("%Y-%m-%d %H:%M") if u.created_at else "",
               last_chat.strftime("%Y-%m-%d %H:%M") if last_chat else ""]
        lines.append(",".join(esc(v) for v in row))
    return Response(content="\n".join(lines), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="zenith_users.csv"'})


@router.get("/export/chats")
async def export_chats(request: Request, db: AsyncSession = Depends(get_db)):
    from fastapi import HTTPException
    from fastapi.responses import Response
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(select(Chat).order_by(Chat.updated_at.desc()))
    chats = result.scalars().all()
    lines = []
    for c in chats:
        owner = (await db.execute(select(User).where(User.id == c.user_id))).scalar_one_or_none()
        lines.append(f"=== Chat #{c.id} [{c.title}] by {owner.username if owner else '?'} ({c.updated_at}) ===")
        msgs = await db.execute(select(Message).where(Message.chat_id == c.id).order_by(Message.id))
        for m in msgs.scalars().all():
            lines.append(f"[{m.created_at}] {m.role}: {m.content}")
        lines.append("")
    return Response(content="\n".join(lines), media_type="text/plain", headers={"Content-Disposition": 'attachment; filename="zenith_chats.txt'})


@router.get("/export/messages")
async def export_messages(request: Request, db: AsyncSession = Depends(get_db)):
    from fastapi import HTTPException
    from fastapi.responses import Response
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(select(Message).order_by(Message.created_at.desc()).limit(2000))
    msgs = result.scalars().all()
    lines = [f"{m.created_at} | chat#{m.chat_id} | {m.role} | {m.content}" for m in msgs]
    await log_action(db=db, request=request, actor=user, action="export_data", detail="Exported all messages")
    return Response(content="\n".join(lines), media_type="text/plain", headers={"Content-Disposition": 'attachment; filename="zenith_messages.txt'})


@router.get("/export/user/{user_id}")
async def export_single_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Per-user data export: account info + all chats/messages + memories."""
    from fastapi import HTTPException
    from fastapi.responses import Response
    from sqlalchemy.orm import selectinload
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin):
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target_role = get_role(target)
    if target_role in ("admin", "owner") and get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Admins cannot export fellow staff data")
    import json
    lines = []
    lines.append("ZELPOPHAI AI — PER-USER DATA EXPORT")
    lines.append("=" * 50)
    lines.append(f"User ID: {target.id}")
    lines.append(f"Username: {target.username}")
    lines.append(f"Email: {target.email}")
    lines.append(f"Role: {target_role}")
    lines.append(f"Created: {target.created_at}")
    lines.append(f"Banned: {target.is_banned} | Deleted: {target.is_deleted} | Pro: {target.is_pro} | Ultimate: {target.is_ultimate}")
    lines.append("")
    user_settings = (await db.execute(select(UserSettings).where(UserSettings.user_id == target.id))).scalar_one_or_none()
    if user_settings:
        lines.append(f"System prompt: {user_settings.system_prompt}")
        lines.append(f"Model: {user_settings.model} | Max tokens: {user_settings.max_tokens} | Temp: {user_settings.temperature}")
        lines.append("")
    mem_result = await db.execute(select(Memory).where(Memory.user_id == target.id).order_by(Memory.created_at.desc()).limit(500))
    memories = mem_result.scalars().all()
    if memories:
        lines.append("MEMORIES")
        lines.append("-" * 50)
        for m in memories:
            lines.append(f"[{m.created_at}] ({m.category}) {m.content}")
        lines.append("")
    chat_result = await db.execute(select(Chat).where(Chat.user_id == target.id).order_by(Chat.updated_at.desc()))
    chats = chat_result.scalars().all()
    lines.append(f"CHATS ({len(chats)})")
    lines.append("-" * 50)
    for c in chats:
        lines.append("")
        lines.append(f"=== Chat #{c.id} [{c.title}] created {c.created_at} updated {c.updated_at} ===")
        msg_result = await db.execute(select(Message).where(Message.chat_id == c.id).order_by(Message.id))
        for m in msg_result.scalars().all():
            lines.append(f"[{m.created_at}] {m.role}: {m.content}")
    await log_action(db=db, request=request, actor=admin, action="export_data", target_id=target.id, target_username=target.username, detail="Per-user data export")
    content = "\n".join(lines)
    return Response(content=content, media_type="text/plain", headers={"Content-Disposition": f'attachment; filename="zenith_user_{target.username}_{target.id}.txt'})


@router.get("/login-history-all")
async def login_history_all(request: Request, limit: int = 100, offset: int = 0, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)
    total = (await db.execute(select(func.count()).select_from(LoginHistory))).scalar() or 0
    result = await db.execute(select(LoginHistory).join(User).order_by(LoginHistory.login_at.desc()).limit(limit).offset(offset))
    entries = result.scalars().all()
    out = []
    for e in entries:
        u = (await db.execute(select(User).where(User.id == e.user_id))).scalar_one_or_none()
        out.append({
            "id": e.id, "user_id": e.user_id, "username": u.username if u else "?",
            "ip_address": e.ip_address, "user_agent": e.user_agent[:80],
            "login_at": e.login_at.strftime("%Y-%m-%d %H:%M UTC") if e.login_at else "",
            "success": e.success,
        })
    return {"history": out, "total": total, "offset": offset, "limit": limit}
