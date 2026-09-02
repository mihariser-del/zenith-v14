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

VERSION = "17.0"
CHANGELOG = [
    "Upgrade button + Monthly/Yearly/Lifetime tabs — Pro $5.99/$59.99, Ultimate $11.99/$119.99, Lifetime $200/$400",
    "Billing: Stripe + 5-day Pro trial (card required), guest 40-msg pause, free 5 img/15 uploads",
    "Vault fullscreen — hamburger, Ban/Delete, live stats, owner titanium vs admin gold",
    "Mobile: billing, vault, voice orb (blue-purple), broadcast all responsive",
    "Upgrade prompt only on limit — not on every click",
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
    return {"version": VERSION, "changes": CHANGELOG}


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
