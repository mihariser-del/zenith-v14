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

# Public identifier of Zelpophai's Google sign-in (the same one the login page uses).
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip() or "1035003334215-veihtcrojq0spse60ium7jgfqr8flbto.apps.googleusercontent.com"

class GoogleAuthRequest(BaseModel):
    id_token: str
    invite_token: str = ""
    device_id: str = ""

@router.post("")
async def google_auth(req: GoogleAuthRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    if not req.id_token:
        raise HTTPException(status_code=400, detail="Missing id_token")
    # Without our own client ID we can't tell whether a token was issued for Zelpophai or for
    # some other website, so Google sign-in stays off rather than trusting any token.
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google sign-in isn't set up yet. Please use your username and password.")
    # Verify with Google
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": req.id_token})
            if r.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid Google token")
            data = r.json()
            if data.get("aud") != GOOGLE_CLIENT_ID:
                raise HTTPException(status_code=401, detail="Token aud mismatch")
            if data.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
                raise HTTPException(status_code=401, detail="Invalid Google token")
            if str(data.get("email_verified", "")).lower() != "true":
                raise HTTPException(status_code=401, detail="Your Google email isn't verified yet. Verify it with Google and try again.")
            email = (data.get("email") or "").strip().lower()
            name = data.get("name") or email.split("@")[0]
            sub = data.get("sub")
            if not email or not sub:
                raise HTTPException(status_code=401, detail="Invalid Google payload")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[google] verify failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail="Couldn't reach Google to check your sign-in. Please try again.")

    # Find or create user
    from sqlalchemy import func as _func
    result = await db.execute(select(User).where(_func.lower(User.email) == email))
    user = result.scalars().first()
    if user:
        if getattr(user, "is_deleted", False):
            raise HTTPException(status_code=403, detail="This account was deleted.")
        if getattr(user, "is_banned", False):
            raise HTTPException(status_code=403, detail="This account is banned.")
        if (getattr(user, "email_status", "") or "") != "verified":
            # First Google sign-in to an account whose email was never confirmed: whoever made it
            # with a password may not own this address, so the old password and sessions stop working.
            user.password_hash = hash_password(uuid.uuid4().hex)
            user.token_version = (getattr(user, "token_version", 0) or 0) + 1
            user.email_status = "verified"
            await db.commit()
            await db.refresh(user)
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
        user = User(username=username, email=email, password_hash=hash_password(uuid.uuid4().hex), is_admin=False, email_status="verified")
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
