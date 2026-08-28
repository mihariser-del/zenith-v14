from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import Feedback, get_db
from auth import get_current_user_from_cookie

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


class CreateFeedbackRequest(BaseModel):
    content: str


class RespondFeedbackRequest(BaseModel):
    response: str


def _is_guest(user) -> bool:
    return user.username.startswith("guest_")


@router.post("")
async def create_feedback(req: CreateFeedbackRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if _is_guest(user):
        raise HTTPException(status_code=403, detail="Feedback limited please login to use")
    content = req.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Feedback content required")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Feedback too long (max 2000 chars)")
    fb = Feedback(user_id=user.id, username=user.username, content=content, response="")
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return {"id": fb.id, "message": "Feedback submitted"}


@router.get("")
async def get_own_feedback(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if _is_guest(user):
        raise HTTPException(status_code=403, detail="Feedback limited please login to use")
    result = await db.execute(select(Feedback).where(Feedback.user_id == user.id).order_by(Feedback.created_at.desc()))
    feedbacks = result.scalars().all()
    return {"feedbacks": [
        {
            "id": f.id,
            "username": f.username,
            "content": f.content,
            "response": f.response or "",
            "created_at": f.created_at.strftime("%Y-%m-%d %H:%M") if f.created_at else "",
            "responded_at": f.responded_at.strftime("%Y-%m-%d %H:%M") if f.responded_at else "",
        } for f in feedbacks
    ]}


@router.get("/admin")
async def get_all_feedback(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(select(Feedback).order_by(Feedback.created_at.desc()))
    feedbacks = result.scalars().all()
    return {"feedbacks": [
        {
            "id": f.id,
            "user_id": f.user_id,
            "username": f.username,
            "content": f.content,
            "response": f.response or "",
            "created_at": f.created_at.strftime("%Y-%m-%d %H:%M") if f.created_at else "",
            "responded_at": f.responded_at.strftime("%Y-%m-%d %H:%M") if f.responded_at else "",
        } for f in feedbacks
    ]}


@router.post("/{feedback_id}/respond")
async def respond_feedback(feedback_id: int, req: RespondFeedbackRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    fb = result.scalar_one_or_none()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")
    text = req.response.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Response required")
    fb.response = text[:2000]
    fb.responded_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Response sent"}
