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


@router.get("/chat")
async def get_staff_chat(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    result = await db.execute(select(StaffMessage).order_by(StaffMessage.created_at.desc()).limit(200))
    msgs = result.scalars().all()
    msgs = list(reversed(msgs))
    return {"messages": [
        {
            "id": m.id,
            "username": m.username,
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.strftime("%Y-%m-%d %H:%M") if m.created_at else "",
        } for m in msgs
    ]}


@router.post("/chat")
async def post_staff_chat(req: StaffMessageRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    content = req.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message required")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Message too long")
    msg = StaffMessage(user_id=user.id, username=user.username, role=get_role(user), content=content)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return {"id": msg.id, "message": "Sent"}


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
    unanswered_feedback = (await db.execute(select(func.count()).select_from(Feedback).where(Feedback.response == ""))).scalar() or 0
    recent_ban_result = await db.execute(select(User).where(User.is_banned == True, User.is_deleted == False).order_by(User.id.desc()).limit(10))
    banned_users = [{"username": u.username, "reason": u.ban_reason or "", "by": u.banned_by or "admin"} for u in recent_ban_result.scalars().all()]
    recent_feeds = (await db.execute(select(Feedback).order_by(Feedback.created_at.desc()).limit(10))).scalars().all()
    pending = [{"id": f.id, "username": f.username, "content": (f.content or "")[:120], "created_at": f.created_at.strftime("%Y-%m-%d %H:%M") if f.created_at else ""} for f in recent_feeds if not f.response]
    return {"unanswered_feedback": unanswered_feedback, "banned_users": banned_users, "pending_feedback": pending}
