import base64
import os
import re
import secrets
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import Chat, Message, get_db
from auth import get_current_user_from_cookie
from limits import check_limit

router = APIRouter(prefix="/api/image", tags=["image"])

OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images"

# Newest first: Nano Banana 2.1 -> Nano Banana Pro -> Nano Banana 2 -> GPT-5.4 Image 2.
# Override with IMAGE_MODELS (comma-separated) in the environment if needed.
_IMAGE_MODELS = [
    m.strip()
    for m in os.environ.get(
        "IMAGE_MODELS",
        "google/gemini-nano-banana-2.1,google/gemini-3-pro-image,google/gemini-3.1-flash-image,openai/gpt-5.4-image-2",
    ).split(",")
    if m.strip()
]


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
    """Pollinations Flux URL — free last-resort fallback."""
    encoded = urllib.parse.quote(prompt)
    return f"https://image.pollinations.ai/p/{encoded}?width={w}&height={h}&model=flux&nologo=true&enhance=true&seed={seed}"


def _aspect_ratio(w, h):
    r = w / max(h, 1)
    if r >= 1.6:
        return "16:9"
    if r >= 1.25:
        return "3:2"
    if r <= 0.63:
        return "9:16"
    if r <= 0.8:
        return "2:3"
    return "1:1"


def _resolution(w, h):
    return "2K" if max(w, h) >= 1280 else "1K"


def _image_dir() -> Path:
    """Prefer the Railway persistent volume (/data) so images survive redeploys;
    fall back to static/generated for local dev."""
    candidates = [Path("/data/generated"), Path(__file__).parent / "static" / "generated"]
    for p in candidates:
        try:
            p.mkdir(parents=True, exist_ok=True)
            probe = p / ".write_probe"
            probe.write_text("x")
            probe.unlink()
            return p
        except Exception:
            continue
    return candidates[-1]


_SERVE_NAME_RE = re.compile(r"^img_[0-9]{8,14}_[0-9a-f]{8}\.(png|jpg|webp)$")


async def _openrouter_image(prompt, w, h, ref_urls=None):
    """Generate via OpenRouter Image API (Nano Banana class). Returns (url, model)
    or (None, None) so callers can fall back to Pollinations."""
    from ai import _get_openrouter_keys
    keys = _get_openrouter_keys()
    if not keys:
        return None, None
    payload = {
        "prompt": prompt,
        "resolution": _resolution(w, h),
        "aspect_ratio": _aspect_ratio(w, h),
        "n": 1,
    }
    if ref_urls:
        payload["input_references"] = [
            {"type": "image_url", "image_url": {"url": u}} for u in ref_urls[:1]
        ]
    async with httpx.AsyncClient(timeout=180) as client:
        for model in _IMAGE_MODELS:
            for key in keys:
                try:
                    r = await client.post(
                        OPENROUTER_IMAGES_URL,
                        headers={
                            "Authorization": f"Bearer {key}",
                            "Content-Type": "application/json",
                        },
                        json={"model": model, **payload},
                    )
                    if r.status_code == 429 and len(keys) > 1:
                        continue  # key exhausted / rate-limited — rotate
                    if r.status_code != 200:
                        break  # model rejected — try next model
                    data = r.json()
                    items = data.get("data") or []
                    if not items or not items[0].get("b64_json"):
                        break
                    b64 = items[0]["b64_json"]
                    media = items[0].get("media_type", "image/png")
                    ext = "jpg" if "jpeg" in media else ("webp" if "webp" in media else "png")
                    name = f"img_{datetime.now(timezone.utc):%Y%m%d%H%M%S}_{secrets.token_hex(4)}.{ext}"
                    _image_dir().joinpath(name).write_bytes(base64.b64decode(b64))
                    return f"/api/image/serve/{name}", model
                except Exception:
                    continue  # network/decode error — next key
    return None, None


