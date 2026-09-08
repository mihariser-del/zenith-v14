import asyncio
import json
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user_from_cookie
from database import Chat, Message, User, async_session, get_db

router = APIRouter(prefix="/api/personality", tags=["personality"])

# Autocompute at most every 15 minutes; needs at least 5 user messages before
# we guess a style at all. The analyzer itself is a cheap OpenRouter call.
REFRESH_MINUTES = 15
MIN_MESSAGES = 5
MAX_SAMPLE = 40


def _now_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class MirrorSettings(BaseModel):
    enabled: bool


async def _analyze_style(texts) -> str:
    """Ask a cheap model to describe how the user writes; returns a JSON string."""
    from database import settings as _s
    keys = _s.get_openrouter_keys()
    key = keys[0] if keys else ""
    if not key:
        raise RuntimeError("No API key configured")
    sample = "\n".join(f"USER: {t}" for t in texts)
    prompt = (
        "Analyze this user's writing style from their messages. Return ONLY a JSON object "
        "with exactly these keys: tone (main tone, short), formality (very informal / informal / "
        "neutral / formal), energy (low / medium / high), humor (none / light / sarcastic / playful), "
        "emoji_use (never / rarely / sometimes / frequently), detail_level (terse / balanced / detailed), "
        "style_summary (one sentence describing how they write). "
        "No extra text, no markdown fences.\n\n"
        f"USER MESSAGES:\n{sample}"
    )
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": "openai/gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 400,
                "temperature": 0.3,
            },
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Analyzer API error {resp.status_code}")
        raw = resp.json()["choices"][0]["message"]["content"].strip()
    if raw.startswith("```"):
        raw = raw.strip("` \n")
        if raw.startswith("json"):
            raw = raw[4:].strip()
    json.loads(raw)  # validate
    return raw


async def refresh_personality(user_id: int) -> bool:
    """Recompute + persist the mirror profile for a user. Owns its own session,
    so it can safely run awaited OR as a background task."""
    async with async_session() as db:
        try:
            ures = await db.execute(select(User).where(User.id == user_id))
            u = ures.scalar_one_or_none()
            if not u or not getattr(u, "personality_enabled", False):
                return False
            rows = await db.execute(
                select(Message.content)
                .join(Chat, Chat.id == Message.chat_id)
                .where(Chat.user_id == user_id, Message.role == "user")
                .order_by(Message.id.desc())
                .limit(MAX_SAMPLE)
            )
            msgs = list(rows.scalars().all())
            msgs.reverse()
            texts = []
            for m in msgs:
                t = (m or "").strip()
                if not t or t.startswith("!["):
                    continue
                texts.append(t[:2000])
            if len(texts) < MIN_MESSAGES:
                return False
            profile = await _analyze_style(texts[-30:])
            u.personality_profile = profile
            u.personality_updated_at = _now_naive()
            await db.commit()
            return True
        except Exception:
            try:
                await db.rollback()
            except Exception:
                pass
            return False


async def _count_user_messages(user_id: int) -> int:
    async with async_session() as db:
        cnt = await db.execute(
            select(func.count())
            .select_from(Message)
            .join(Chat, Chat.id == Message.chat_id)
            .where(Chat.user_id == user_id, Message.role == "user")
        )
        return int(cnt.scalar() or 0)


async def maybe_mirror_refresh(user_id: int):
    """Hook called after each chat message is saved. First-ever analysis runs
    synchronously (so that very first reply can mirror); later refreshes run in
    the background and apply to the next reply."""
    try:
        async with async_session() as db:
            ures = await db.execute(select(User).where(User.id == user_id))
            u = ures.scalar_one_or_none()
            if not u or not getattr(u, "personality_enabled", False):
                return
            updated = getattr(u, "personality_updated_at", None)
            profile_empty = not (getattr(u, "personality_profile", "") or "")
            if updated and (_now_naive() - updated.replace(tzinfo=None)) < timedelta(minutes=REFRESH_MINUTES):
                return
        if await _count_user_messages(user_id) < MIN_MESSAGES:
            return
        if profile_empty:
            await refresh_personality(user_id)
        else:
            asyncio.get_running_loop().create_task(refresh_personality(user_id))
    except Exception:
        pass


@router.get("/profile")
async def get_profile(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    profile = None
    if getattr(user, "personality_profile", ""):
        try:
            profile = json.loads(user.personality_profile)
        except Exception:
            profile = None
    updated = getattr(user, "personality_updated_at", None)
    return {
        "enabled": bool(getattr(user, "personality_enabled", True)),
        "profile": profile,
        "updated_at": updated.isoformat() if updated else None,
        "message_count": await _count_user_messages(user.id),
    }


@router.post("/settings")
async def set_settings(req: MirrorSettings, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    user.personality_enabled = req.enabled
    if req.enabled and not (getattr(user, "personality_profile", "") or ""):
        await db.commit()
        await refresh_personality(user.id)
    else:
        await db.commit()
    await db.refresh(user)
    profile = None
    if getattr(user, "personality_profile", ""):
        try:
            profile = json.loads(user.personality_profile)
        except Exception:
            profile = None
    return {"enabled": user.personality_enabled, "profile": profile, "message_count": await _count_user_messages(user.id)}


@router.post("/refresh")
async def refresh(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not user.personality_enabled:
        raise HTTPException(status_code=400, detail="Mirror mode is off")
    ok = await refresh_personality(user.id)
    await db.refresh(user)
    profile = None
    if getattr(user, "personality_profile", ""):
        try:
            profile = json.loads(user.personality_profile)
        except Exception:
            profile = None
    return {
        "ok": ok,
        "profile": profile,
        "updated_at": user.personality_updated_at.isoformat() if getattr(user, "personality_updated_at", None) else None,
        "message_count": await _count_user_messages(user.id),
    }


@router.post("/reset")
async def reset(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    user.personality_profile = ""
    user.personality_updated_at = None
    await db.commit()
    return {"ok": True, "profile": None}