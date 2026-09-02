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

VERSION = "18.0"
CHANGELOG = [
    "Offline Mode: exiting returns you to the offline popup, not the app UI",
    "Back online while offline → mini popup prompts you to leave offline mode",
    "Offline directory massively expanded: world capitals, history, algebra & math (1+1=2, square roots, equations, pi, trig)",
    "Fixed '?' showing in Banned/Deleted 'by' columns — old records backfilled to 'Staff'",
    "Dashboard Live Now: who's online, green dots in recent & activity feed (live, no caching)",
    "System gauges now labelled (CPU / RAM / Storage) so every percent is clear",
    "All PRO tags cleared from non-staff users; Owners & Admins auto-have Ultimate",
    "Full UI polish on recent accounts, activity feed & messages-per-hour",
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
