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

VERSION = "15.0"
CHANGELOG = [
    "New supreme OWNER role — WANZU-IBRAHIM, zero restrictions, can manage everything",
    "Admins can no longer act on fellow admins — roles stay protected",
    "Owner can ban, delete & reset any admin — total control",
    "Custom owner messages — 'Banned by The Owner' in an authoritative style",
    "Live chat section between admins and the owner",
    "Delete feedback option in the admin inbox",
    "Attention tab for staff notifications",
    "Free-fallback footer removed (cleaner answers)",
    "Mobile-optimized admin & owner panels",
    "Fixed date joined / last seen display in admin panel",
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
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
