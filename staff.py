from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import StaffMessage, Feedback, User, get_db
from auth import get_current_user_from_cookie, is_staff, get_role, is_owner

router = APIRouter(prefix="/api/staff", tags=["staff"])


class StaffMessageRequest(BaseModel):
    content: str


REACTIONS = ("👍", "❤️", "😂", "🎉", "👀", "✅")
_typing: dict = {}          # user_id -> (username, role, unix time)


def _iso(dt):
    if not dt:
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


@router.get("/chat")
async def get_staff_chat(request: Request, db: AsyncSession = Depends(get_db)):
    import json
    import time as _time
    from datetime import timedelta
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    import perms as _perms; _perms.need(user, "team_chat")
    msgs = list(reversed((await db.execute(select(StaffMessage).order_by(StaffMessage.id.desc()).limit(200))).scalars().all()))
    by_id = {m.id: m for m in msgs}
    out = []
    for m in msgs:
        try:
            reacts = json.loads(m.reactions or "{}")
        except Exception:
            reacts = {}
        parent = by_id.get(m.reply_to) if m.reply_to else None
        out.append({"id": m.id, "user_id": m.user_id, "username": m.username, "role": m.role, "content": m.content,
                    "t": _iso(m.created_at), "created_at": m.created_at.strftime("%Y-%m-%d %H:%M") if m.created_at else "",
                    "mine": m.user_id == user.id, "edited": bool(m.edited),
                    "reactions": {k: v for k, v in reacts.items() if k in REACTIONS and v},
                    "reply": ({"id": parent.id, "username": parent.username, "text": parent.content[:120]} if parent else None)})
    cut = datetime.now(timezone.utc) - timedelta(minutes=5)
    staff = (await db.execute(select(User).where(User.is_deleted == False, (User.role.in_(("admin", "owner"))) | (User.is_admin == True))  # noqa: E712
                              .order_by(User.role.desc(), User.username.asc()))).scalars().all()
    now = _time.time()
    return {"messages": out,
            "staff": [{"id": u.id, "username": u.username, "role": get_role(u),
                       "online": bool(u.last_seen and (u.last_seen if u.last_seen.tzinfo else u.last_seen.replace(tzinfo=timezone.utc)) >= cut)} for u in staff],
            "typing": [name for uid, (name, _r, ts) in _typing.items() if uid != user.id and now - ts < 6],
            "reactions": list(REACTIONS), "me": {"id": user.id, "role": get_role(user)}}


class StaffPost(BaseModel):
    content: str
    reply_to: int | None = None


@router.post("/chat")
async def post_staff_chat(req: StaffPost, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    import perms as _perms; _perms.need(user, "team_chat")
    content = req.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message required")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Message too long")
    reply_to = None
    if req.reply_to:
        parent = await db.get(StaffMessage, int(req.reply_to))
        reply_to = parent.id if parent else None
    msg = StaffMessage(user_id=user.id, username=user.username, role=get_role(user), content=content, reply_to=reply_to)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    _typing.pop(user.id, None)
    return {"id": msg.id, "message": "Sent"}


@router.post("/chat/typing")
async def staff_typing(request: Request, db: AsyncSession = Depends(get_db)):
    import time as _time
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    import perms as _perms; _perms.need(user, "team_chat")
    _typing[user.id] = (user.username, get_role(user), _time.time())
    return {"ok": True}


class StaffEdit(BaseModel):
    content: str


@router.patch("/chat/{message_id}")
async def edit_staff_message(message_id: int, req: StaffEdit, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    import perms as _perms; _perms.need(user, "team_chat")
    m = await db.get(StaffMessage, message_id)
    if not m:
        raise HTTPException(status_code=404, detail="Message not found")
    if m.user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own messages")
    content = req.content.strip()
    if not content or len(content) > 2000:
        raise HTTPException(status_code=400, detail="A message needs 1–2000 characters")
    m.content, m.edited = content, True
    await db.commit()
    return {"ok": True}


@router.delete("/chat/{message_id}")
async def delete_staff_message(message_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    import perms as _perms; _perms.need(user, "team_chat")
    m = await db.get(StaffMessage, message_id)
    if not m:
        raise HTTPException(status_code=404, detail="Message not found")
    if m.user_id != user.id and not is_owner(user):
        raise HTTPException(status_code=403, detail="You can only delete your own messages")
    await db.delete(m)
    await db.commit()
    return {"ok": True}


class StaffReact(BaseModel):
    emoji: str


@router.post("/chat/{message_id}/react")
async def react_staff_message(message_id: int, req: StaffReact, request: Request, db: AsyncSession = Depends(get_db)):
    import json
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    import perms as _perms; _perms.need(user, "team_chat")
    if req.emoji not in REACTIONS:
        raise HTTPException(status_code=400, detail="Unknown reaction")
    m = await db.get(StaffMessage, message_id)
    if not m:
        raise HTTPException(status_code=404, detail="Message not found")
    try:
        reacts = json.loads(m.reactions or "{}")
    except Exception:
        reacts = {}
    who = [n for n in reacts.get(req.emoji, []) if isinstance(n, str)]
    if user.username in who:
        who.remove(user.username)
    else:
        who.append(user.username)
    reacts[req.emoji] = who
    m.reactions = json.dumps({k: v for k, v in reacts.items() if v})
    await db.commit()
    return {"ok": True}


@router.delete("/chat")
async def clear_staff_chat(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Only The Owner can clear the staff chat")
    from sqlalchemy import delete
    await db.execute(delete(StaffMessage))
    await db.commit()
    return {"message": "Staff chat cleared"}


@router.get("/attention")
async def staff_attention(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    from sqlalchemy import func
    from database import FbTicket
    unanswered_feedback = (await db.execute(select(func.count()).select_from(FbTicket).where(FbTicket.staff_unread > 0, FbTicket.kind != "request", FbTicket.kind != "pulse"))).scalar() or 0
    pending_requests = (await db.execute(select(func.count()).select_from(FbTicket).where(FbTicket.staff_unread > 0, FbTicket.kind == "request"))).scalar() or 0
    recent_ban_result = await db.execute(select(User).where(User.is_banned == True, User.is_deleted == False).order_by(User.id.desc()).limit(10))
    banned_users = [{"username": u.username, "reason": u.ban_reason or "", "by": u.banned_by or "admin"} for u in recent_ban_result.scalars().all()]
    recent_feeds = (await db.execute(select(FbTicket).where(FbTicket.staff_unread > 0, FbTicket.kind != "pulse").order_by(FbTicket.updated_at.desc()).limit(10))).scalars().all()
    pending = [{"id": f.id, "username": f.username, "content": (f.content or "")[:120], "created_at": f.created_at.strftime("%Y-%m-%d %H:%M") if f.created_at else ""} for f in recent_feeds]
    return {"unanswered_feedback": unanswered_feedback, "pending_requests": pending_requests, "banned_users": banned_users, "pending_feedback": pending}
