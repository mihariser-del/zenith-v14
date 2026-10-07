from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import json

from database import Announcement, get_db
from auth import get_current_user_from_cookie, is_staff, get_role
from audit import log_action

router = APIRouter(prefix="/api/announcements", tags=["announcements"])


class AnnouncementRequest(BaseModel):
    content: str
    audience: str = "all"  # all | admins | users | specific
    user_ids: list[int] = []


def _audience_to_recipient(audience: str, user_ids: list[int]) -> str:
    """Serialize an audience to the announcements.recipient column."""
    if audience == "admins":
        return "admins"
    if audience == "users":
        return "users"
    if audience == "specific" and user_ids:
        return json.dumps(sorted(set(int(i) for i in user_ids if i)))
    return "*"  # everyone


def _recipient_visible(recipient: str | None, viewer_id: int, viewer_role: str) -> bool:
    """True when the logged-in viewer should see this announcement."""
    if not recipient or recipient == "*" or recipient == "all":
        return True
    if recipient == "admins":
        return viewer_role in ("owner", "admin")
    if recipient == "users":
        return viewer_role == "user" or viewer_role.startswith("guest")
    try:
        ids = json.loads(recipient)
        return viewer_id in ids
    except Exception:
        return False


@router.get("")
async def get_announcements(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    result = await db.execute(select(Announcement).order_by(Announcement.created_at.desc()).limit(200))
    items = result.scalars().all()
    items = list(reversed(items))
    return {"announcements": [_ann_info(a) for a in items]}


@router.get("/feed")
async def get_announcement_feed(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if user is None:
        # guests / anonymous still get broadcast popups (the app handles them)
        result = await db.execute(select(Announcement).order_by(Announcement.created_at.desc()).limit(50))
        items = result.scalars().all()
        visible = [a for a in reversed(list(items)) if _recipient_visible(getattr(a, "recipient", None), 0, "guest")]
        return {"announcements": [_ann_info(a) for a in visible]}
    result = await db.execute(select(Announcement).order_by(Announcement.created_at.desc()).limit(50))
    items = result.scalars().all()
    items = list(reversed(items))
    role = get_role(user)
    viewer_id = getattr(user, "id", None) or 0
    visible = [a for a in items if _recipient_visible(getattr(a, "recipient", None), viewer_id, role)]
    return {"announcements": [_ann_info(a) for a in visible]}


def _ann_info(a):
    # id can RESET after a cache clear on SQLite (rowid-based INTEGER PRIMARY KEY),
    # so clients must NOT dedupe by id alone. created_at_ts is a full-precision ISO
    # timestamp that always increases, giving a reliable "newer than this" marker.
    recipient = getattr(a, "recipient", None) or "*"
    try:
        audience = json.loads(recipient)
        aud_label = f"specific ({len(audience)})"
    except Exception:
        aud_label = recipient
    return {
        "id": a.id,
        "username": a.username,
        "role": a.role,
        "content": a.content,
        "created_at": a.created_at.strftime("%Y-%m-%d %H:%M") if a.created_at else "",
        "created_at_ts": a.created_at.isoformat() if a.created_at else "",
        "audience": aud_label,
    }


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
    recipient = _audience_to_recipient(req.audience, req.user_ids or [])
    ann = Announcement(user_id=user.id, username=user.username, role=get_role(user), content=content, recipient=recipient)
    db.add(ann)
    await db.commit()
    await db.refresh(ann)
    await log_action(db=db, request=request, actor=user, action="broadcast", detail=f"Broadcast to {recipient}: {content[:200]}")
    return {"id": ann.id, "message": "Announced", "audience": recipient}


@router.delete("")
async def clear_announcements(request: Request, db: AsyncSession = Depends(get_db)):
    """Delete all announcement history (broadcast cache). Owner or admin."""
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    from sqlalchemy import delete as sa_delete
    await db.execute(sa_delete(Announcement))
    await db.commit()
    await log_action(db=db, request=request, actor=user, action="clear_broadcasts", detail="Cleared all broadcast history")
    return {"message": "All broadcast cache cleared"}