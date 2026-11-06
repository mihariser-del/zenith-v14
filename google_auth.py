import os
from fastapi import APIRouter, Depends, Request, Response, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from database import User, get_db
from auth import hash_password, create_token, get_role, set_auth_cookie
import uuid

router = APIRouter(prefix="/api/auth/google", tags=["google-auth"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

class GoogleAuthRequest(BaseModel):
    id_token: str
    invite_token: str = ""
    device_id: str = ""

@router.post("")
async def google_auth(req: GoogleAuthRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    if not req.id_token:
        raise HTTPException(status_code=400, detail="Missing id_token")
    # Verify with Google
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={req.id_token}")
            if r.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid Google token")
            data = r.json()
            # Optionally verify aud
            if GOOGLE_CLIENT_ID and data.get("aud") != GOOGLE_CLIENT_ID:
                raise HTTPException(status_code=401, detail="Token aud mismatch")
            email = data.get("email")
            name = data.get("name") or email.split("@")[0]
            sub = data.get("sub")
            if not email or not sub:
                raise HTTPException(status_code=401, detail="Invalid Google payload")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Google verify failed: {str(e)}")

    # Find or create user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        # Check username taken
        username = email.split("@")[0][:40]
        # Ensure unique
        base = username
        i = 1
        while True:
            r2 = await db.execute(select(User).where(User.username == username))
            if not r2.scalar_one_or_none():
                break
            username = f"{base}{i}"
            i += 1
        user = User(username=username, email=email, password_hash=hash_password(uuid.uuid4().hex), is_admin=False)
        db.add(user)
        await db.flush()
        # New account from an invite link (Continue with Google on the invite page):
        # same anti-farming rules and inviter credit as a password sign-up. If the
        # device/network already joined, the account is still created — just
        # without the invite credit.
        invite_token = (getattr(req, "invite_token", "") or "").strip() or request.cookies.get("zenith_invite_token", "").strip()
        device_id = (getattr(req, "device_id", "") or "").strip()[:100]
        if invite_token:
            from auth import _invite_guard, _invite_apply
            try:
                await _invite_guard(db, request, device_id)
                await _invite_apply(db, request, user, invite_token, device_id, True)
            except HTTPException:
                pass
        await db.commit()
        await db.refresh(user)
        response.delete_cookie("zenith_invite_token")
    # Issue token
    token = create_token(user.id, user.username, user.is_admin, getattr(user, "token_version", 0) or 0, get_role(user))
    set_auth_cookie(response, token, request)
    return {"user": {"id": user.id, "username": user.username, "email": user.email, "is_admin": user.is_admin, "role": get_role(user)}, "google": True}
