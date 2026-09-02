from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import Announcement, get_db
from auth import get_current_user_from_cookie, is_staff, get_role

router = APIRouter(prefix="/api/announcements", tags=["announcements"])


class AnnouncementRequest(BaseModel):
    content: str


@router.get("")
async def get_announcements(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    result = await db.execute(select(Announcement).order_by(Announcement.created_at.desc()).limit(50))
    items = result.scalars().all()
    items = list(reversed(items))
    return {"announcements": [
        {
            "id": a.id,
            "username": a.username,
            "role": a.role,
            "content": a.content,
            "created_at": a.created_at.strftime("%Y-%m-%d %H:%M") if a.created_at else "",
        } for a in items
    ]}


@router.get("/feed")
async def get_announcement_feed(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(select(Announcement).order_by(Announcement.created_at.desc()).limit(20))
    items = result.scalars().all()
    items = list(reversed(items))
    return {"announcements": [
        {
            "id": a.id,
            "username": a.username,
            "role": a.role,
            "content": a.content,
            "created_at": a.created_at.strftime("%Y-%m-%d %H:%M") if a.created_at else "",
        } for a in items
    ]}


@router.post("")
async def post_announcement(req: AnnouncementRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    content = req.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Announcement required")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Announcement too long")
    ann = Announcement(user_id=user.id, username=user.username, role=get_role(user), content=content)
    db.add(ann)
    await db.commit()
    await db.refresh(ann)
    return {"id": ann.id, "message": "Announced"}


@router.delete("")
async def clear_announcements(request: Request, db: AsyncSession = Depends(get_db)):
    """Delete all announcement history (broadcast cache). Owner or admin."""
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    from sqlalchemy import delete as sa_delete
    await db.execute(sa_delete(Announcement))
    await db.commit()
    return {"message": "All broadcast cache cleared"}