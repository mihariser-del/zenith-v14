from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import UserSettings, User, get_db
from auth import get_current_user_from_cookie

router = APIRouter(prefix="/api/settings", tags=["settings"])


PERSONALITY_PRESETS = {
    "default": "You are Zelpophai AI, created by Wanzu Ibrahim. Answer accurately and helpfully. Remove any [1][2] citation markers from your text.",
    "creative": "You are Zelpophai AI, a highly creative and imaginative AI. Use metaphors, vivid language, and think outside the box. Be playful but insightful.",
    "professional": "You are Zelpophai AI, a professional business assistant. Be concise, formal, and action-oriented. Focus on practical solutions and clear communication.",
    "scholarly": "You are Zelpophai AI, an academic research assistant. Cite sources when possible, be precise with terminology, and provide thorough explanations.",
    "casual": "You are Zelpophai AI, a friendly and laid-back AI. Use conversational language, keep things light, but still be helpful and accurate.",
    "coder": "You are Zelpophai AI, an expert programmer. Always provide clean, well-structured code with brief explanations. Prefer best practices and modern patterns.",
}

PRESET_MODELS = [
    {"id": "openai/gpt-6-luna", "name": "GPT-6 Luna (Fast)", "provider": "OpenAI"},
    {"id": "openai/gpt-6-sol", "name": "GPT-6 Sol", "provider": "OpenAI"},
    {"id": "openai/gpt-6-astra", "name": "GPT-6 Astra (Flagship)", "provider": "OpenAI"},
    {"id": "google/gemini-3.8-flash", "name": "Gemini 3.8 Flash", "provider": "Google"},
    {"id": "anthropic/claude-opus-5.5", "name": "Claude Opus 5.5", "provider": "Anthropic"},
    {"id": "deepseek/deepseek-v4.1-flash", "name": "DeepSeek V4.1 Flash", "provider": "DeepSeek"},
    {"id": "z-ai/glm-5.3-flash", "name": "GLM 5.3 Flash", "provider": "Z.ai"},
    {"id": "xiaomi/mimo-v2.6-flash", "name": "MiMo V2.6 Flash", "provider": "Xiaomi"},
    {"id": "moonshotai/kimi-k3", "name": "Kimi K3", "provider": "Moonshot"},
    {"id": "nvidia/nemotron-3-ultra-550b-a55b:free", "name": "Nemotron 3 Ultra (Free)", "provider": "NVIDIA"},
    {"id": "perplexity/sonar", "name": "Perplexity Sonar (Web)", "provider": "Perplexity"},
    {"id": "openai/gpt-5.4", "name": "GPT-5.4", "provider": "OpenAI"},
]


class SettingsResponse(BaseModel):
    system_prompt: str
    personality: str
    model: str
    max_tokens: int
    temperature: float
    memory_enabled: bool
    display_name: str = ""

    model_config = {"from_attributes": True}


class UpdateSettingsRequest(BaseModel):
    system_prompt: str | None = None
    personality: str | None = None
    model: str | None = None
    max_tokens: int | None = None
    temperature: float | None = None
    memory_enabled: bool | None = None
    display_name: str | None = None


async def get_user_settings(user_id: int, db: AsyncSession) -> UserSettings:
    result = await db.execute(select(UserSettings).where(UserSettings.user_id == user_id))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = UserSettings(user_id=user_id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


@router.get("")
async def get_settings(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    s = await get_user_settings(user.id, db)
    return {"settings": SettingsResponse.model_validate(s), "presets": PERSONALITY_PRESETS, "models": PRESET_MODELS}


@router.patch("")
async def update_settings(req: UpdateSettingsRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    s = await get_user_settings(user.id, db)
    update_data = req.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(s, k, v)
    # Keep the profile display name (surfaced by /api/auth/me) in sync with settings
    if "display_name" in update_data:
        user.display_name = (update_data["display_name"] or "").strip()
    await db.commit()
    await db.refresh(s)
    return {"settings": SettingsResponse.model_validate(s)}
