from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import UserSettings, get_db
from auth import get_current_user_from_cookie

router = APIRouter(prefix="/api/settings", tags=["settings"])


PERSONALITY_PRESETS = {
    "default": "You are Zenith, created by Wanzu Ibrahim. Answer accurately and helpfully. Remove any [1][2] citation markers from your text.",
    "creative": "You are Zenith, a highly creative and imaginative AI. Use metaphors, vivid language, and think outside the box. Be playful but insightful.",
    "professional": "You are Zenith, a professional business assistant. Be concise, formal, and action-oriented. Focus on practical solutions and clear communication.",
    "scholarly": "You are Zenith, an academic research assistant. Cite sources when possible, be precise with terminology, and provide thorough explanations.",
    "casual": "You are Zenith, a friendly and laid-back AI. Use conversational language, keep things light, but still be helpful and accurate.",
    "coder": "You are Zenith, an expert programmer. Always provide clean, well-structured code with brief explanations. Prefer best practices and modern patterns.",
}

PRESET_MODELS = [
    {"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini", "provider": "OpenAI"},
    {"id": "openai/gpt-4o", "name": "GPT-4o", "provider": "OpenAI"},
    {"id": "anthropic/claude-3.5-sonnet", "name": "Claude 3.5 Sonnet", "provider": "Anthropic"},
    {"id": "anthropic/claude-4-sonnet", "name": "Claude 4 Sonnet", "provider": "Anthropic"},
    {"id": "google/gemini-flash-1.5", "name": "Gemini Flash 1.5", "provider": "Google"},
    {"id": "google/gemini-2.0-flash-001", "name": "Gemini 2.0 Flash", "provider": "Google"},
    {"id": "perplexity/sonar", "name": "Perplexity Sonar (Web)", "provider": "Perplexity"},
    {"id": "meta-llama/llama-3.1-8b-instruct:free", "name": "Llama 3.1 8B (Free)", "provider": "Meta"},
    {"id": "deepseek/deepseek-chat", "name": "DeepSeek Chat", "provider": "DeepSeek"},
]


class SettingsResponse(BaseModel):
    system_prompt: str
    personality: str
    model: str
    max_tokens: int
    temperature: float
    memory_enabled: bool

    model_config = {"from_attributes": True}


class UpdateSettingsRequest(BaseModel):
    system_prompt: str | None = None
    personality: str | None = None
    model: str | None = None
    max_tokens: int | None = None
    temperature: float | None = None
    memory_enabled: bool | None = None


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
    await db.commit()
    await db.refresh(s)
    return {"settings": SettingsResponse.model_validate(s)}
