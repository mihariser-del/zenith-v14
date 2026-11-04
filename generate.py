"""File generation endpoints.

All rendering lives in docgen.py. This module stores generated files next to
uploads (so they get a reopenable /api/files/{id}/download link and show in the
Files list), keeps the Markdown source beside each file for previews, and
exposes:

    POST /api/generate/document   render + download straight away (no storing)
    POST /api/generate/file       render + store, returns the file's link
    GET  /api/generate/preview/{id}  an HTML preview of a stored generated file
"""

import io
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import docgen
from auth import get_current_user_from_cookie
from database import UploadedFile, get_db
from limits import check_limit

router = APIRouter(prefix="/api/generate", tags=["generate"])

try:
    from files import UPLOAD_DIR
except Exception:  # pragma: no cover - defensive
    UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

MIME = docgen.MIME
SUPPORTED = docgen.SUPPORTED
MAX_SOURCE = 400_000  # characters


class GenerateDocRequest(BaseModel):
    content: str
    filename: str = "document"
    format: str = "md"


def render_document(content, filename, fmt):
    """Kept for older imports — same as docgen.render."""
    return docgen.render(content, filename, fmt)


def _src_path(stored_name):
    return os.path.join(UPLOAD_DIR, stored_name + ".src.md")


async def store_file(db, user_id, content, name, fmt):
    """Render `content` as `fmt`, save it, and return (row, size, stats)."""
    fmt = (fmt or "md").lower().strip()
    if fmt not in SUPPORTED:
        raise HTTPException(status_code=400, detail=f"Format not supported: {fmt}")
    content = (content or "")[:MAX_SOURCE]
    data = docgen.render(content, name, fmt)
    stored_name = f"{user_id}_{uuid.uuid4().hex[:12]}.{fmt}"
    with open(os.path.join(UPLOAD_DIR, stored_name), "wb") as f:
        f.write(data)
    try:
        with open(_src_path(stored_name), "w", encoding="utf-8") as f:
            f.write(content)
    except Exception:
        pass
    row = UploadedFile(user_id=user_id, filename=name, stored_name=stored_name,
                       file_size=len(data), mime_type=MIME.get(fmt, "application/octet-stream"))
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row, len(data), docgen.stats(content, fmt)


@router.post("/document")
async def generate_document(req: GenerateDocRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    await check_limit(user, db, "file_tool")
    fmt = (req.format or "md").lower().strip()
    if fmt not in SUPPORTED:
        raise HTTPException(status_code=400, detail=f"Format not supported: {fmt}")
    name, fmt = docgen.safe_name(req.filename or "document", fmt)
    if not name.lower().endswith("." + fmt):
        name = os.path.splitext(name)[0] + "." + fmt
    data = docgen.render((req.content or "")[:MAX_SOURCE], name, fmt)
    ascii_name = name.encode("ascii", "ignore").decode() or f"document.{fmt}"
    return StreamingResponse(
        io.BytesIO(data),
        media_type=MIME[fmt],
        headers={"Content-Disposition": f'attachment; filename="{ascii_name}"'},
    )


@router.post("/file")
async def generate_file_saved(req: GenerateDocRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Render + persist a document, returning a persistent link."""
    user = await get_current_user_from_cookie(request, db)
    await check_limit(user, db, "file_tool")
    fmt = (req.format or "md").lower().strip()
    name, fmt = docgen.safe_name(req.filename or "document", fmt)
    if not name.lower().endswith("." + fmt):
        name = os.path.splitext(name)[0] + "." + fmt
    row, size, info = await store_file(db, user.id, req.content, name, fmt)
    return {"id": row.id, "url": f"/api/files/{row.id}/download", "filename": row.filename,
            "format": fmt, "size": size, "mime": MIME[fmt], "stats": info,
            "preview": f"/api/generate/preview/{row.id}"}


@router.get("/preview/{file_id}")
async def preview(file_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    row = (await db.execute(select(UploadedFile).where(UploadedFile.id == file_id, UploadedFile.user_id == user.id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    fmt = os.path.splitext(row.stored_name)[1].lstrip(".").lower()
    try:
        with open(_src_path(row.stored_name), encoding="utf-8") as f:
            src = f.read()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No preview for this file")
    page = docgen.preview_html(src, row.filename, fmt)
    # The preview may be AI-written HTML: run it in a locked-down sandbox so it
    # can never read the app's cookies or act as the user.
    return HTMLResponse(page, headers={
        "Content-Security-Policy": "sandbox allow-scripts allow-popups; default-src 'self' data: blob: https: 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
    })
