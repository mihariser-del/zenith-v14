from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db, User, Announcement, settings
from auth import get_current_user_from_cookie, is_staff, is_owner, get_role
from audit import log_action

router = APIRouter(prefix="/api/admin/system", tags=["admin-system"])


class SettingRequest(BaseModel):
    value: str
    note: str = ""


async def _get_setting(db: AsyncSession, key: str, default: str = "off") -> str:
    result = await db.execute(text("SELECT value FROM system_settings WHERE key=:k"), {"k": key})
    row = result.fetchone()
    return row[0] if row else default


async def _set_setting(db: AsyncSession, key: str, value: str):
    result = await db.execute(text("SELECT 1 FROM system_settings WHERE key=:k"), {"k": key})
    if result.fetchone():
        await db.execute(text("UPDATE system_settings SET value=:v WHERE key=:k"), {"k": key, "v": value})
    else:
        await db.execute(text("INSERT INTO system_settings (key, value) VALUES (:k, :v)"), {"k": key, "v": value})
    await db.commit()


async def _announce(db: AsyncSession, user, content: str):
    ann = Announcement(user_id=user.id, username=user.username, role=get_role(user), content=content[:2000])
    db.add(ann)
    await db.commit()


@router.get("/state")
async def get_state(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Admin only")
    return {
        "maintenance_mode": await _get_setting(db, "maintenance_mode", "off"),
        "registrations": await _get_setting(db, "registrations", "on"),
        "messaging": await _get_setting(db, "messaging", "on"),
        "ai_enabled": await _get_setting(db, "ai_enabled", "on"),
        "locked": await _get_setting(db, "locked", "off"),
    }


@router.get("/public")
async def public_state(db: AsyncSession = Depends(get_db)):
    return {
        "maintenance_mode": await _get_setting(db, "maintenance_mode", "off"),
        "registrations": await _get_setting(db, "registrations", "on"),
        "messaging": await _get_setting(db, "messaging", "on"),
        "ai_enabled": await _get_setting(db, "ai_enabled", "on"),
        "locked": await _get_setting(db, "locked", "off"),
        "chosen": await _get_setting(db, "chosen", ""),
        "maint_note": await _get_setting(db, "maint_note", ""),
    }


class ChosenRequest(BaseModel):
    user_ids: list[int]


@router.post("/set-chosen")
async def set_chosen(req: ChosenRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    # Clear any previous chosen helpers
    prev = await db.execute(select(User).where(User.is_chosen == True))
    for p in prev.scalars().all():
        p.is_chosen = False
        p.pending_notification = "unchosen"
    # Set the new ones
    chosen = []
    if req.user_ids:
        targets = await db.execute(select(User).where(User.id.in_(req.user_ids), User.is_deleted == False))
        for t in targets.scalars().all():
            t.is_chosen = True
            chosen.append({"id": t.id, "username": t.username, "email": t.email})
    await db.commit()
    await _set_setting(db, "chosen", ",".join(str(c["id"]) for c in chosen))
    await log_action(db=db, request=request, actor=user, action="set_chosen", detail=f"Chosen helpers: {[c['username'] for c in chosen]}")
    return {"chosen": chosen}


@router.post("/maintenance")
async def toggle_maintenance(req: SettingRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    await _set_setting(db, "maintenance_mode", req.value)
    if req.value == "on":
        result = await db.execute(select(User).where(User.is_deleted == False, User.id != user.id, User.is_chosen != True))
        for t in result.scalars().all():
            t.pending_notification = "maintenance"
        chosen = await db.execute(select(User).where(User.is_deleted == False, User.id != user.id, User.is_chosen == True))
        for c in chosen.scalars().all():
            c.pending_notification = "chosen"
        await db.commit()
        await _announce(db, user, "[EMERGENCY:maintenance] 🚧 MAINTENANCE MODE: The platform is temporarily under maintenance. Only the Owner and chosen helpers can access it right now.")
    else:
        await _set_setting(db, "maint_note", (req.note or "").strip())
        result = await db.execute(select(User).where(User.is_deleted == False, User.id != user.id, User.is_chosen != True))
        for t in result.scalars().all():
            t.pending_notification = "maintenance_off"
        chosen = await db.execute(select(User).where(User.is_deleted == False, User.id != user.id, User.is_chosen == True))
        for c in chosen.scalars().all():
            c.pending_notification = "helper_thanks"
        await db.commit()
    await log_action(db=db, request=request, actor=user, action="maintenance", detail=f"Maintenance {req.value}" + (f"; note: {req.note[:200]}" if req.note else ""))
    return {"maintenance_mode": req.value}


@router.post("/registrations")
async def toggle_registrations(req: SettingRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    await _set_setting(db, "registrations", req.value)
    if req.value == "off":
        await _announce(db, user, "[EMERGENCY:registrations] 🛑 Registration is now CLOSED. New accounts cannot be created.")
    await log_action(db=db, request=request, actor=user, action="registrations", detail=f"Registrations {req.value}")
    return {"registrations": req.value}


@router.post("/messaging")
async def toggle_messaging(req: SettingRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    await _set_setting(db, "messaging", req.value)
    if req.value == "off":
        await _announce(db, user, "[EMERGENCY:messaging] 🛑 Messaging is now DISABLED. You cannot send messages right now.")
    await log_action(db=db, request=request, actor=user, action="messaging", detail=f"Messaging {req.value}")
    return {"messaging": req.value}


@router.post("/ai")
async def toggle_ai(req: SettingRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    await _set_setting(db, "ai_enabled", req.value)
    if req.value == "off":
        await _announce(db, user, "[EMERGENCY:ai] 🤖 AI responses are now DISABLED globally.")
    await log_action(db=db, request=request, actor=user, action="ai_control", detail=f"AI {req.value}")
    return {"ai_enabled": req.value}


@router.post("/lock-all")
async def lock_all(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    result = await db.execute(select(User).where(User.is_deleted == False, User.id != user.id, User.is_chosen != True))
    targets = result.scalars().all()
    for t in targets:
        t.pending_notification = "locked"
    chosen = await db.execute(select(User).where(User.is_deleted == False, User.id != user.id, User.is_chosen == True))
    for c in chosen.scalars().all():
        c.pending_notification = "chosen"
    await db.commit()
    await _set_setting(db, "locked", "on")
    await _announce(db, user, "[EMERGENCY:lock-all] 🔒 ALL ACCOUNTS HAVE BEEN LOCKED by the Owner. You are currently locked out.")
    await log_action(db=db, request=request, actor=user, action="lock_all", detail=f"Locked {len(targets)} accounts")
    return {"locked": len(targets)}


@router.post("/backup")
async def create_backup(request: Request, db: AsyncSession = Depends(get_db)):
    """Create a full database snapshot (emergency + manual backup).

    For SQLite this streams a safe snapshot of the live DB file. For any
    other engine it returns a JSON summary snapshot so the action never
    hangs on a large dump.
    """
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Admin only")
    import os
    from datetime import datetime as _dt
    from fastapi.responses import StreamingResponse
    db_url = settings.database_url or ""
    if db_url.startswith("sqlite"):
        import tempfile, shutil
        path = db_url.replace("sqlite+aiosqlite:///", "")
        if not os.path.isabs(path):
            path = os.path.abspath(path)
        if not os.path.exists(path):
            await log_action(db=db, request=request, actor=user, action="backup", detail=f"No DB file at {path}")
            raise HTTPException(status_code=404, detail=f"Database file not found ({path})")
        ts = _dt.now().strftime("%Y%m%d_%H%M%S")
        tmp = os.path.join(tempfile.gettempdir(), f"zenith_backup_{ts}.db")
        shutil.copy2(path, tmp)
        await log_action(db=db, request=request, actor=user, action="backup", detail=f"Created DB snapshot {ts} ({os.path.getsize(tmp)} bytes)")
        size = os.path.getsize(tmp)

        async def iter_file():
            with open(tmp, "rb") as f:
                while chunk := f.read(1024 * 1024):
                    yield chunk
            try:
                os.remove(tmp)
            except Exception:
                pass

        return StreamingResponse(
            iter_file(),
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="zenith_backup_{ts}.db"',
                "X-Backup-Size": str(size),
            },
        )
    # Non-sqlite: return a JSON snapshot of current state.
    from sqlalchemy import func as _f
    counts = {
        "users": (await db.execute(select(_f.count()).select_from(User))).scalar() or 0,
        "announcements": (await db.execute(select(_f.count()).select_from(Announcement))).scalar() or 0,
    }
    await log_action(db=db, request=request, actor=user, action="backup", detail=f"Snapshot (non-sqlite): {counts}")
    return {"message": "Snapshot created (managed DB)", "counts": counts, "created": _dt.now().isoformat()}


@router.post("/unlock-all")
async def unlock_all(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    result = await db.execute(select(User).where(User.is_deleted == False))
    targets = result.scalars().all()
    for t in targets:
        t.pending_notification = "helper_thanks" if t.is_chosen else "unlocked"
    await db.commit()
    await _set_setting(db, "locked", "off")
    await log_action(db=db, request=request, actor=user, action="unlock_all", detail=f"Unlocked {len(targets)} accounts")
    return {"unlocked": len(targets)}


@router.post("/force-logout")
async def force_logout(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    result = await db.execute(select(User).where(User.is_deleted == False, User.id != user.id, User.is_chosen != True))
    targets = result.scalars().all()
    for t in targets:
        t.pending_notification = "force_logout"
    await db.commit()
    await _announce(db, user, "[EMERGENCY:force-logout] 🔐 Everyone has been signed out by the Owner. Please log in again.")
    await log_action(db=db, request=request, actor=user, action="force_logout", detail=f"Revoked {len(targets)} sessions")
    return {"sessions_revoked": len(targets)}
