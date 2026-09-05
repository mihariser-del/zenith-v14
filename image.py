import re
import urllib.parse
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import Chat, Message, get_db
from auth import get_current_user_from_cookie
from limits import check_limit

router = APIRouter(prefix="/api/image", tags=["image"])

class ImageRequest(BaseModel):
    prompt: str
    width: int = 1024
    height: int = 1024
    chat_id: int | None = None

class ImageEditRequest(BaseModel):
    chat_id: int
    change: str
    width: int = 1024
    height: int = 1024

def _clamp_dim(v):
    return max(512, min(int(v), 1536))

def _image_url(prompt, w, h, seed):
    encoded = urllib.parse.quote(prompt)
    return f"https://image.pollinations.ai/p/{encoded}?width={w}&height={h}&model=flux&nologo=true&enhance=true&seed={seed}"

async def _last_generated(db: AsyncSession, chat_id: int):
    """Return (base_prompt, seed) of the most recent generated image in a chat.

    Generated images are persisted as assistant messages containing
    '![Generated image](url)' where the URL carries the seed. The prompt line
    ('**Prompt:** ...') holds the base prompt used, so follow-up edits can merge
    a change into it and reuse the exact same seed for a similar composition.
    """
    result = await db.execute(select(Message).where(Message.chat_id == chat_id).order_by(Message.id))
    msgs = result.scalars().all()
    base = None
    seed = None
    for m in msgs:
        c = m.content or ""
        if "![Generated image](" not in c:
            continue
        pm = re.search(r"\*\*Prompt:\*\*\s*([^\n]+)", c)
        sm = re.search(r"seed=(\d+)", c)
        if pm:
            base = pm.group(1).strip()
        if sm:
            seed = int(sm.group(1))
    return base, seed

@router.post("/generate")
async def generate_image(req: ImageRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    await check_limit(user, db, "image_gen")
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt required")
    if len(prompt) > 500:
        raise HTTPException(status_code=400, detail="Prompt too long (max 500 chars)")
    w = _clamp_dim(req.width)
    h = _clamp_dim(req.height)
    seed = abs(hash(prompt)) % 1000000
    url = _image_url(prompt, w, h, seed)
    # Persist the generated image as an assistant message so it survives reload
    # and is counted by the chat media window (content carries prompt + seed).
    if req.chat_id:
        result = await db.execute(select(Chat).where(Chat.id == req.chat_id, Chat.user_id == user.id))
        chat = result.scalar_one_or_none()
        if chat:
            msg = Message(chat_id=chat.id, role="assistant", content=f"**Prompt:** {prompt}\n\n![Generated image]({url})")
            db.add(msg)
            if chat.title == "New Chat":
                chat.title = prompt[:60]
            chat.updated_at = datetime.now(timezone.utc)
            await db.commit()
    return {"url": url, "prompt": prompt}

@router.post("/edit")
async def edit_image(req: ImageEditRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Image follow-up system: "add a bell around the cow" edits the most recent
    # generated image in this chat by merging the change into the previous prompt
    # and reusing the same seed, so the composition stays similar while the
    # change is applied. Chains: each edit persists its merged prompt, so the
    # NEXT edit builds on the previous result.
    user = await get_current_user_from_cookie(request, db)
    await check_limit(user, db, "image_gen")
    change = req.change.strip()
    if not change:
        raise HTTPException(status_code=400, detail="Change description required")
    if len(change) > 200:
        raise HTTPException(status_code=400, detail="Change too long (max 200 chars)")
    result = await db.execute(select(Chat).where(Chat.id == req.chat_id, Chat.user_id == user.id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    base, seed = await _last_generated(db, chat.id)
    if not base or seed is None:
        raise HTTPException(status_code=400, detail="No generated image in this chat to edit — generate one first")
    merged = f"{base}, {change}".strip(" ,")
    if len(merged) > 500:
        raise HTTPException(status_code=400, detail="Prompt too long after merging the change")
    w = _clamp_dim(req.width)
    h = _clamp_dim(req.height)
    url = _image_url(merged, w, h, seed)
    msg = Message(chat_id=chat.id, role="assistant", content=f"**Prompt:** {merged}\n\n**Changed:** {change}\n\n![Generated image]({url})")
    db.add(msg)
    chat.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"url": url, "prompt": merged, "base": base, "change": change}