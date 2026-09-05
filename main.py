from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse

import os
os.makedirs("uploads", exist_ok=True)

from database import init_db
from auth import router as auth_router
from chats import router as chats_router
from memories import router as memories_router
from user_settings import router as settings_router
from knowledge import router as knowledge_router
from search import router as search_router
from files import router as files_router
from generate import router as generate_router
from security import router as security_router
from codeexec import router as codeexec_router
from image import router as image_router
from feedback import router as feedback_router
from staff import router as staff_router
from announcements import router as announcements_router
from billing import router as billing_router
from google_auth import router as google_router
from system_stats import router as system_router
from analytics import router as analytics_router
from global_controls import router as global_controls_router

VERSION = "18.1"

# User-facing changelog: what actually matters to normal users (benefits, no internals).
USER_CHANGELOG = [
    "Time-based limits: after heavy use your account takes a cooling break — from 1 hour up to 18 hours, tuned to your activity",
    "Media window: chats with lots of images/files get a 15-message allowance, then a long rest",
    "Voice: logged-in users get 30 minutes of voice chat per day, then it pauses until midnight (UTC)",
    "Files & documents: logged-in users can create/edit up to 10 files a day, then a 1-hour break — guests need to log in first",
    "Clear countdown popups: whenever a limit kicks in you'll see exactly how long to wait",
    "Just ask for an image: type something like 'generate a pic of...' and Zenith creates it automatically",
    "Changelog is now split — normal users see what affects them; staff see the deep technical notes",
]

# Staff/admin changelog: current + technical notes (owners & admins see these too).
STAFF_CHANGELOG = [
    *USER_CHANGELOG,
    "limits.py engine: cooldown_until column; dynamic free timer 60-1080 min from usage intensity (msgs today/1h/10m bounce + media volume); pro 10-30 min, 60 min on exploit",
    "chat media window: [Image xN]/[File: markers per chat; 15-msg allowance from 5th image/15th file; images+files logged as 'message' usage",
    "file_tool system: guests 403 on edit/document_gen; free logged-in 10/day combined upload+edit+gen then fixed 60-min cooldown",
    "image.py persists generated images as assistant messages (survives reload, counted in media window)",
    "client showLimitPopup (api.js) with live countdown; billing interceptor routes cooldown/pause messages to the popup",
    "voice 30-min/day meter (localStorage, resets UTC midnight) — voice mode blocks + popup after the cap",
    "auto image-gen: detectImageRequest() regex in chat prompts ('generate a pic of...', 'i want a pic of...')",
    "changelog endpoint returns user_changes + staff_changes; app shows per role",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
    except Exception as e:
        print(f"init_db failed (non-fatal): {e} — continuing, app will be live but DB may be ephemeral")
    yield


app = FastAPI(title="Zenith AI", version=VERSION, lifespan=lifespan)

app.include_router(auth_router)
app.include_router(chats_router)
app.include_router(memories_router)
app.include_router(settings_router)
app.include_router(knowledge_router)
app.include_router(search_router)
app.include_router(files_router)
app.include_router(generate_router)
app.include_router(security_router)
app.include_router(codeexec_router)
app.include_router(image_router)
app.include_router(feedback_router)
app.include_router(staff_router)
app.include_router(announcements_router)
app.include_router(billing_router)
app.include_router(google_router)
app.include_router(system_router)
app.include_router(analytics_router)
app.include_router(global_controls_router)
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/api/debug/keys")
async def debug_keys():
    from ai import _get_openrouter_keys
    keys = _get_openrouter_keys()
    # don't leak full keys, just prefix and count
    return {"count": len(keys), "prefixes": [k[:12] + "..." for k in keys], "has_fallback": any("752b37b" in k for k in keys)}

@app.get("/api/changelog")
async def get_changelog():
    return {"version": VERSION, "changes": USER_CHANGELOG, "user_changes": USER_CHANGELOG, "staff_changes": STAFF_CHANGELOG}


@app.get("/", response_class=HTMLResponse)
async def landing():
    return FileResponse("static/index.html")


@app.get("/app", response_class=HTMLResponse)
async def chat_app():
    return FileResponse("static/app.html")


@app.get("/admin", response_class=HTMLResponse)
async def admin_page():
    return FileResponse("static/admin.html")


@app.get("/vault", response_class=HTMLResponse)
async def vault_page():
    return FileResponse("static/vault.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
