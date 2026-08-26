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
TOKEN_EXPIRY_HOURS = 72


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


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_admin: bool

    model_config = {"from_attributes": True}


def create_token(user_id: int, username: str, is_admin: bool) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRY_HOURS)
    return jwt.encode(
        {"sub": str(user_id), "username": username, "is_admin": is_admin, "exp": expire},
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_current_user_from_cookie(request: Request, db: AsyncSession) -> User:
    token = request.cookies.get("zenith_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    user_id = int(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.post("/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if len(req.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = await db.execute(
        select(User).where((User.username == req.username) | (User.email == req.email))
    )
    if existing.scalar_one_or_none():
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

    db.add(LoginHistory(user_id=user.id, ip_address=ip, user_agent=ua, success=True))
    await db.commit()

    token = create_token(user.id, user.username, user.is_admin)
    response.set_cookie(
        key="zenith_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=TOKEN_EXPIRY_HOURS * 3600,
    )
    return {"user": UserResponse.model_validate(user)}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("zenith_token")
    return {"message": "Logged out"}


ADMIN_SECRET = "zenith-admin-2026"

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
    token = create_token(user.id, user.username, False)
    response.set_cookie(key="zenith_token", value=token, httponly=True, samesite="lax", max_age=TOKEN_EXPIRY_HOURS * 3600)
    return {"user": UserResponse.model_validate(user), "guest": True}


@router.post("/admin/login")
async def admin_login(req: AdminRequest, response: Response, db: AsyncSession = Depends(get_db)):
    if req.secret:
        if req.secret != ADMIN_SECRET:
            raise HTTPException(status_code=403, detail="Invalid admin secret")
        if len(req.username) < 3 or len(req.password) < 6:
            raise HTTPException(status_code=400, detail="Username min 3, password min 6")
        existing = await db.execute(select(User).where((User.username == req.username) | (User.email == req.username)))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Username already exists")
        user = User(username=req.username, email=f"{req.username}@admin.local", password_hash=hash_password(req.password), is_admin=True)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        token = create_token(user.id, user.username, True)
        response.set_cookie(key="zenith_token", value=token, httponly=True, samesite="lax", max_age=TOKEN_EXPIRY_HOURS * 3600)
        return {"user": UserResponse.model_validate(user), "admin": True}
    result = await db.execute(select(User).where(User.username == req.username, User.is_admin == True))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    token = create_token(user.id, user.username, True)
    response.set_cookie(key="zenith_token", value=token, httponly=True, samesite="lax", max_age=TOKEN_EXPIRY_HOURS * 3600)
    return {"user": UserResponse.model_validate(user), "admin": True}


@router.get("/admin/users")
async def list_all_users(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return {"users": [UserResponse.model_validate(u) for u in users]}


@router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    admin = await get_current_user_from_cookie(request, db)
    if not admin.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(target)
    await db.commit()
    return {"message": "User deleted"}


@router.get("/me")
async def me(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    return {"user": UserResponse.model_validate(user)}
