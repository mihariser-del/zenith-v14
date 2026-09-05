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

@router.post("/generate")
async def generate_image(req: ImageRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    await check_limit(user, db, "image_gen")
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt required")
    if len(prompt) > 500:
        raise HTTPException(status_code=400, detail="Prompt too long (max 500 chars)")
    encoded = urllib.parse.quote(prompt)
    w = max(512, min(req.width, 1536))
    h = max(512, min(req.height, 1536))
    seed = abs(hash(prompt)) % 1000000
    url = f"https://image.pollinations.ai/p/{encoded}?width={w}&height={h}&model=flux&nologo=true&enhance=true&seed={seed}"
    # Persist the generated image as an assistant message so it survives reload
    # and is counted by the chat media window.
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
