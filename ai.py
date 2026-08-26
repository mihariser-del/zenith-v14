import json
import re
import httpx
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from database import Message, Chat, Memory, UserSettings, KnowledgeBase, KnowledgeItem, settings, async_session

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

DEFAULT_SYSTEM_PROMPT = "You are Zenith, created by Wanzu Ibrahim. Answer accurately and helpfully. Remove any [1][2] citation markers from your text."

DEFAULT_THINK_PROMPT = (
    "You are Zenith, created by Wanzu Ibrahim. "
    "Think step-by-step before answering. "
    "Show your reasoning process clearly, then provide your final answer. "
    "Remove any [1][2] citation markers from your text."
)

RESEARCH_PROMPT = (
    "You are Zenith, a deep research assistant created by Wanzu Ibrahim. "
    "When given a research query, provide a comprehensive, well-structured analysis. "
    "Include multiple perspectives, cite web sources where available, and clearly state "
    "what is known vs what is uncertain. Structure your response with clear headings. "
    "End with a brief summary of key findings."
)


def strip_citations(text: str) -> str:
    return re.sub(r"\[\d+(?:,\s*\d+)*\]", "", text)


def process_response(text: str, research: bool) -> str:
    if research:
        text = re.sub(r"\[\d+\]", lambda m: m.group(0), text)
    else:
        text = strip_citations(text)
    return text


async def build_system_prompt(user_id: int, think: bool, last_user_msg: str = "", research: bool = False) -> str:
    async with async_session() as db:
        from sqlalchemy import select

        result = await db.execute(
            select(UserSettings).where(UserSettings.user_id == user_id)
        )
        user_settings = result.scalar_one_or_none()

        memory_result = await db.execute(
            select(Memory).where(Memory.user_id == user_id).order_by(Memory.updated_at.desc()).limit(30)
        )
        memories = memory_result.scalars().all()

        kb_context = ""
        if last_user_msg:
            kb_result = await db.execute(
                select(KnowledgeBase.id).where(KnowledgeBase.user_id == user_id)
            )
            kb_ids = [row[0] for row in kb_result.all()]
            if kb_ids:
                query = f"%{last_user_msg[:100].lower()}%"
                item_result = await db.execute(
                    select(KnowledgeItem).where(
                        KnowledgeItem.kb_id.in_(kb_ids),
                        KnowledgeItem.content.ilike(query)
                    ).limit(10)
                )
                kb_items = item_result.scalars().all()
                if kb_items:
                    kb_context = "\n\nRelevant knowledge base content:\n" + "\n---\n".join(
                        f"[{i.source or 'KB'}]: {i.content[:500]}" for i in kb_items
                    )

    if research:
        base = RESEARCH_PROMPT
    elif user_settings and user_settings.system_prompt:
        base = user_settings.system_prompt
    elif think:
        base = DEFAULT_THINK_PROMPT
    else:
        base = DEFAULT_SYSTEM_PROMPT

    if think and "think step-by-step" not in base.lower() and not research:
        base += "\nThink step-by-step before answering. Show your reasoning process clearly, then provide your final answer."

    parts = [base]
    if memories:
        memory_text = "\n".join(f"- {m.content}" for m in memories)
        parts.append(f"Things you remember about this user:\n{memory_text}")
    if kb_context:
        parts.append(kb_context)

    return "\n\n".join(parts)


async def stream_chat(chat_id: int, think: bool, images: list = None, web_search: bool = False, research: bool = False):
    user_id = None
    messages = []
    user_model = "openai/gpt-4o-mini"
    user_max_tokens = 2048
    user_temperature = 0.7

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

        settings_result = await db.execute(
            select(UserSettings).where(UserSettings.user_id == user_id)
        )
        user_settings_obj = settings_result.scalar_one_or_none()
        if user_settings_obj:
            user_model = user_settings_obj.model
            user_max_tokens = user_settings_obj.max_tokens
            user_temperature = user_settings_obj.temperature

    if web_search or research:
        user_model = "perplexity/sonar"

    if research:
        user_max_tokens = 4096
        user_temperature = 0.3

    last_user_msg = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            content = m.get("content", "")
            if isinstance(content, str):
                last_user_msg = content
            break

    system_prompt = await build_system_prompt(user_id, think, last_user_msg, research)
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

    # research flag needs to be accessible in the generator
    _research = research

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
                        "model": user_model,
                        "messages": messages,
                        "max_tokens": user_max_tokens,
                        "temperature": user_temperature,
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
                                token = process_response(delta["content"], _research)
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
