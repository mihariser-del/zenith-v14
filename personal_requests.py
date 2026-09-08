from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import UserRequest, get_db
from auth import get_current_user_from_cookie, is_staff, get_role

router = APIRouter(prefix="/api/requests", tags=["requests"])


class CreateRequestModel(BaseModel):
    content: str


class RespondRequestModel(BaseModel):
    response: str


@router.post("")
async def create_request(req: CreateRequestModel, request: Request, db: AsyncSession = Depends(get_db)):
    # Personal Request system: any logged-in user (including guests) sends what they
    # personally want to the staff; an admin/owner receives it and replies.
    user = await get_current_user_from_cookie(request, db)
    content = req.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Request content required")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Request too long (max 2000 chars)")
    r = UserRequest(user_id=user.id, username=user.username, content=content, reply="")
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return {"id": r.id, "message": "Request submitted"}


@router.get("/my")
async def get_my_requests(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(select(UserRequest).where(UserRequest.user_id == user.id).order_by(UserRequest.created_at.desc()))
    requests = result.scalars().all()
    return {"requests": [
        {
            "id": r.id,
            "username": r.username,
            "content": r.content,
            "reply": r.reply or "",
            "reply_by": r.reply_by or "",
            "created_at": r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else "",
            "responded_at": r.responded_at.strftime("%Y-%m-%d %H:%M") if r.responded_at else "",
        } for r in requests
    ]}


@router.get("/admin")
async def get_all_requests(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(select(UserRequest).order_by(UserRequest.created_at.desc()))
    requests = result.scalars().all()
    return {"requests": [
        {
            "id": r.id,
            "user_id": r.user_id,
            "username": r.username,
            "content": r.content,
            "reply": r.reply or "",
            "reply_by": r.reply_by or "",
            "created_at": r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else "",
            "responded_at": r.responded_at.strftime("%Y-%m-%d %H:%M") if r.responded_at else "",
        } for r in requests
    ]}


@router.post("/{request_id}/respond")
async def respond_request(request_id: int, req: RespondRequestModel, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(select(UserRequest).where(UserRequest.id == request_id))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    text = req.response.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Reply required")
    r.reply = text[:2000]
    acted_by = get_role(user)
    r.reply_by = "owner" if acted_by == "owner" else "admin"
    r.responded_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Reply sent"}


@router.delete("/{request_id}")
async def delete_request(request_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(select(UserRequest).where(UserRequest.id == request_id))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    # Staff can delete any request; users can delete their own.
    if not is_staff(user) and r.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not allowed to delete this request")
    await db.delete(r)
    await db.commit()
    return {"message": "Request deleted"}