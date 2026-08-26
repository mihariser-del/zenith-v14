import json
import re
import httpx
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from database import Message, Chat, Memory, settings, async_session

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

DEFAULT_SYSTEM_PROMPT = "You are Zenith, created by Wanzu Ibrahim. Answer accurately and helpfully. Remove any [1][2] citation markers from your text."

DEFAULT_THINK_PROMPT = (
    "You are Zenith, created by Wanzu Ibrahim. "
    "Think step-by-step before answering. "
    "Show your reasoning process clearly, then provide your final answer. "
    "Remove any [1][2] citation markers from your text."
)


def strip_citations(text: str) -> str:
    return re.sub(r"\[\d+(?:,\s*\d+)*\]", "", text)


async def build_system_prompt(user_id: int, think: bool) -> str:
    async with async_session() as db:
        from sqlalchemy import select
        result = await db.execute(
            select(Memory).where(Memory.user_id == user_id).order_by(Memory.updated_at.desc()).limit(30)
        )
        memories = result.scalars().all()

    base = DEFAULT_THINK_PROMPT if think else DEFAULT_SYSTEM_PROMPT

    if memories:
        memory_text = "\n".join(f"- {m.content}" for m in memories)
        return f"{base}\n\nThings you remember about this user:\n{memory_text}"

    return base


async def stream_chat(chat_id: int, think: bool, images: list = None):
    user_id = None
    messages = []

    async with async_session() as db:
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        result = await db.execute(
            select(Chat).where(Chat.id == chat_id).options(selectinload(Chat.messages), selectinload(Chat.user))
        )
        chat = result.scalar_one_or_none()
        if not chat:
            async def error_gen():
                yield f"data: {json.dumps({'error': 'Chat not found'})}\n\n"
            return StreamingResponse(error_gen(), media_type="text/event-stream")

        user_id = chat.user_id
        for msg in chat.messages:
            messages.append({"role": msg.role, "content": msg.content})

    system_prompt = await build_system_prompt(user_id, think)
    messages.insert(0, {"role": "system", "content": system_prompt})

    if images and messages:
        last_user = messages[-1]
        content_parts = []
        if last_user["content"] and last_user["content"] != "(image)":
            content_parts.append({"type": "text", "text": last_user["content"]})
        for img in images:
            content_parts.append({
                "type": "image_url",
                "image_url": {"url": img}
            })
        if content_parts:
            last_user["content"] = content_parts

    async def generate():
        full_response = ""
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream(
                    "POST",
                    OPENROUTER_URL,
                    headers={
                        "Authorization": f"Bearer {settings.openrouter_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "openai/gpt-4o-mini",
                        "messages": messages,
                        "max_tokens": 2048,
                        "temperature": 0.7,
                        "stream": True,
                    },
                ) as resp:
                    if resp.status_code != 200:
                        error_body = ""
                        async for chunk in resp.aiter_text():
                            error_body += chunk
                        yield f"data: {json.dumps({'error': f'API error {resp.status_code}: {error_body[:300]}'})}\n\n"
                        return

                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data.strip() == "[DONE]":
                            break
                        try:
                            obj = json.loads(data)
                            delta = obj.get("choices", [{}])[0].get("delta", {})
                            if "content" in delta and delta["content"]:
                                token = strip_citations(delta["content"])
                                full_response += token
                                yield f"data: {json.dumps({'token': token})}\n\n"
                        except json.JSONDecodeError:
                            continue

        except httpx.TimeoutException:
            yield f"data: {json.dumps({'error': 'Request timed out'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

        if full_response:
            async with async_session() as db:
                ai_msg = Message(chat_id=chat_id, role="assistant", content=full_response)
                db.add(ai_msg)
                await db.commit()

        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
