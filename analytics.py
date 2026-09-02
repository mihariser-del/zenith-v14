from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta

from database import get_db, User, Chat, Message, LoginHistory
from auth import get_current_user_from_cookie, is_staff

router = APIRouter(prefix="/api/auth/admin/analytics", tags=["analytics"])


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
    online_users = (await db.execute(select(func.count(func.distinct(Chat.user_id))).select_from(Chat).join(User, Chat.user_id == User.id).where(Chat.updated_at >= now - timedelta(minutes=5), User.is_deleted == False))).scalar() or 0
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
async def all_chats(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
    from sqlalchemy.orm import selectinload
    result = await db.execute(select(Chat).options(selectinload(Chat.user)).order_by(Chat.updated_at.desc()).limit(100))
    chats = result.scalars().all()
    out = []
    for c in chats:
        msg_count = (await db.execute(select(func.count()).select_from(Message).where(Message.chat_id == c.id))).scalar() or 0
        out.append({
            "id": c.id, "title": c.title, "user_id": c.user_id,
            "username": c.user.username if c.user else "?",
            "message_count": msg_count,
            "created_at": c.created_at.strftime("%Y-%m-%d %H:%M") if c.created_at else "",
            "updated_at": c.updated_at.strftime("%Y-%m-%d %H:%M") if c.updated_at else "",
        })
    return {"chats": out}


@router.get("/all-messages")
async def all_messages(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(select(Message).join(Chat).order_by(Message.created_at.desc()).limit(100))
    msgs = result.scalars().all()
    out = []
    for m in msgs:
        chat = (await db.execute(select(Chat).where(Chat.id == m.chat_id))).scalar_one_or_none()
        out.append({
            "id": m.id, "chat_id": m.chat_id, "role": m.role,
            "content": m.content[:200], "chat_title": chat.title if chat else "?",
            "created_at": m.created_at.strftime("%Y-%m-%d %H:%M") if m.created_at else "",
        })
    return {"messages": out}


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
    return Response(content="\n".join(lines), media_type="text/plain", headers={"Content-Disposition": 'attachment; filename="zenith_messages.txt'})


@router.get("/login-history-all")
async def login_history_all(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(select(LoginHistory).join(User).order_by(LoginHistory.login_at.desc()).limit(100))
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
    return {"history": out}
