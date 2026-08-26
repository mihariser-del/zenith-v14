import urllib.parse
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from auth import get_current_user_from_cookie

router = APIRouter(prefix="/api/image", tags=["image"])

class ImageRequest(BaseModel):
    prompt: str
    width: int = 1024
    height: int = 1024

@router.post("/generate")
async def generate_image(req: ImageRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
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
    return {"url": url, "prompt": prompt}