def _ref_for_edit(last_url):
    """Turn the previous image URL into something OpenRouter can consume:
    local files become data URLs; remote URLs are passed through."""
    if not last_url:
        return None
    if last_url.startswith("/api/image/serve/"):
        name = last_url.rsplit("/", 1)[-1]
        if _SERVE_NAME_RE.match(name):
            p = _image_dir() / name
            if p.is_file():
                media = "image/jpeg" if p.suffix == ".jpg" else ("image/webp" if p.suffix == ".webp" else "image/png")
                return f"data:{media};base64," + base64.b64encode(p.read_bytes()).decode()
        return None
    if last_url.startswith("http://") or last_url.startswith("https://"):
        return last_url
    return None


async def _last_generated(db: AsyncSession, chat_id: int):
    """Return (base_prompt, seed, image_url) of the most recent generated image.

    Generated images are persisted as assistant messages containing
    '![Generated image](url)'. The prompt line ('**Prompt:** ...') holds the
    base prompt so follow-up edits can chain. Pollinations URLs carry seed=;
    Nano Banana URLs do not (edits use real image-to-image instead).
    """
    result = await db.execute(select(Message).where(Message.chat_id == chat_id).order_by(Message.id))
    msgs = result.scalars().all()
    base = None
    seed = None
    url = None
    for m in msgs:
        c = m.content or ""
        um = re.search(r"!\[Generated image\]\(([^)]+)\)", c)
        if not um:
            continue
        pm = re.search(r"\*\*Prompt:\*\*\s*([^\n]+)", c)
        sm = re.search(r"seed=(\d+)", c)
        if pm:
            base = pm.group(1).strip()
        if sm:
            seed = int(sm.group(1))
        url = um.group(1)
    return base, seed, url


@router.get("/serve/{name}")
async def serve_image(name: str):
    """Stream a generated image from disk (Railway volume or static/generated)."""
    if not _SERVE_NAME_RE.match(name):
        raise HTTPException(status_code=404, detail="Not found")
    p = _image_dir() / name
    if not p.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(p)


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
    url, model = await _openrouter_image(prompt, w, h)
    if not url:
        # Free Pollinations/Flux fallback — never blocks generation.
        seed = abs(hash(prompt)) % 1000000
        url = _image_url(prompt, w, h, seed)
        model = "flux"
    # Persist the generated image as an assistant message so it survives reload
    # and is counted by the chat media window (content carries prompt).
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
    return {"url": url, "prompt": prompt, "model": model}


@router.post("/edit")
async def edit_image(req: ImageEditRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Image follow-up system: "add a bell around the cow" edits the most recent
    # generated image. Nano Banana-class models do true image-to-image editing
    # (previous image sent as input_references); the Pollinations fallback merges
    # the change into the previous prompt and reuses the same seed.
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
    base, seed, last_url = await _last_generated(db, chat.id)
    if not base:
        raise HTTPException(status_code=400, detail="No generated image in this chat to edit — generate one first")
    merged = f"{base}, {change}".strip(" ,")
    if len(merged) > 500:
        raise HTTPException(status_code=400, detail="Prompt too long after merging the change")
    w = _clamp_dim(req.width)
    h = _clamp_dim(req.height)
    ref = _ref_for_edit(last_url)
    model = None
    url = None
    if ref:
        # True image-to-image: instruct the model against the previous image.
        url, model = await _openrouter_image(f"Apply this edit to the reference image: {change}", w, h, ref_urls=[ref])
    if not url:
        if seed is None:
            seed = abs(hash(base)) % 1000000
        url = _image_url(merged, w, h, seed)
        model = "flux"
    msg = Message(chat_id=chat.id, role="assistant", content=f"**Prompt:** {merged}\n\n**Changed:** {change}\n\n![Generated image]({url})")
    db.add(msg)
    chat.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"url": url, "prompt": merged, "base": base, "change": change, "model": model}
