from datetime import datetime, timedelta, timezone
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError, jwt
from pydantic import BaseModel

from database import User, LoginHistory, get_db, settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

ALGORITHM = "HS256"
TOKEN_EXPIRY_HOURS = 720  # 30 days


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class ForgotRequest(BaseModel):
    username: str
    email: str
    new_password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_admin: bool
    is_banned: bool = False
    ban_reason: str = ""
    is_deleted: bool = False
    role: str = "user"
    banned_by: str = ""
    deleted_by: str = ""
    pending_password_by: str = ""
    permissions: str = ""
    pending_notification: str = ""
    is_chosen: bool = False
    display_name: str = ""

    model_config = {"from_attributes": True}


class AdminResetRequest(BaseModel):
    new_password: str


class AdminBanRequest(BaseModel):
    reason: str = ""


def create_token(user_id: int, username: str, is_admin: bool, token_version: int = 0, role: str = "") -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRY_HOURS)
    return jwt.encode(
        {"sub": str(user_id), "username": username, "is_admin": is_admin, "role": role, "ver": token_version, "exp": expire},
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_role(user) -> str:
    """Return the effective role of a user. Owner is supreme."""
    owned = getattr(user, "role", "") or ""
    if owned == "owner":
        return "owner"
    # if is_admin and role set to user (legacy), treat as admin
    if owned == "admin" or (user.is_admin and owned in ("user", "")):
        return "admin"
    return "user"


def is_owner(user) -> bool:
    return get_role(user) == "owner"


def is_staff(user) -> bool:
    """admin or owner"""
    return user.is_admin or is_owner(user)


def _role_label(role: str) -> str:
    if role == "owner": return "The Owner"
    return "an administrator"


async def get_current_user_from_cookie(request: Request, db: AsyncSession) -> User:
    token = request.cookies.get("zenith_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    sub = payload.get("sub")
    if sub is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if getattr(user, "is_banned", False):
        banned_by = getattr(user, "banned_by", "") or ""
        raise HTTPException(status_code=403, detail=f"Account banned. Reason: {getattr(user, 'ban_reason', '') or 'No reason provided'} Banned by: {banned_by or 'admin'}")
    if getattr(user, "is_deleted", False):
        deleted_by = getattr(user, "deleted_by", "") or ""
        raise HTTPException(status_code=404, detail=f"Account deleted. Deleted by: {deleted_by or 'admin'}")
    # token version check (logout-all)
    token_ver = payload.get("ver", 0)
    user_ver = getattr(user, "token_version", 0) or 0
    if token_ver != user_ver:
        raise HTTPException(status_code=401, detail="Session expired. Please login again.")
    return user


@router.post("/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Respect global registration toggle
    try:
        from sqlalchemy import text
        res = await db.execute(text("SELECT value FROM system_settings WHERE key='registrations'"))
        row = res.fetchone()
        if row and row[0] == "off":
            raise HTTPException(status_code=403, detail="Registration is currently disabled by the Owner")
    except HTTPException:
        raise
    except Exception:
        pass
    if len(req.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = await db.execute(
        select(User).where((User.username == req.username) | (User.email == req.email))
    )
    existing_user = existing.scalar_one_or_none()
    # Allow reusing a username/email that belongs to a soft-deleted account by reactivating it.
    # This matches the expectation that deleting an account frees up its name/email.
    if existing_user:
        if existing_user.is_deleted:
            # Only reactivate if it's the SAME account holding BOTH the username and email
            # (i.e. no other active account owns these). Otherwise fail cleanly.
            conflict = await db.execute(
                select(User).where(
                    (User.username == req.username) | (User.email == req.email),
                    User.is_deleted == False
                )
            )
            if conflict.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Username or email already exists")
            existing_user.username = req.username
            existing_user.email = req.email
            existing_user.password_hash = hash_password(req.password)
            existing_user.is_deleted = False
            existing_user.deleted_by = ""
            existing_user.is_banned = False
            existing_user.ban_reason = ""
            existing_user.banned_by = ""
            existing_user.token_version = 0
            existing_user.pending_password = ""
            existing_user.pending_password_by = ""
            await db.commit()
            return {"message": "Account reactivated"}
        raise HTTPException(status_code=409, detail="Username or email already exists")

    user = User(
        username=req.username,
        email=req.email,
        password_hash=hash_password(req.password),
    )
    db.add(user)
    await db.commit()
    return {"message": "Account created"}


@router.post("/login")
async def login(req: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()
    ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")[:500]

    if not user or not verify_password(req.password, user.password_hash):
        if user:
            db.add(LoginHistory(user_id=user.id, ip_address=ip, user_agent=ua, success=False))
            await db.commit()
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if getattr(user, 'is_deleted', False):
        raise HTTPException(status_code=404, detail="Account deleted.")
    if getattr(user, 'is_banned', False):
        raise HTTPException(status_code=403, detail=f"Account banned. Reason: {user.ban_reason or 'No reason provided'}")
    # Maintenance mode: only the Owner and chosen helpers can log in
    is_chosen = getattr(user, "is_chosen", False) or False
    if get_role(user) != "owner" and not is_chosen:
        try:
            from sqlalchemy import text
            res = await db.execute(text("SELECT value FROM system_settings WHERE key='maintenance_mode'"))
            row = res.fetchone()
            if row and row[0] == "on":
                raise HTTPException(status_code=503, detail="Platform under maintenance. Only the Owner can access right now.")
        except HTTPException:
            raise
        except Exception:
            pass

    db.add(LoginHistory(user_id=user.id, ip_address=ip, user_agent=ua, success=True))
    user.last_seen = datetime.now(timezone.utc)
    await db.commit()

    token = create_token(user.id, user.username, user.is_admin, getattr(user, "token_version", 0) or 0, get_role(user))
    response.set_cookie(
        key="zenith_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=TOKEN_EXPIRY_HOURS * 3600,
    )
    return {"user": UserResponse.model_validate(user)}


@router.post("/forgot-password")
async def forgot_password(req: ForgotRequest, db: AsyncSession = Depends(get_db)):
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    result = await db.execute(select(User).where(User.username == req.username, User.email == req.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="No account found with that username and email")
    user.password_hash = hash_password(req.new_password)
    await db.commit()
    return {"message": "Password reset successful. Please login with your new password."}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("zenith_token")
    return {"message": "Logged out"}


@router.post("/logout-all")
async def logout_all(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if user.username.startswith("guest_"):
        raise HTTPException(status_code=403, detail="Guests cannot use this")
    ver = getattr(user, "token_version", 0) or 0
    user.token_version = ver + 1
    await db.commit()
    # issue new token for current session so it stays valid
    new_token = create_token(user.id, user.username, user.is_admin, user.token_version, get_role(user))
    response.set_cookie(key="zenith_token", value=new_token, httponly=True, samesite="lax", max_age=TOKEN_EXPIRY_HOURS * 3600)
    return {"message": "Logged out of all other devices"}


@router.get("/password-changed")
async def password_changed_status(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    pending = getattr(user, "pending_password", "") or ""
    pending_by = getattr(user, "pending_password_by", "") or ""
    return {"changed": bool(pending), "changed_by": pending_by}


@router.get("/password-changed/view")
async def password_changed_view(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    pending = getattr(user, "pending_password", "") or ""
    if not pending:
        raise HTTPException(status_code=404, detail="No pending password")
    return {"password": pending}


@router.post("/password-changed/dismiss")
async def password_changed_dismiss(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    user.pending_password = ""
    user.pending_password_by = ""
    await db.commit()
    return {"message": "dismissed"}


class AdminRequest(BaseModel):
    username: str
    password: str
    secret: str = ""


@router.post("/guest")
async def guest_login(response: Response, db: AsyncSession = Depends(get_db)):
    import uuid
    guest_name = f"guest_{uuid.uuid4().hex[:8]}"
    user = User(username=guest_name, email=f"{guest_name}@guest.local", password_hash=hash_password(uuid.uuid4().hex), is_admin=False)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_token(user.id, user.username, False, getattr(user, "token_version", 0) or 0, "user")
    response.set_cookie(key="zenith_token", value=token, httponly=True, samesite="lax", max_age=TOKEN_EXPIRY_HOURS * 3600)
    return {"user": UserResponse.model_validate(user), "guest": True}


@router.post("/admin/login")
async def admin_login(req: AdminRequest, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == req.username, User.is_admin == True))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    token = create_token(user.id, user.username, True, getattr(user, "token_version", 0) or 0, get_role(user))
    response.set_cookie(key="zenith_token", value=token, httponly=True, samesite="lax", max_age=TOKEN_EXPIRY_HOURS * 3600)
    return {"user": UserResponse.model_validate(user), "admin": True}


@router.post("/admin/users")
async def create_admin(req: AdminRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Owner only — creating a brand-new admin account no longer relies on a hardcoded secret.
    actor = await get_current_user_from_cookie(request, db)
    if not is_owner(actor):
        raise HTTPException(status_code=403, detail="Owner only")
    username = (req.username or "").strip()
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username min 3")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password min 6")
    existing = await db.execute(select(User).where((User.username == username) | (User.email == username)))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")
    user = User(username=username, email=f"{username}@admin.local", password_hash=hash_password(req.password), is_admin=True, role="admin")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": user.id, "username": user.username, "message": "Admin created"}


@router.get("/admin/dashboard")
async def admin_dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import func
    from database import Chat, Message, Memory, KnowledgeBase
    from datetime import timedelta
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin):
        raise HTTPException(status_code=403, detail="Admin only")
    total_users = (await db.execute(select(func.count()).select_from(User).where(User.is_deleted == False))).scalar() or 0
    total_chats = (await db.execute(select(func.count()).select_from(Chat))).scalar() or 0
    total_messages = (await db.execute(select(func.count()).select_from(Message))).scalar() or 0
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    active_users = (await db.execute(select(func.count(func.distinct(Chat.user_id))).select_from(Chat).join(User, Chat.user_id == User.id).where(Chat.updated_at >= since, User.is_deleted == False))).scalar() or 0
    guest_count = (await db.execute(select(func.count()).select_from(User).where(User.username.like("guest_%"), User.is_deleted == False))).scalar() or 0
    banned_count = (await db.execute(select(func.count()).select_from(User).where(User.is_banned == True, User.is_deleted == False))).scalar() or 0
    deleted_count = (await db.execute(select(func.count()).select_from(User).where(User.is_deleted == True))).scalar() or 0
    admin_count = (await db.execute(select(func.count()).select_from(User).where(User.role == "admin", User.is_deleted == False))).scalar() or 0
    owner_count = (await db.execute(select(func.count()).select_from(User).where(User.role == "owner", User.is_deleted == False))).scalar() or 0
    return {"total_users": total_users, "active_users": active_users, "total_chats": total_chats, "total_messages": total_messages, "guest_count": guest_count, "banned_count": banned_count, "deleted_count": deleted_count, "admin_count": admin_count, "owner_count": owner_count}


@router.get("/admin/users")
async def list_all_users(request: Request, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import func
    from database import Chat, Message
    user = await get_current_user_from_cookie(request, db)
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    enriched = []
    for u in users:
        chat_count = (await db.execute(select(func.count()).select_from(Chat).where(Chat.user_id == u.id))).scalar() or 0
        msg_count = (await db.execute(select(func.count()).select_from(Message).join(Chat, Message.chat_id == Chat.id).where(Chat.user_id == u.id))).scalar() or 0
        last_chat = (await db.execute(select(Chat.updated_at).where(Chat.user_id == u.id).order_by(Chat.updated_at.desc()).limit(1))).scalar_one_or_none()
        last_seen = getattr(u, "last_seen", None)
        online = False
        if last_seen:
            try:
                ls = last_seen if last_seen.tzinfo is None else last_seen.replace(tzinfo=None)
                online = (now_naive - ls).total_seconds() < 10
            except Exception:
                online = False
        enriched.append({**UserResponse.model_validate(u).model_dump(), "role": get_role(u), "chat_count": chat_count, "message_count": msg_count, "last_active": last_chat.strftime("%Y-%m-%d %H:%M") if last_chat else "Never", "created_at": u.created_at.strftime("%Y-%m-%d") if u.created_at else "", "online": online, "last_seen": last_seen.strftime("%Y-%m-%d %H:%M") if last_seen else ""})
    return {"users": enriched}


@router.post("/admin/users/{user_id}/ban")
async def admin_ban_user(user_id: int, req: AdminBanRequest, request: Request, db: AsyncSession = Depends(get_db)):
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin): raise HTTPException(status_code=403, detail="Admin only")
    if not req.reason or not req.reason.strip():
        raise HTTPException(status_code=400, detail="Ban reason is required")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target: raise HTTPException(status_code=404, detail="User not found")
    target_role = get_role(target)
    if target_role == "owner":
        raise HTTPException(status_code=400, detail="The Owner cannot be banned")
    if target_role == "admin" and get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Admins cannot take action on fellow admins")
    if get_role(admin) == "admin":
        import json
        perms = {}
        if admin.permissions:
            try: perms = json.loads(admin.permissions)
            except: pass
        if not perms.get("ban_users", True):
            raise HTTPException(status_code=403, detail="You do not have permission to ban users. Contact the Owner.")
    target.is_banned = True
    target.ban_reason = req.reason.strip()[:500]
    target.banned_by = get_role(admin)
    await db.commit()
    return {"message": f"{target.username} banned by {_role_label(get_role(admin))}"}


@router.post("/admin/users/{user_id}/unban")
async def admin_unban_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin): raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target: raise HTTPException(status_code=404, detail="User not found")
    target_role = get_role(target)
    if target_role == "owner":
        raise HTTPException(status_code=400, detail="The Owner cannot be unbanned")
    if target_role == "admin" and get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Admins cannot take action on fellow admins")
    target.is_banned = False
    target.ban_reason = ""
    target.banned_by = ""
    await db.commit()
    return {"message": f"{target.username} unbanned"}


@router.post("/admin/users/{user_id}/reset-password")
async def admin_reset_password(user_id: int, req: AdminResetRequest, request: Request, db: AsyncSession = Depends(get_db)):
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin): raise HTTPException(status_code=403, detail="Admin only")
    if len(req.new_password) < 6: raise HTTPException(status_code=400, detail="Password min 6 chars")
    if get_role(admin) == "admin":
        import json
        perms = {}
        if admin.permissions:
            try: perms = json.loads(admin.permissions)
            except: pass
        if not perms.get("reset_password", True):
            raise HTTPException(status_code=403, detail="You do not have permission to reset passwords. Contact the Owner.")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target: raise HTTPException(status_code=404, detail="User not found")
    target_role = get_role(target)
    if target_role == "owner":
        raise HTTPException(status_code=400, detail="The Owner's password cannot be reset")
    if target_role == "admin" and get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Reset option is disabled for fellow admins")
    target.password_hash = hash_password(req.new_password)
    target.pending_password = req.new_password
    target.pending_password_by = get_role(admin)
    await db.commit()
    return {"message": f"Password reset for {target.username}"}


@router.get("/admin/users/{user_id}/chats")
async def admin_user_chats(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    from database import Chat
    from sqlalchemy.orm import selectinload
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin): raise HTTPException(status_code=403, detail="Admin only")
    if get_role(admin) == "admin":
        import json
        perms = {}
        if admin.permissions:
            try: perms = json.loads(admin.permissions)
            except: pass
        if not perms.get("view_messages", True):
            raise HTTPException(status_code=403, detail="You do not have permission to view messages. Contact the Owner.")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    target_role = get_role(target) if target else "user"
    if target_role in ("admin", "owner") and get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Admins cannot view fellow staff chats")
    result = await db.execute(select(Chat).where(Chat.user_id == user_id).options(selectinload(Chat.messages)).order_by(Chat.updated_at.desc()).limit(50))
    chats = result.scalars().all()
    out = []
    for c in chats:
        msgs = [{"role": m.role, "content": m.content, "created_at": str(m.created_at)} for m in c.messages[-100:]]
        out.append({"id": c.id, "title": c.title, "message_count": len(c.messages), "updated_at": str(c.updated_at), "messages": msgs})
    return {"chats": out}


@router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    admin = await get_current_user_from_cookie(request, db)
    if not is_staff(admin):
        raise HTTPException(status_code=403, detail="Admin only")
    if get_role(admin) == "admin":
        import json
        perms = {}
        if admin.permissions:
            try: perms = json.loads(admin.permissions)
            except: pass
        if not perms.get("delete_users", True):
            raise HTTPException(status_code=403, detail="You do not have permission to delete users. Contact the Owner.")
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target_role = get_role(target)
    if target_role == "owner":
        raise HTTPException(status_code=400, detail="The Owner cannot be deleted")
    if target_role == "admin" and get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Admins cannot delete fellow admins")
    target.is_deleted = True
    target.deleted_by = get_role(admin)
    await db.commit()
    return {"message": "User deleted (soft)"}


@router.post("/admin/users/{user_id}/role")
async def admin_change_role(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    admin = await get_current_user_from_cookie(request, db)
    if get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Only the Owner can change roles")
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    body = await request.json()
    new_role = body.get("role", "").strip().lower()
    if new_role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Role must be 'user' or 'admin'")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target_role = get_role(target)
    if target_role == "owner":
        raise HTTPException(status_code=400, detail="Cannot change the Owner's role")
    if target_role == new_role:
        return {"message": f"User is already {new_role}", "role": target_role}
    target.role = new_role
    if new_role == "user":
        target.is_admin = False
        target.pending_notification = 'demoted'
    elif new_role == "admin":
        target.is_admin = True
        target.pending_notification = 'promoted'
    await db.commit()
    return {"message": f"User role changed to {new_role}", "role": new_role}


@router.get("/admin/users/{user_id}/permissions")
async def admin_get_permissions(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    admin = await get_current_user_from_cookie(request, db)
    if get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Only the Owner can manage permissions")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    import json
    perms = {}
    if target.permissions:
        try:
            perms = json.loads(target.permissions)
        except Exception:
            perms = {}
    defaults = {"ban_users": True, "reset_password": True, "view_messages": True, "manage_chats": True}
    for k, v in defaults.items():
        if k not in perms:
            perms[k] = v
    return {"permissions": perms}


@router.post("/admin/users/{user_id}/permissions")
async def admin_set_permissions(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    admin = await get_current_user_from_cookie(request, db)
    if get_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Only the Owner can manage permissions")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if get_role(target) == "owner":
        raise HTTPException(status_code=400, detail="Cannot change Owner's permissions")
    body = await request.json()
    import json
    perms = body.get("permissions", {})
    allowed_keys = {"ban_users", "reset_password", "view_messages", "manage_chats", "delete_users"}
    filtered = {k: bool(v) for k, v in perms.items() if k in allowed_keys}
    target.permissions = json.dumps(filtered)
    await db.commit()
    return {"message": "Permissions updated", "permissions": filtered}


@router.get("/me")
async def me(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    return {"user": UserResponse.model_validate(user)}


@router.post("/me/clear-notification")
async def clear_notification(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    user.pending_notification = ""
    await db.commit()
    return {"ok": True}


@router.post("/heartbeat")
async def heartbeat(request: Request, db: AsyncSession = Depends(get_db)):
    """Lightweight presence ping. Updates last_seen so staff can see live online users."""
    user = await get_current_user_from_cookie(request, db)
    user.last_seen = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}
