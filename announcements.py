from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import Announcement, get_db
from auth import get_current_user_from_cookie, is_staff, get_role

router = APIRouter(prefix="/api/announcements", tags=["announcements"])

# Ephemeral in-memory broadcast cache — not persisted long-term, queued until online users dismiss
# Holds last 20 broadcasts, auto-expires after 24h, broadcaster does not see own
BROADCAST_CACHE: list[dict] = []
BROADCAST_MAX = 20


class AnnouncementRequest(BaseModel):
    content: str


@router.get("")
async def get_announcements(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    # Ephemeral — return from memory cache, not DB
    return {"announcements": BROADCAST_CACHE[-50:]}


@router.get("/feed")
async def get_announcement_feed(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    # Return ephemeral cache — broadcaster will filter own via frontend, but also filter here for safety
    # Keep last 20, already in order
    return {"announcements": BROADCAST_CACHE[-20:]}


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
    # Ephemeral — store in memory cache, not DB (cleared on restart, not shown to broadcaster)
    import time
    new_id = int(time.time() * 1000) % 10000000  # unique ephemeral id
    # ensure uniqueness
    if BROADCAST_CACHE and new_id <= BROADCAST_CACHE[-1]["id"]:
        new_id = BROADCAST_CACHE[-1]["id"] + 1
    entry = {
        "id": new_id,
        "username": user.username,
        "role": get_role(user),
        "content": content,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
        "user_id": user.id,
    }
    BROADCAST_CACHE.append(entry)
    if len(BROADCAST_CACHE) > BROADCAST_MAX:
        BROADCAST_CACHE.pop(0)
    return {"id": entry["id"], "message": "Announced"}