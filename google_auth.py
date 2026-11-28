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
    user = await _google_user(req, request, response, db)
    token = create_token(user.id, user.username, user.is_admin, getattr(user, "token_version", 0) or 0, get_role(user))
    set_auth_cookie(response, token, request)
    return {"user": {"id": user.id, "username": user.username, "email": user.email, "is_admin": user.is_admin, "role": get_role(user)}, "google": True}


async def _google_user(req, request: Request, response: Response, db: AsyncSession):
    """Check a Google sign-in token and find (or make) the Zelpophai account for it."""
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
    return user


# ═════════════════════════════════════ 26.5.3: Google sign-in for the apps ══
# Google refuses to sign in inside apps (and the apps open its pop-up in the
# normal browser, where the result can't reach them). So the app asks for a
# one-time code, opens /auth/google/app?c=<code> in the person's browser, they
# continue with Google there, and the app — which keeps checking — is signed in.
# The browser page shows a short match code that the app shows too, so nobody
# can trick you into signing in someone else's app with a link.
import secrets as _secrets
import time as _time
from fastapi.responses import HTMLResponse

_APP_LOGINS: dict = {}       # code -> {"short", "t", "user_id"}
_APP_TTL = 600
_SHORT_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _tidy_logins():
    now = _time.time()
    for k in [k for k, v in _APP_LOGINS.items() if now - v["t"] > _APP_TTL]:
        _APP_LOGINS.pop(k, None)


@router.post("/app/start")
async def app_start(request: Request):
    _tidy_logins()
    if len(_APP_LOGINS) > 5000:
        raise HTTPException(status_code=429, detail="Too many sign-ins right now. Try again in a minute.")
    code = _secrets.token_urlsafe(24)
    short = "".join(_secrets.choice(_SHORT_ABC) for _ in range(4))
    _APP_LOGINS[code] = {"short": short, "t": _time.time(), "user_id": None}
    host = (request.url.hostname or "zelpophai.com")
    base = f"http://{host}" if host not in ("localhost", "127.0.0.1") else str(request.base_url).rstrip("/")
    # http on purpose: the Windows app treats https://zelpophai.com as its own pages and
    # would open this inside the app; http goes to the browser, which is sent on to https.
    return {"code": code, "short": short, "url": f"{base}/auth/google/app?c={code}", "expires_in": _APP_TTL}


class AppComplete(BaseModel):
    code: str
    id_token: str


@router.post("/app/complete")
async def app_complete(req: AppComplete, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    _tidy_logins()
    entry = _APP_LOGINS.get(req.code or "")
    if not entry:
        raise HTTPException(status_code=410, detail="This sign-in link has expired. Press Continue with Google in the app again.")
    if entry["user_id"]:
        raise HTTPException(status_code=409, detail="This sign-in was already used.")
    user = await _google_user(GoogleAuthRequest(id_token=req.id_token), request, response, db)
    entry["user_id"] = user.id
    entry["name"] = user.username
    return {"ok": True, "name": user.username}


@router.get("/app/poll")
async def app_poll(c: str, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    entry = _APP_LOGINS.get(c or "")
    if not entry or _time.time() - entry["t"] > _APP_TTL:
        _APP_LOGINS.pop(c or "", None)
        raise HTTPException(status_code=410, detail="The sign-in timed out. Press Continue with Google to try again.")
    if not entry["user_id"]:
        return {"pending": True}
    _APP_LOGINS.pop(c, None)      # one use only
    user = (await db.execute(select(User).where(User.id == entry["user_id"]))).scalar_one_or_none()
    if not user or getattr(user, "is_banned", False) or getattr(user, "is_deleted", False):
        raise HTTPException(status_code=403, detail="This account can't sign in.")
    token = create_token(user.id, user.username, user.is_admin, getattr(user, "token_version", 0) or 0, get_role(user))
    set_auth_cookie(response, token, request)
    return {"ok": True, "user": {"id": user.id, "username": user.username}}


page_router = APIRouter()


@page_router.get("/auth/google/app", response_class=HTMLResponse)
async def app_page(c: str = ""):
    entry = _APP_LOGINS.get(c or "")
    short = entry["short"] if entry and not entry["user_id"] else ""
    import html as _h
    page = APP_PAGE.replace("{{CODE}}", _h.escape(c or "", quote=True)).replace("{{SHORT}}", _h.escape(short)).replace("{{CLIENT}}", GOOGLE_CLIENT_ID)
    return HTMLResponse(page, headers={"Cache-Control": "no-store", "Referrer-Policy": "strict-origin"})


APP_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in to the Zelpophai app</title><meta name="robots" content="noindex">
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d14;color:#e8eaf2;font:16px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;padding:20px}
.card{width:min(440px,100%);background:#151826;border:1px solid #262b40;border-radius:22px;padding:30px 26px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.45)}
.logo{width:56px;height:56px;border-radius:16px;margin:0 auto 14px;display:grid;place-items:center;background:linear-gradient(135deg,#dc2626,#7c3aed);font-weight:800;font-size:28px;color:#fff}
h1{font-size:22px;margin:0 0 6px}p{color:#a5abc3;margin:6px 0}.code{display:inline-block;margin:14px 0 6px;padding:10px 18px;border-radius:12px;background:#0b0d14;border:1px dashed #3b4263;font:700 26px/1 ui-monospace,Consolas,monospace;letter-spacing:.25em;color:#fff}
#g{display:flex;justify-content:center;margin:20px 0 6px;min-height:44px}.ok{color:#4ade80;font-weight:600}.bad{color:#f87171}.small{font-size:13px;color:#7d84a1}
</style></head><body><main class="card">
<div class="logo">Z</div>
<h1 id="h">Sign in to the Zelpophai app</h1>
<div id="body">
<p>Check that your app shows this code:</p>
<div class="code" id="short">{{SHORT}}</div>
<p class="small">Only continue if it matches — then the app on your device will sign in by itself.</p>
<div id="g"></div>
<p class="small" id="msg"></p>
</div></main>
<script>
var CODE = "{{CODE}}", SHORT = document.getElementById('short').textContent;
function done(name){document.getElementById('h').textContent='You’re signed in!';document.getElementById('body').innerHTML='<p class="ok">Go back to the Zelpophai app — it’s signing you in'+(name?' as '+name.replace(/[<>&]/g,''):'')+' now.</p><p class="small">You can close this tab.</p>';}
function fail(t){var m=document.getElementById('msg');m.className='small bad';m.textContent=t;}
if(!SHORT){document.getElementById('h').textContent='This link has expired';document.getElementById('body').innerHTML='<p>Go back to the Zelpophai app and press <b>Continue with Google</b> again.</p>';}
else{
  window.onGoogle=function(r){
    fetch('/api/auth/google/app/complete',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({code:CODE,id_token:r.credential})})
    .then(function(x){return x.json().then(function(d){if(!x.ok)throw new Error(d.detail||'Sign-in failed');return d;});}).then(function(d){done(d.name);}).catch(function(e){fail(e.message);});
  };
  var s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;
  s.onload=function(){google.accounts.id.initialize({client_id:'{{CLIENT}}',callback:window.onGoogle,ux_mode:'popup',auto_select:false});
    google.accounts.id.renderButton(document.getElementById('g'),{type:'standard',shape:'pill',theme:'filled_black',text:'continue_with',size:'large',logo_alignment:'left',width:300});};
  s.onerror=function(){fail('Couldn’t load Google sign-in. Check your internet and refresh.');};
  document.head.appendChild(s);
}
</script></body></html>"""
