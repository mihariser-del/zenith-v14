"""Shared chats: talk to Zelpophai together (26.1).

The chat's owner presses People → Invite and gets a link (/app/join/<code>).
Anyone with a Zelpophai account who opens it joins the chat: it appears in
their sidebar, they see everything said in it, and they can write too. Each
person's messages count against their own allowance. Zelpophai answers
everyone, sees who said what ("[Bob]: …"), and in a shared chat never brings in
anyone's private memories.

Live updates are polled (GET …/updates?after=<last id>, every few seconds while
the chat is open) — there's no server push in this app.

Rules: up to 8 people; only the owner can invite, turn the link off, remove
people, rename, share publicly or delete; anyone can leave.
"""

import secrets
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user_from_cookie
from database import Chat, ChatMember, Message, User, get_db

router = APIRouter(prefix="/api/chats", tags=["shared-chats"])

MAX_PEOPLE = 8
# Who Zelpophai is answering right now, per chat: {chat_id: {"name", "after", "t"}}
_BUSY: dict = {}


def _is_guest(user) -> bool:
    return (getattr(user, "username", "") or "").startswith("guest_")


def name_of(u) -> str:
    return ((getattr(u, "display_name", "") or "").strip() or getattr(u, "username", "") or "Someone")[:40]


async def access(db: AsyncSession, user, chat_id: int):
    """(chat, is_owner) if this person may use the chat, else 404."""
    chat = await db.get(Chat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if chat.user_id == user.id:
        return chat, True
    if chat.is_group:
        m = (await db.execute(select(ChatMember).where(ChatMember.chat_id == chat_id,
                                                       ChatMember.user_id == user.id))).scalars().first()
        if m:
            return chat, False
    raise HTTPException(status_code=404, detail="Chat not found")


async def member_chat_ids(db: AsyncSession, user_id: int) -> list:
    return [r[0] for r in (await db.execute(select(ChatMember.chat_id).where(ChatMember.user_id == user_id))).all()]


async def names(db: AsyncSession, chat) -> dict:
    """user id → display name for everyone in a shared chat."""
    ids = {chat.user_id} | {r[0] for r in (await db.execute(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat.id))).all()}
    rows = (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all()
    return {u.id: name_of(u) for u in rows}


def mark_busy(chat_id: int, who: str, after_id: int):
    _BUSY[chat_id] = {"name": who, "after": after_id, "t": time.time()}


def _invite_url(request: Request, code: str) -> str:
    import site_address
    try:
        base = site_address.base()
    except Exception:
        base = str(request.base_url).rstrip("/")
    return f"{base}/app/join/{code}"


@router.get("/{chat_id}/people")
async def people(chat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    chat, owner = await access(db, user, chat_id)
    owner_user = await db.get(User, chat.user_id)
    out = [{"id": chat.user_id, "name": name_of(owner_user), "owner": True, "me": chat.user_id == user.id}]
    rows = (await db.execute(select(ChatMember, User).join(User, User.id == ChatMember.user_id)
                             .where(ChatMember.chat_id == chat.id).order_by(ChatMember.joined_at))).all()
    for m, u in rows:
        out.append({"id": u.id, "name": name_of(u), "owner": False, "me": u.id == user.id})
    return {"people": out, "is_owner": owner, "group": bool(chat.is_group), "max": MAX_PEOPLE,
            "invite": _invite_url(request, chat.invite_code) if owner and chat.invite_code else None}


@router.post("/{chat_id}/invite")
async def invite(chat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Turn the chat into a shared one (if it isn't) and give its invite link."""
    user = await get_current_user_from_cookie(request, db)
    if _is_guest(user):
        raise HTTPException(status_code=403, detail="Create a free account to share chats with people.")
    chat, owner = await access(db, user, chat_id)
    if not owner:
        raise HTTPException(status_code=403, detail="Only the person who started this chat can invite people.")
    if not chat.invite_code:
        chat.invite_code = secrets.token_urlsafe(12).replace("-", "x").replace("_", "z")
    chat.is_group = True
    await db.commit()
    return {"invite": _invite_url(request, chat.invite_code), "code": chat.invite_code}


@router.delete("/{chat_id}/invite")
async def stop_invite(chat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Turn the invite link off. People already in stay in."""
    user = await get_current_user_from_cookie(request, db)
    chat, owner = await access(db, user, chat_id)
    if not owner:
        raise HTTPException(status_code=403, detail="Only the person who started this chat can do that.")
    chat.invite_code = None
    await db.commit()
    return {"ok": True}


@router.get("/join/{code}")
async def join_info(code: str, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    chat = (await db.execute(select(Chat).where(Chat.invite_code == code))).scalars().first() if code else None
    if not chat:
        raise HTTPException(status_code=404, detail="This invite link isn't valid any more. Ask for a new one.")
    owner_user = await db.get(User, chat.user_id)
    n = 1 + ((await db.execute(select(func.count()).select_from(ChatMember).where(ChatMember.chat_id == chat.id))).scalar() or 0)
    already = chat.user_id == user.id or bool((await db.execute(select(ChatMember).where(
        ChatMember.chat_id == chat.id, ChatMember.user_id == user.id))).scalars().first())
    return {"title": chat.title, "owner": name_of(owner_user), "people": n, "already": already,
            "link_id": chat.link_id if already else None, "full": n >= MAX_PEOPLE, "guest": _is_guest(user)}


@router.post("/join/{code}")
async def join(code: str, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if _is_guest(user):
        raise HTTPException(status_code=403, detail="Create a free account (or log in) to join this chat.")
    chat = (await db.execute(select(Chat).where(Chat.invite_code == code))).scalars().first() if code else None
    if not chat:
        raise HTTPException(status_code=404, detail="This invite link isn't valid any more. Ask for a new one.")
    if chat.user_id != user.id:
        have = (await db.execute(select(ChatMember).where(ChatMember.chat_id == chat.id,
                                                          ChatMember.user_id == user.id))).scalars().first()
        if not have:
            n = 1 + ((await db.execute(select(func.count()).select_from(ChatMember)
                                       .where(ChatMember.chat_id == chat.id))).scalar() or 0)
            if n >= MAX_PEOPLE:
                raise HTTPException(status_code=409, detail=f"This chat is full ({MAX_PEOPLE} people).")
            last = (await db.execute(select(func.max(Message.id)).where(Message.chat_id == chat.id))).scalar() or 0
            db.add(ChatMember(chat_id=chat.id, user_id=user.id, last_seen_id=last))
            db.add(Message(chat_id=chat.id, role="system", content=f"{name_of(user)} joined the chat"))
            chat.updated_at = datetime.now(timezone.utc)
            await db.commit()
    return {"link_id": chat.link_id, "chat_id": chat.id}


@router.delete("/{chat_id}/people/{uid}")
async def remove(chat_id: int, uid: int, request: Request, db: AsyncSession = Depends(get_db)):
    """The owner removes someone, or someone leaves."""
    user = await get_current_user_from_cookie(request, db)
    chat, owner = await access(db, user, chat_id)
    if uid == chat.user_id:
        raise HTTPException(status_code=400, detail="The person who started the chat can't leave it — they can delete it instead.")
    if not owner and uid != user.id:
        raise HTTPException(status_code=403, detail="Only the person who started this chat can remove people.")
    m = (await db.execute(select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == uid))).scalars().first()
    if not m:
        raise HTTPException(status_code=404, detail="They aren't in this chat.")
    gone = await db.get(User, uid)
    await db.delete(m)
    db.add(Message(chat_id=chat.id, role="system",
                   content=f"{name_of(gone)} left the chat" if uid == user.id else f"{name_of(gone)} was removed"))
    await db.commit()
    return {"ok": True}


@router.get("/{chat_id}/updates")
async def updates(chat_id: int, request: Request, after: int = 0, db: AsyncSession = Depends(get_db)):
    """What's new in a shared chat since message `after`."""
    user = await get_current_user_from_cookie(request, db)
    chat, owner = await access(db, user, chat_id)
    rows = (await db.execute(select(Message).where(Message.chat_id == chat_id, Message.id > after)
                             .order_by(Message.id).limit(60))).scalars().all()
    who = await names(db, chat) if chat.is_group else {}
    b = _BUSY.get(chat_id)
    busy = None
    if b and time.time() - b["t"] < 180 and not any(m.role == "assistant" and m.id > b["after"] for m in rows):
        done = (await db.execute(select(func.count()).select_from(Message).where(
            Message.chat_id == chat_id, Message.role == "assistant", Message.id > b["after"]))).scalar()
        busy = None if done else b["name"]
    if rows and not owner:
        m = (await db.execute(select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id))).scalars().first()
        if m:
            m.last_seen_id = rows[-1].id
            await db.commit()
    return {"messages": [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat() if m.created_at else "",
                          "author_id": m.author_id, "author": who.get(m.author_id, "") if m.author_id else "",
                          "reactions": m.reactions or "{}", "viewer_reactions": m.viewer_reactions or "{}"} for m in rows],
            "busy": busy, "title": chat.title, "group": bool(chat.is_group)}
