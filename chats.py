from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import Chat, Message, get_db
from auth import get_current_user_from_cookie
from limits import check_limit, check_chat_media_window

router = APIRouter(prefix="/api/chats", tags=["chats"])


class ChatResponse(BaseModel):
    id: int
    title: str
    link_id: str
    share_id: str | None = None
    shared_at: datetime | None = None
    pinned: bool = False
    folder: str = ""
    model: str = ""
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    reactions: str = "{}"
    viewer_reactions: str = "{}"
    created_at: datetime

    model_config = {"from_attributes": True}


class RenameRequest(BaseModel):
    title: str


async def _ai_off(db: AsyncSession, user) -> bool:
    """True when the Owner has globally disabled AI responses for non-owner users."""
    from sqlalchemy import text as _text
    try:
        res = await db.execute(_text("SELECT value FROM system_settings WHERE key='ai_enabled'"))
        row = res.fetchone()
        return bool(row and row[0] == "off" and getattr(user, "role", "") != "owner")
    except Exception:
        return False


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
    chat = Chat(user_id=user.id, title=title, link_id=_new_link_id())
    db.add(chat)
    await db.commit()
    await db.refresh(chat)
    return {"chat": ChatResponse.model_validate(chat)}


def _new_link_id():
    """Generate a unique, unguessable per-chat link id (like ChatGPT's /c/<uuid>)."""
    import secrets
    return secrets.token_hex(16)


@router.get("/by-link/{link_id}")
async def get_chat_by_link(link_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Resolve a chat by its unique link_id. Only the chat's owner can access it."""
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Chat).where(Chat.link_id == link_id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="This chat does not exist or was deleted")
    if chat.user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not have access to this chat. It belongs to another account.")
    return {"chat": ChatResponse.model_validate(chat)}


def _public_base(request: Request) -> str:
    base = __import__("os").getenv("FRONTEND_URL", "").strip().rstrip("/")
    if not base:
        base = str(request.base_url).rstrip("/")
    return base


@router.post("/{chat_id}/share")
async def share_chat(chat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    import secrets
    user = await get_current_user_from_cookie(request, db)
    if user.username.startswith("guest_"):
        raise HTTPException(status_code=403, detail="Guests cannot share chats")
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if not chat.share_id:
        chat.share_id = secrets.token_hex(16)
        chat.shared_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(chat)
    return {"link": f"{_public_base(request)}/s/{chat.share_id}", "share_id": chat.share_id}


@router.post("/{chat_id}/unshare")
async def unshare_chat(chat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    chat.share_id = None
    chat.shared_at = None
    await db.commit()
    return {"message": "Unshared"}


class ChatPrefsRequest(BaseModel):
    pinned: bool | None = None
    folder: str | None = None
    model: str | None = None


@router.patch("/{chat_id}/prefs")
async def update_chat_prefs(chat_id: int, req: ChatPrefsRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if req.pinned is not None:
        chat.pinned = req.pinned
    if req.folder is not None:
        chat.folder = (req.folder or "").strip()[:50]
    if req.model is not None:
        chat.model = (req.model or "").strip()[:100]
    chat.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(chat)
    return {"chat": ChatResponse.model_validate(chat)}


@router.get("/{chat_id}/export")
async def export_chat(chat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import PlainTextResponse
    fmt = request.query_params.get("format", "txt")
    if fmt not in ("txt", "md"):
        raise HTTPException(status_code=400, detail="format must be txt or md")
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    msg_result = await db.execute(
        select(Message).where(Message.chat_id == chat.id).order_by(Message.id)
    )
    lines = [f"# {chat.title}", ""]
    for m in msg_result.scalars().all():
        label = "You" if m.role == "user" else ("Quolvex" if m.role == "assistant" else m.role)
        stamp = m.created_at.strftime("%Y-%m-%d %H:%M") if m.created_at else ""
        if fmt == "md":
            lines.append(f"### {label} — {stamp}\n{m.content}\n")
        else:
            lines.append(f"[{label} - {stamp}]\n{m.content}\n")
    content = "\n".join(lines)
    ext = "md" if fmt == "md" else "txt"
    safe = "".join(c for c in chat.title if c.isalnum() or c in " _-") or "chat"
    return PlainTextResponse(
        content,
        headers={"Content-Disposition": f'attachment; filename="{safe[:60]}.{ext}"'},
    )


class ReactRequest(BaseModel):
    emoji: str


@router.post("/{chat_id}/messages/{message_id}/react")
async def react_message(chat_id: int, message_id: int, req: ReactRequest, request: Request, db: AsyncSession = Depends(get_db)):
    import json
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    msg_result = await db.execute(
        select(Message).where(Message.id == message_id, Message.chat_id == chat_id)
    )
    msg = msg_result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    emoji = (req.emoji or "").strip()[:8]
    if not emoji:
        raise HTTPException(status_code=400, detail="Emoji required")
    try:
        reactions = json.loads(msg.reactions or "{}")
    except Exception:
        reactions = {}
    names = reactions.get(emoji, [])
    username = user.username
    if username in names:
        names.remove(username)
        if not names:
            reactions.pop(emoji, None)
    else:
        names.append(username)
        reactions[emoji] = names
    msg.reactions = json.dumps(reactions)
    await db.commit()
    return {"reactions": reactions}


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
    if await _ai_off(db, user):
        async def _silent_gen():
            yield "data: [DONE]\n\n"
        return StreamingResponse(_silent_gen(), media_type="text/event-stream")
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
    # Logged-in: 15-message allowance after 5 image gens / 15 file uploads in
    # this chat, then a long cooldown timer (images/files count as messages).
    await check_chat_media_window(user, db, chat_id)
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

    # Global AI toggle (Owner control): when AI responses are off, the user message is
    # saved but the AI stays completely silent ("talking to nothing") for everyone except
    # the Owner, so disabling AI actually stops all responses.
    if await _ai_off(db, user):
        async def _silent_gen():
            yield "data: [DONE]\n\n"
        return StreamingResponse(_silent_gen(), media_type="text/event-stream")

    web_search = body.get("web_search", False)
    research = body.get("research", False)
    factcheck = body.get("factcheck", False)
    # Personality Mirror: auto-recompute the user's style profile after they send
    # a message (first-time analytically synchronous so the reply can mirror;
    # later refreshes are backgrounded and apply to the next reply).
    try:
        from personality import maybe_mirror_refresh
        await maybe_mirror_refresh(user.id)
    except Exception:
        pass
    return await stream_chat(chat.id, think, images=images, web_search=web_search, research=research, factcheck=factcheck)
