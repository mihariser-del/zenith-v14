"""Admin action audit trail.

Every destructive / privileged action taken from the Vault is recorded to
action_logs so staff can later see who did what, to whom, and when.

Also exposes the audit log listing endpoint used by the Vault LOGS tab
(combines login history + action history).
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, ActionLog, User

router = APIRouter(prefix="/api/auth/admin/audit", tags=["audit"])


def _client_ip(request) -> str:
    try:
        if hasattr(request, "client") and request.client:
            return request.client.host or ""
    except Exception:
        pass
    return ""


async def log_action(
    db: AsyncSession,
    request=None,
    actor=None,
    action: str = "",
    target_id: int = None,
    target_username: str = "",
    detail: str = "",
):
    """Record one action in the audit log. Swallows errors so auditing never
    breaks a privileged request."""
    try:
        from auth import get_role
        actor_id = getattr(actor, "id", None) if actor else None
        actor_username = getattr(actor, "username", "") if actor else "system"
        actor_role = get_role(actor) if actor else "system"
        entry = ActionLog(
            actor_id=actor_id,
            actor_username=actor_username or "system",
            actor_role=actor_role,
            action=action,
            target_id=target_id,
            target_username=target_username or "",
            detail=(detail or "")[:2000],
            ip=_client_ip(request) if request else "",
        )
        db.add(entry)
        await db.commit()
    except Exception as e:
        print(f"[audit] log_action failed: {e}")


@router.get("")
async def list_audit_logs(
    request: Request,
    limit: int = 100,
    offset: int = 0,
    action: str = "",
    db: AsyncSession = Depends(get_db),
):
    from auth import get_current_user_from_cookie, is_staff
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin):
        raise HTTPException(status_code=403, detail="Admin only")
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)
    conds = []
    if action:
        conds.append(ActionLog.action == action)
    total = (await db.execute(select(func.count()).select_from(ActionLog).where(*conds))).scalar() or 0
    result = await db.execute(
        select(ActionLog).where(*conds).order_by(ActionLog.id.desc()).limit(limit).offset(offset)
    )
    logs = result.scalars().all()
    return {
        "total": total,
        "logs": [
            {
                "id": l.id,
                "actor_username": l.actor_username,
                "actor_role": l.actor_role,
                "action": l.action,
                "target_id": l.target_id,
                "target_username": l.target_username,
                "detail": l.detail,
                "ip": l.ip,
                "created_at": l.created_at.strftime("%Y-%m-%d %H:%M:%S") if l.created_at else "",
            }
            for l in logs
        ],
    }


@router.get("/activity")
async def recent_activity(request: Request, db: AsyncSession = Depends(get_db)):
    """Live activity stream: recent signups, recent staff actions, recent bans.
    Used by the Vault dashboard 'Activity Feed' with a 'NEW' pulse."""
    from auth import get_current_user_from_cookie, is_staff, get_role
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin):
        raise HTTPException(status_code=403, detail="Admin only")
    from database import Message, Chat
    now = datetime.now(timezone.utc)
    cutoff = now.replace(tzinfo=None)  # DB datetimes are naive UTC

    signups = (await db.execute(
        select(User).where(User.created_at.isnot(None)).order_by(User.created_at.desc()).limit(12)
    )).scalars().all()
    actions = (await db.execute(
        select(ActionLog).order_by(ActionLog.id.desc()).limit(12)
    )).scalars().all()
    messages_today = (await db.execute(
        select(func.count()).select_from(Message).where(Message.created_at >= cutoff.replace(hour=0, minute=0, second=0, microsecond=0))
    )).scalar() or 0
    chats_today = (await db.execute(
        select(func.count()).select_from(Chat).where(Chat.created_at >= cutoff.replace(hour=0, minute=0, second=0, microsecond=0))
    )).scalar() or 0

    return {
        "signups": [
            {
                "id": u.id,
                "username": u.username,
                "role": get_role(u),
                "is_banned": u.is_banned,
                "is_deleted": u.is_deleted,
                "created_at": u.created_at.strftime("%Y-%m-%d %H:%M") if u.created_at else "",
            }
            for u in signups
        ],
        "actions": [
            {
                "actor": a.actor_username,
                "actor_role": a.actor_role,
                "action": a.action,
                "target": a.target_username,
                "detail": a.detail,
                "created_at": a.created_at.strftime("%Y-%m-%d %H:%M") if a.created_at else "",
            }
            for a in actions
        ],
        "messages_today": messages_today,
        "chats_today": chats_today,
    }