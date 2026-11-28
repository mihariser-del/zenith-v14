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
    share_anon: bool | None = False
    pinned: bool = False
    folder: str = ""
    model: str = ""
    created_at: datetime
    updated_at: datetime
    is_group: bool | None = False
    project_id: int | None = None
    assistant_id: int | None = None
    mine: bool = True            # False: someone else's shared chat you were invited into
    owner_name: str = ""

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    reactions: str = "{}"
    viewer_reactions: str = "{}"
    created_at: datetime
    author_id: int | None = None
    author: str = ""

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


@router.get("/greeting")
async def greeting(request: Request, db: AsyncSession = Depends(get_db)):
    """What the new-chat screen says: your name and where you left off."""
    from tools_prompt import recent_chats
    from limits import _is_guest
    user = await get_current_user_from_cookie(request, db)
    guest = _is_guest(user)
    name = "" if guest else ((getattr(user, "display_name", "") or user.username or "").strip())
    recent = [] if guest else await recent_chats(db, user, limit=3)
    return {"guest": guest, "name": name, "first": name.split()[0] if name else "",
            "recent": [{k: r[k] for k in ("title", "link_id", "updated_at", "last")} for r in recent]}


@router.get("")
async def list_chats(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    import groupchats
    from database import User as _U
    shared_ids = await groupchats.member_chat_ids(db, user.id)
    cond = (Chat.user_id == user.id) | (Chat.id.in_(shared_ids)) if shared_ids else (Chat.user_id == user.id)
    chats = (await db.execute(select(Chat).where(cond).order_by(Chat.updated_at.desc()))).scalars().all()
    owners = {}
    if shared_ids:
        oids = {c.user_id for c in chats if c.user_id != user.id}
        owners = {u.id: groupchats.name_of(u) for u in (await db.execute(select(_U).where(_U.id.in_(oids)))).scalars().all()}
    out = []
    for c in chats:
        r = ChatResponse.model_validate(c)
        if c.user_id != user.id:
            r.mine = False
            r.owner_name = owners.get(c.user_id, "")
        out.append(r)
    return {"chats": out}


@router.post("")
async def create_chat(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(select(Chat).where(Chat.user_id == user.id, Chat.title.like("New Chat%")))
    count = len(result.scalars().all())
    title = "New Chat" if count == 0 else f"New Chat {count + 1}"
    chat = Chat(user_id=user.id, title=title, link_id=_new_link_id())
    # 26.2: a new chat can start inside a project and/or with a custom assistant.
    try:
        body = await request.json()
    except Exception:
        body = {}
    if isinstance(body, dict):
        import workspace
        if body.get("project_id"):
            await workspace._project(db, user, int(body["project_id"]))
            chat.project_id = int(body["project_id"])
        if body.get("assistant_id"):
            a = await workspace.can_use_assistant(db, user, int(body["assistant_id"]))
            if not a:
                raise HTTPException(status_code=404, detail="Assistant not found")
            chat.assistant_id = a.id
            a.uses = (a.uses or 0) + 1
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
        import groupchats
        try:
            await groupchats.access(db, user, chat.id)
        except HTTPException:
            raise HTTPException(status_code=403, detail="You do not have access to this chat. It belongs to another account.")
        r = ChatResponse.model_validate(chat)
        r.mine = False
        return {"chat": r}
    return {"chat": ChatResponse.model_validate(chat)}


def _public_base(request: Request) -> str:
    base = __import__("os").getenv("FRONTEND_URL", "").strip().rstrip("/")
    if not base:
        base = str(request.base_url).rstrip("/")
    return base


@router.post("/{chat_id}/share")
async def share_chat(chat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Create (or update) the public link. The link is a snapshot: messages
    sent after sharing stay private until the owner presses "Update link".
    Body (optional): {"anonymous": bool, "update": bool}."""
    import secrets
    from sqlalchemy import func as _f
    user = await get_current_user_from_cookie(request, db)
    if user.username.startswith("guest_"):
        raise HTTPException(status_code=403, detail="Guests cannot share chats")
    try:
        body = await request.json()
    except Exception:
        body = {}
    body = body if isinstance(body, dict) else {}
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    last_id = (await db.execute(select(_f.max(Message.id)).where(Message.chat_id == chat.id))).scalar()
    if not chat.share_id:
        chat.share_id = secrets.token_hex(16)
        chat.shared_at = datetime.now(timezone.utc)
        chat.share_upto = last_id
    elif body.get("update"):
        chat.share_upto = last_id
        chat.shared_at = datetime.now(timezone.utc)
    if "anonymous" in body:
        chat.share_anon = bool(body.get("anonymous"))
    await db.commit()
    await db.refresh(chat)
    newer = 0
    if chat.share_upto:
        newer = (await db.execute(select(_f.count()).select_from(Message).where(
            Message.chat_id == chat.id, Message.id > chat.share_upto))).scalar() or 0
    return {"link": f"{_public_base(request)}/s/{chat.share_id}", "share_id": chat.share_id,
            "anonymous": bool(chat.share_anon), "newer": newer,
            "shared_at": chat.shared_at.isoformat() if chat.shared_at else None}


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
    chat.share_upto = None
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
    if req.model is not None and getattr(user, "role", "") == "owner":
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
        label = "You" if m.role == "user" else ("Zelpophai AI" if m.role == "assistant" else m.role)
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
        select(Chat).where(Chat.id == (await __import__("groupchats").access(db, user, chat_id))[0].id)
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
    import groupchats
    chat, owner = await groupchats.access(db, user, chat_id)
    if not owner:
        # Deleting someone else's shared chat from your list = leaving it.
        await groupchats.remove(chat_id, user.id, request, db)
        return {"message": "Left"}
    await db.delete(chat)
    await db.commit()
    return {"message": "Deleted"}


class TodoTick(BaseModel):
    i: int
    done: bool


@router.post("/{chat_id}/messages/{message_id}/todo")
async def tick_todo(chat_id: int, message_id: int, req: TodoTick, request: Request, db: AsyncSession = Depends(get_db)):
    """Tick or untick one item on a checklist Zelpophai wrote, so it stays ticked."""
    import re as _re
    user = await get_current_user_from_cookie(request, db)
    chat = (await __import__("groupchats").access(db, user, chat_id))[0]
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    msg = (await db.execute(select(Message).where(Message.id == message_id, Message.chat_id == chat_id,
                                                  Message.role == "assistant"))).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    text = msg.content or ""
    m = _re.search(r"<ztodo\b[^>]*>([\s\S]*?)</ztodo>", text, _re.I)
    if not m:
        raise HTTPException(status_code=400, detail="There's no checklist in that answer.")
    body = m.group(1)
    lines = body.split("\n")
    n = -1
    for k, line in enumerate(lines):
        mm = _re.match(r"^(\s*[-*]\s*\[)([ xX])(\].*)$", line)
        if mm:
            n += 1
            if n == req.i:
                lines[k] = mm.group(1) + ("x" if req.done else " ") + mm.group(3)
                break
    else:
        raise HTTPException(status_code=400, detail="That item isn't on the checklist.")
    new_body = "\n".join(lines)
    text = text[:m.start(1)] + new_body + text[m.end(1):]
    if not req.done:
        # The AI may have ticked it while writing (<zdone n="…"/>, counted from 1).
        text = _re.sub(r'<zdone\b[^>]*?n\s*=\s*"%d"[^>]*?/?>(?:</zdone>)?' % (req.i + 1), "", text, flags=_re.I)
    msg.content = text
    await db.commit()
    return {"ok": True}


class RunResult(BaseModel):
    i: int
    ok: bool = True
    stdout: str = ""
    error: str = ""
    images: list[str] = []


class RunResults(BaseModel):
    results: list[RunResult]
    tz: str | None = None


@router.post("/{chat_id}/messages/{message_id}/run")
async def code_ran(chat_id: int, message_id: int, req: RunResults, request: Request, db: AsyncSession = Depends(get_db)):
    """The code Zelpophai wrote has run on the person's device. Keep the results
    on the message (so they're there after a reload), then let the AI finish the
    answer with them. Doesn't count as another message."""
    import base64, re as _re, secrets as _sec
    from html import escape as _esc
    from ai import stream_chat
    user = await get_current_user_from_cookie(request, db)
    chat = (await __import__("groupchats").access(db, user, chat_id))[0]
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    msg = (await db.execute(select(Message).where(Message.id == message_id, Message.chat_id == chat_id,
                                                  Message.role == "assistant"))).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    text = msg.content or ""
    spans = [m for m in _re.finditer(r"<zrun\b[^>]*>[\s\S]*?</zrun>(\s*<zout\b[^>]*>[\s\S]*?</zout>)?", text, _re.I)]
    if not spans:
        raise HTTPException(status_code=400, detail="There's no code in that answer.")
    if any(m.group(1) for m in spans):
        raise HTTPException(status_code=409, detail="That code has already been run.")
    # Only one follow-up per run, and a run's follow-up may run code once more at most.
    later = (await db.execute(select(Message).where(Message.chat_id == chat_id, Message.id > message_id))).scalars().first()
    if later:
        raise HTTPException(status_code=409, detail="The conversation has moved on.")

    from image import _image_dir
    by_i = {r.i: r for r in req.results}
    summary = []
    # Work backwards so the positions of earlier blocks stay valid while we insert.
    for n in range(len(spans) - 1, -1, -1):
        m = spans[n]
        r = by_i.get(n) or RunResult(i=n, ok=False, error="It didn't run.")
        urls = []
        for data in (r.images or [])[:6]:
            mm = _re.match(r"^data:image/png;base64,([A-Za-z0-9+/=]+)$", data or "")
            if not mm:
                continue
            raw = base64.b64decode(mm.group(1))
            if len(raw) > 3_000_000 or not raw.startswith(b"\x89PNG"):
                continue
            name = f"img_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{_sec.token_hex(4)}.png"
            _image_dir().joinpath(name).write_bytes(raw)
            urls.append(f"/api/image/serve/{name}")
        out = (r.stdout or "")[:20000]
        if r.error:
            out = (out + "\n" if out else "") + "Error: " + r.error[:3000]
        # Stored escaped, so nothing the code printed can turn into a tag.
        block = f'\n<zout ok="{"true" if r.ok and not r.error else "false"}" imgs="{"|".join(urls)}">{_esc(out, quote=False)}</zout>'
        text = text[:m.end()] + block + text[m.end():]
        summary.insert(0, (n, r, out, len(urls)))
    msg.content = text
    await db.commit()

    lines = ["[The app ran your code on the user's device. Results:]"]
    for n, r, out, k in summary:
        lines.append(f"--- run {n + 1}: {'worked' if r.ok and not r.error else 'FAILED'}"
                     + (f", made {k} chart{'s' if k != 1 else ''} the user can already see" if k else ""))
        lines.append(out.strip()[:6000] or "(it printed nothing)")
    failed = any(not r.ok or r.error for _, r, _, _ in summary)
    lines.append("Now finish your answer for the user using these results. Give the actual numbers plainly; don't show "
                 "or repeat the code, and don't mention running code unless it helps." +
                 (" A run failed: if you can see the mistake, you may write ONE corrected <zrun> and stop; otherwise "
                  "explain what you can without it." if failed else " Don't write another <zrun>."))
    return await stream_chat(chat_id, think=False, client_tz=req.tz, continuation="\n".join(lines), actor_id=user.id)


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
    if getattr(chat, "is_group", False):
        raise HTTPException(status_code=400, detail="Messages can't be edited in a shared chat.")
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
    # Web search is now fully automatic (ai.py detects live-data questions);
    # the flag only exists so Research/Fact can force it.
    web_search = body.get("web_search", False)
    research = body.get("research", False)
    factcheck = body.get("factcheck", False)
    images = body.get("images", [])
    if await _ai_off(db, user):
        async def _silent_gen():
            yield "data: [DONE]\n\n"
        return StreamingResponse(_silent_gen(), media_type="text/event-stream")
    return await stream_chat(chat.id, think, images=images, web_search=web_search, research=research, factcheck=factcheck, client_tz=str(body.get("tz") or "")[:64] or None, voice=bool(body.get("voice")), actor_id=user.id)


async def _auto_extract_worker(user_id: int):
    from database import async_session as _asess
    try:
        async with _asess() as db:
            from memories import run_auto_extract
            await run_auto_extract(user_id, db)
    except Exception:
        pass


@router.get("/{chat_id}/messages")
async def get_messages(chat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm import selectinload
    user = await get_current_user_from_cookie(request, db)
    import groupchats
    await groupchats.access(db, user, chat_id)
    result = await db.execute(select(Chat).where(Chat.id == chat_id).options(selectinload(Chat.messages)))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    who = await groupchats.names(db, chat) if chat.is_group else {}
    out = []
    for m in chat.messages:
        r = MessageResponse.model_validate(m)
        if m.author_id:
            r.author = who.get(m.author_id, "")
        out.append(r)
    return {"messages": out}


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

    import groupchats
    chat, _owner = await groupchats.access(db, user, chat_id)

    if content:
        display_content = content
    elif images:
        display_content = f"[Image x{len(images)}]"
    else:
        display_content = "(image)"
    user_msg = Message(chat_id=chat.id, role="user", content=display_content, author_id=user.id)
    db.add(user_msg)

    if (chat.title or "").startswith("New Chat"):
        # Quick readable title now; ai.py swaps in a short AI-written one after the reply.
        from ai import _provisional_title
        chat.title = (_provisional_title(content) or (f"Image x{len(images)}" if images else chat.title))[:80]

    chat.updated_at = datetime.now(timezone.utc)
    await db.commit()
    if chat.is_group:
        groupchats.mark_busy(chat.id, groupchats.name_of(user), user_msg.id)
    try:
        from vault_events import check_message
        check_message(user.id, chat.id, user_msg.id, content or "")
    except Exception:
        pass
    try:
        import asyncio as _aio
        from invites import friend_progress
        _aio.get_running_loop().create_task(friend_progress(user.id))   # an invited friend who is now active counts
    except Exception:
        pass

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
    # Auto memory: fire-and-forget background extraction so the AI remembers
    # things about the user without them opening the Memory tab. Throttled
    # server-side (once per ~10 min per user).
    try:
        import asyncio as _aio
        _aio.ensure_future(_auto_extract_worker(user.id))
    except Exception:
        pass
    return await stream_chat(chat.id, think, images=images, web_search=web_search, research=research, factcheck=factcheck, client_tz=str(body.get("tz") or "")[:64] or None, voice=bool(body.get("voice")), actor_id=user.id)
