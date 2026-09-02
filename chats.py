from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import Chat, Message, get_db
from auth import get_current_user_from_cookie
from limits import check_limit, check_image_file_window

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
    result = await db.execute(select(Chat).where(Chat.user_id == user.id, Chat.title.like("New Chat%")))
    count = len(result.scalars().all())
    title = "New Chat" if count == 0 else f"New Chat {count + 1}"
    chat = Chat(user_id=user.id, title=title)
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


@router.patch("/{chat_id}/messages/{message_id}")
async def edit_message(chat_id: int, message_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    from ai import stream_chat

    user = await get_current_user_from_cookie(request, db)
    body = await request.json()
    content = body.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message content required")
    result = await db.execute(select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    result = await db.execute(select(Message).where(Message.id == message_id, Message.chat_id == chat_id))
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.role != "user":
        raise HTTPException(status_code=403, detail="Only user messages can be edited")
    msg.content = content
    # delete all following assistant messages
    result = await db.execute(select(Message).where(Message.chat_id == chat_id, Message.id > message_id, Message.role == "assistant"))
    for m in result.scalars().all():
        await db.delete(m)
    chat.updated_at = datetime.now(timezone.utc)
    await db.commit()
    think = body.get("think", False)
    web_search = body.get("web_search", False)
    research = body.get("research", False)
    factcheck = body.get("factcheck", False)
    images = body.get("images", [])
    return await stream_chat(chat.id, think, images=images, web_search=web_search, research=research, factcheck=factcheck)


@router.get("/{chat_id}/messages")
async def get_messages(chat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm import selectinload
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id).options(selectinload(Chat.messages))
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"messages": [MessageResponse.model_validate(m) for m in chat.messages]}


@router.post("/{chat_id}/messages")
async def send_message(chat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    from ai import stream_chat

    user = await get_current_user_from_cookie(request, db)
    # Global messaging toggle (Owner control)
    from sqlalchemy import text as _text
    try:
        res = await db.execute(_text("SELECT value FROM system_settings WHERE key='messaging'"))
        row = res.fetchone()
        if row and row[0] == "off" and getattr(user, "role", "") != "owner":
            raise HTTPException(status_code=403, detail="Messaging is currently disabled by the Owner")
    except HTTPException:
        raise
    except Exception:
        pass
    await check_limit(user, db, "message")
    # Free/guest 20-msg window after image/file
    await check_image_file_window(user, db, chat_id)
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

    if content:
        display_content = content
    elif images:
        display_content = f"[Image x{len(images)}]"
    else:
        display_content = "(image)"
    user_msg = Message(chat_id=chat.id, role="user", content=display_content)
    db.add(user_msg)

    if chat.title == "New Chat":
        chat.title = (content or (f"Image x{len(images)}" if images else "New Chat"))[:80]

    chat.updated_at = datetime.now(timezone.utc)
    await db.commit()

    web_search = body.get("web_search", False)
    research = body.get("research", False)
    factcheck = body.get("factcheck", False)
    return await stream_chat(chat.id, think, images=images, web_search=web_search, research=research, factcheck=factcheck)
