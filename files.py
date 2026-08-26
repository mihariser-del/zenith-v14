import os
import uuid
import subprocess
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse as FastAPIFileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import UploadedFile, Chat, get_db
from auth import get_current_user_from_cookie

router = APIRouter(prefix="/api/files", tags=["files"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_TYPES = {
    "image/png", "image/jpeg", "image/gif", "image/webp",
    "text/plain", "text/markdown", "text/csv",
    "application/json", "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
MAX_SIZE = 20 * 1024 * 1024


class FileInfoResponse(BaseModel):
    id: int
    filename: str
    file_size: int
    mime_type: str
    version: int
    created_at: datetime
    chat_id: int | None = None

    model_config = {"from_attributes": True}


@router.post("/upload")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    chat_id: int = None,
    db: AsyncSession = Depends(get_db),
):
    user = await get_current_user_from_cookie(request, db)

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 20MB)")

    if file.content_type and file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"File type not allowed: {file.content_type}")

    ext = os.path.splitext(file.filename or "file")[1]
    stored_name = f"{user.id}_{uuid.uuid4().hex[:12]}{ext}"
    file_path = os.path.join(UPLOAD_DIR, stored_name)

    with open(file_path, "wb") as f:
        f.write(content)

    db_file = UploadedFile(
        user_id=user.id,
        chat_id=chat_id,
        filename=file.filename or "unnamed",
        stored_name=stored_name,
        file_size=len(content),
        mime_type=file.content_type or "application/octet-stream",
    )
    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)

    return {"file": FileInfoResponse.model_validate(db_file)}


@router.get("")
async def list_files(request: Request, chat_id: int = None, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    query = select(UploadedFile).where(UploadedFile.user_id == user.id)
    if chat_id:
        query = query.where(UploadedFile.chat_id == chat_id)
    result = await db.execute(query.order_by(UploadedFile.created_at.desc()).limit(50))
    files = result.scalars().all()
    return {"files": [FileInfoResponse.model_validate(f) for f in files]}


@router.get("/{file_id}/download")
async def download_file(file_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(UploadedFile).where(UploadedFile.id == file_id, UploadedFile.user_id == user.id)
    )
    db_file = result.scalar_one_or_none()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = os.path.join(UPLOAD_DIR, db_file.stored_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File missing from disk")

    return FastAPIFileResponse(
        path=file_path,
        filename=db_file.filename,
        media_type=db_file.mime_type,
    )


@router.get("/{file_id}/read")
async def read_file(file_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(UploadedFile).where(UploadedFile.id == file_id, UploadedFile.user_id == user.id)
    )
    db_file = result.scalar_one_or_none()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = os.path.join(UPLOAD_DIR, db_file.stored_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File missing from disk")

    if db_file.mime_type == "application/pdf":
        text = extract_pdf_text(file_path)
        return {"filename": db_file.filename, "content": text, "type": "pdf"}

    if db_file.mime_type.startswith("image/"):
        return {"filename": db_file.filename, "type": "image", "url": f"/api/files/{file_id}/download"}

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        return {"filename": db_file.filename, "content": content, "type": "text"}
    except Exception:
        raise HTTPException(status_code=400, detail="Cannot read this file type")


@router.delete("/{file_id}")
async def delete_file(file_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(UploadedFile).where(UploadedFile.id == file_id, UploadedFile.user_id == user.id)
    )
    db_file = result.scalar_one_or_none()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = os.path.join(UPLOAD_DIR, db_file.stored_name)
    if os.path.exists(file_path):
        os.remove(file_path)

    await db.delete(db_file)
    await db.commit()
    return {"message": "Deleted"}


def extract_pdf_text(file_path: str) -> str:
    try:
        result = subprocess.run(
            ["python", "-c", f"""
import sys
sys.path.insert(0, '.')
try:
    import PyPDF2
    with open(r"{file_path}", "rb") as f:
        reader = PyPDF2.PdfReader(f)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
        print(text[:50000])
except ImportError:
    print("[PDF extraction requires PyPDF2. Install with: pip install PyPDF2]")
"""],
            capture_output=True, text=True, timeout=30
        )
        return result.stdout or "[Could not extract PDF text]"
    except Exception as e:
        return f"[PDF extraction error: {e}]"
