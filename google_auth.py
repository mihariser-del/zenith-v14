import os
from fastapi import APIRouter, Depends, Request, Response, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from database import User, get_db
from auth import hash_password, create_token, get_role
import uuid

router = APIRouter(prefix="/api/auth/google", tags=["google-auth"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

class GoogleAuthRequest(BaseModel):
    id_token: str

@router.post("")
async def google_auth(req: GoogleAuthRequest, response: Response, db: AsyncSession = Depends(get_db)):
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
        await db.commit()
        await db.refresh(user)
    # Issue token
    token = create_token(user.id, user.username, user.is_admin, getattr(user, "token_version", 0) or 0, get_role(user))
    response.set_cookie(key="zenith_token", value=token, httponly=True, samesite="lax", max_age=720*3600)
    return {"user": {"id": user.id, "username": user.username, "email": user.email, "is_admin": user.is_admin, "role": get_role(user)}, "google": True}
