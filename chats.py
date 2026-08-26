from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import Chat, Message, get_db
from auth import get_current_user_from_cookie

router = APIRouter(prefix="/api/chats", tags=["chats"])


class ChatResponse(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RenameRequest(BaseModel):
    title: str


@router.get("")
async def list_chats(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Chat).where(Chat.user_id == user.id).order_by(Chat.updated_at.desc())
    )
    chats = result.scalars().all()
    return {"chats": [ChatResponse.model_validate(c) for c in chats]}


@router.post("")
async def create_chat(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    chat = Chat(user_id=user.id, title="New Chat")
    db.add(chat)
    await db.commit()
    await db.refresh(chat)
    return {"chat": ChatResponse.model_validate(chat)}


@router.patch("/{chat_id}")
async def rename_chat(chat_id: int, req: RenameRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    chat.title = req.title[:100]
    chat.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"chat": ChatResponse.model_validate(chat)}


@router.delete("/{chat_id}")
async def delete_chat(chat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    await db.delete(chat)
    await db.commit()
    return {"message": "Deleted"}


@router.get("/{chat_id}/messages")
async def get_messages(chat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"messages": [MessageResponse.model_validate(m) for m in chat.messages]}


@router.post("/{chat_id}/messages")
async def send_message(chat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    from ai import stream_chat

    user = await get_current_user_from_cookie(request, db)
    body = await request.json()
    content = body.get("content", "").strip()
    images = body.get("images", [])
    think = body.get("think", False)

    if not content and not images:
        raise HTTPException(status_code=400, detail="Message content required")

    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    display_content = content or "(image)"
    user_msg = Message(chat_id=chat.id, role="user", content=display_content)
    db.add(user_msg)

    if chat.title == "New Chat":
        chat.title = (content or "Image chat")[:80]

    chat.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return await stream_chat(chat.id, think, images=images)
