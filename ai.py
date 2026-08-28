import json
import os
import re
import httpx
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from database import Message, Chat, Memory, UserSettings, KnowledgeBase, KnowledgeItem, settings, async_session

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def _get_openrouter_keys() -> list[str]:
    """Return list of OpenRouter keys with rotation support."""
    # Uses Settings.get_openrouter_keys() which checks OPENROUTER_API_KEYS env (comma-separated) then fallback to singular key
    try:
        return settings.get_openrouter_keys()
    except Exception:
        raw = os.getenv("OPENROUTER_API_KEYS") or getattr(settings, "openrouter_api_keys", "") or getattr(settings, "openrouter_api_key", "") or ""
        return [k.strip() for k in raw.split(",") if k.strip()]


def _is_exhausted(status_code: int, body: str) -> bool:
    if status_code in (402, 429):
        return True
    low = body.lower()
    return "in_flight_budget" in low or "available credits" in low or "rate limit" in low

DEFAULT_SYSTEM_PROMPT = "You are Zenith, created by Wanzu Ibrahim. Answer accurately and helpfully."

DEFAULT_THINK_PROMPT = (
    "You are Zenith, created by Wanzu Ibrahim. "
    "Think step-by-step before answering. "
    "Show your reasoning process clearly, then provide your final answer."
)

RESEARCH_PROMPT = (
    "You are Zenith, a deep research assistant created by Wanzu Ibrahim. "
    "When given a research query, provide a comprehensive, well-structured analysis. "
    "Include multiple perspectives, cite web sources where available, and clearly state "
    "what is known vs what is uncertain. Structure your response with clear headings. "
    "End with a brief summary of key findings."
)

FACTCHECK_PROMPT = (
    "You are Zenith, a fact-checking assistant created by Wanzu Ibrahim. "
    "When given a claim to verify, analyze it thoroughly. For each claim: "
    "1) State whether it is TRUE, FALSE, PARTIALLY TRUE, or UNVERIFIED. "
    "2) Provide evidence and reasoning. "
    "3) Cite sources where available with clickable markdown links. "
    "Always include source URLs as markdown links [1](url) and list Sources at the end with clickable links. "
    "Be precise, neutral, and transparent about the limits of your knowledge."
)


def strip_citations(text: str) -> str:
    text = re.sub(r"\[\d+(?:,\s*\d+)*\]", "", text)
    text = re.sub(r" {2,}", " ", text)
    return text


def process_response(text: str, research: bool) -> str:
    # Always strip [1][2] during streaming -> plain text fallback.
    # Link path tries after stream; if URLs found, saved message is relinked.
    return strip_citations(text)


def convert_citations_to_links(text: str, urls: list) -> str:
    """Convert [1][2] citation numbers to clickable [1](url) links. Fallback to plain text on error."""
    if not urls:
        return strip_citations(text)
    # Normalize urls to strings (OpenRouter may return dicts)
    norm = []
    for u in urls:
        if isinstance(u, str): norm.append(u)
        elif isinstance(u, dict): norm.append(u.get("url") or u.get("link") or "")
        else: norm.append(str(u))
    urls = norm
    def replace_citation(match):
        nums = re.findall(r"\d+", match.group(0))
        parts = []
        for n in nums:
            idx = int(n) - 1
            if 0 <= idx < len(urls) and urls[idx] and urls[idx].startswith("http"):
                # Use domain as link text but keep number for clarity: [1](url)
                parts.append(f"[{n}]({urls[idx]})")
            else:
                parts.append("")
        # Join with space, then collapse -> if no valid urls, returns "" which will be stripped
        joined = " ".join(p for p in parts if p)
        return joined if joined else ""
    try:
        result = re.sub(r"\[\d+(?:,\s*\d+)*\]", replace_citation, text)
        result = re.sub(r" {2,}", " ", result)
        # If still has [N] (no valid url), strip them (plain fallback - no fake numbers)
        if re.search(r"\[\d+\]", result):
            return strip_citations(result)
        return result
    except Exception:
        return strip_citations(text)


async def build_system_prompt(user_id: int, think: bool, last_user_msg: str = "", research: bool = False, factcheck: bool = False) -> str:
    async with async_session() as db:
        from sqlalchemy import select

        result = await db.execute(
            select(UserSettings).where(UserSettings.user_id == user_id)
        )
        user_settings = result.scalar_one_or_none()

        is_guest = False
        try:
            from database import User as U2
            gres = await db.execute(select(U2.username).where(U2.id == user_id))
            guname = gres.scalar_one_or_none()
            if guname and guname.startswith("guest_"):
                is_guest = True
        except: pass

        if is_guest:
            memories = []
            kb_context = ""
        else:
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

        is_admin = False
        try:
            async with async_session() as db2:
                from database import User as UserModel2
                ures2 = await db2.execute(select(UserModel2).where(UserModel2.id == user_id))
                uobj2 = ures2.scalar_one_or_none()
                if uobj2 and getattr(uobj2, 'is_admin', False):
                    is_admin = True
        except: pass

    if is_admin:
        base = "You are Zenith, created by Wanzu Ibrahim. This user is an ADMIN of Zenith - treat them with highest priority, remember their preferences for life, and be extra helpful and detailed."
        if research:
            base = RESEARCH_PROMPT + " The user is an ADMIN - provide the highest quality research."
        elif factcheck:
            base = FACTCHECK_PROMPT
    elif factcheck:
        base = FACTCHECK_PROMPT
    elif research:
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


async def stream_chat(chat_id: int, think: bool, images: list = None, web_search: bool = False, research: bool = False, factcheck: bool = False):
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

    has_images = bool(images)

    if not has_images and (web_search or research or factcheck):
        user_model = "perplexity/sonar"

    if has_images and (research or factcheck):
        user_model = "openai/gpt-4o"

    if research or factcheck:
        user_max_tokens = 4096
        user_temperature = 0.3

    last_user_msg = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            content = m.get("content", "")
            if isinstance(content, str):
                last_user_msg = content
            break

    system_prompt = await build_system_prompt(user_id, think, last_user_msg, research, factcheck)
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

    # flags need to be accessible in the generator
    _research = research or factcheck

    async def generate():
        full_response = ""

        # True links path for web/research/factcheck (perplexity) - non-stream to get real citation URLs
        is_perplexity = user_model == "perplexity/sonar"
        if is_perplexity:
            try:
                keys = _get_openrouter_keys()
                if not keys:
                    yield f"data: {json.dumps({'error': 'Zenith is busy — too many requests at once. Please wait 10 seconds and try again.'})}\n\n"
                    return
                last_err = ""
                last_status = 0
                success = False
                for idx, _key in enumerate(keys):
                    try:
                        async with httpx.AsyncClient(timeout=120) as client:
                            r = await client.post(
                                OPENROUTER_URL,
                                headers={"Authorization": f"Bearer {_key}", "Content-Type": "application/json"},
                                json={"model": user_model, "messages": messages, "max_tokens": user_max_tokens, "temperature": user_temperature},
                            )
                            if r.status_code != 200:
                                err = r.text[:500]
                                last_err = err
                                last_status = r.status_code
                                if _is_exhausted(r.status_code, err) and idx < len(keys) - 1:
                                    continue
                                if _is_exhausted(r.status_code, err):
                                    # Try free fallback before giving up
                                    try:
                                        async with httpx.AsyncClient(timeout=60) as fb:
                                            fr = await fb.post(OPENROUTER_URL, headers={"Authorization": f"Bearer {keys[0]}", "Content-Type": "application/json"}, json={"model": "meta-llama/llama-3.1-8b-instruct:free", "messages": messages, "max_tokens": min(user_max_tokens, 1024), "temperature": 0.7})
                                            if fr.status_code == 200:
                                                fobj = fr.json()
                                                fcontent = fobj.get("choices", [{}])[0].get("message", {}).get("content", "")
                                                if fcontent:
                                                    full_response = strip_citations(fcontent) + "\n\n*— Answered via free fallback due to high traffic —*"
                                                    for i in range(0, len(full_response), 20):
                                                        yield f"data: {json.dumps({'token': full_response[i:i+20]})}\n\n"
                                                        import asyncio as _aio2
                                                        await _aio2.sleep(0.02)
                                                    async with async_session() as db2:
                                                        ai_msg2 = Message(chat_id=chat_id, role="assistant", content=full_response)
                                                        db2.add(ai_msg2)
                                                        await db2.commit()
                                                    yield "data: [DONE]\n\n"
                                                    return
                                    except: pass
                                    yield f"data: {json.dumps({'error': 'Zenith is busy — too many requests at once. Please wait 10 seconds and try again.'})}\n\n"
                                else:
                                    yield f"data: {json.dumps({'error': f'API error {r.status_code}: {err[:300]}'})}\n\n"
                                return
                            obj = r.json()
                            content = obj.get("choices", [{}])[0].get("message", {}).get("content", "")
                            citations = obj.get("citations", [])
                            if not citations:
                                citations = obj.get("choices", [{}])[0].get("message", {}).get("citations", [])
                            if citations:
                                full_response = convert_citations_to_links(content, citations)
                                # Ensure source links footer for web/research/factcheck (fact button links)
                                try:
                                    norm_urls = []
                                    for u in citations:
                                        if isinstance(u, str): norm_urls.append(u)
                                        elif isinstance(u, dict): norm_urls.append(u.get("url") or u.get("link") or "")
                                        else: norm_urls.append(str(u))
                                    if full_response and norm_urls and "Sources" not in full_response:
                                        src = "\n\n**Sources:**\n" + "\n".join(f"- [{i+1}]({url})" for i, url in enumerate(norm_urls) if url.startswith("http"))
                                        if src.strip() != "**Sources:**":
                                            full_response += src
                                except: pass
                            else:
                                full_response = strip_citations(content) if content else ""
                            chunk_size = 20
                            for i in range(0, len(full_response), chunk_size):
                                chunk = full_response[i:i+chunk_size]
                                yield f"data: {json.dumps({'token': chunk})}\n\n"
                                import asyncio as _aio
                                await _aio.sleep(0.02)
                            if full_response:
                                async with async_session() as db:
                                    ai_msg = Message(chat_id=chat_id, role="assistant", content=full_response)
                                    db.add(ai_msg)
                                    await db.commit()
                            yield "data: [DONE]\n\n"
                            success = True
                            return
                    except Exception as inner_e:
                        last_err = str(inner_e)
                        if idx < len(keys) - 1 and ("402" in last_err or "429" in last_err or "in_flight_budget" in last_err.lower() or "rate limit" in last_err.lower()):
                            continue
                        raise
                if not success and last_err:
                    if _is_exhausted(last_status, last_err):
                        yield f"data: {json.dumps({'error': 'Zenith is busy — too many requests at once. Please wait 10 seconds and try again.'})}\n\n"
                    else:
                        yield f"data: {json.dumps({'error': f'API error {last_status}: {last_err[:300]}'})}\n\n"
                    return
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                return

        # Normal streaming path (no web or has images) - with key rotation on 402/429
        keys = _get_openrouter_keys()
        if not keys:
            yield f"data: {json.dumps({'error': 'Zenith is busy — too many requests at once. Please wait 10 seconds and try again.'})}\n\n"
            return
        else:
            last_error_body = ""
            last_status = 0
            streamed = False
            for idx, _key in enumerate(keys):
                try:
                    async with httpx.AsyncClient(timeout=120) as client:
                        async with client.stream(
                            "POST",
                            OPENROUTER_URL,
                            headers={"Authorization": f"Bearer {_key}", "Content-Type": "application/json"},
                            json={"model": user_model, "messages": messages, "max_tokens": user_max_tokens, "temperature": user_temperature, "stream": True},
                        ) as resp:
                            if resp.status_code != 200:
                                error_body = ""
                                async for chunk in resp.aiter_text():
                                    error_body += chunk
                                last_error_body = error_body
                                last_status = resp.status_code
                                if _is_exhausted(resp.status_code, error_body) and idx < len(keys) - 1:
                                    continue
                                if _is_exhausted(resp.status_code, error_body):
                                    # Free fallback
                                    try:
                                        async with httpx.AsyncClient(timeout=60) as fb:
                                            fr = await fb.post(OPENROUTER_URL, headers={"Authorization": f"Bearer {keys[0]}", "Content-Type": "application/json"}, json={"model": "meta-llama/llama-3.1-8b-instruct:free", "messages": messages, "max_tokens": min(user_max_tokens, 1024), "temperature": 0.7})
                                            if fr.status_code == 200:
                                                fobj = fr.json()
                                                fcontent = fobj.get("choices", [{}])[0].get("message", {}).get("content", "")
                                                if fcontent:
                                                    fcontent = strip_citations(fcontent) + "\n\n*— Answered via free fallback due to high traffic —*"
                                                    for i in range(0, len(fcontent), 20):
                                                        yield f"data: {json.dumps({'token': fcontent[i:i+20]})}\n\n"
                                                        import asyncio as _aio3
                                                        await _aio3.sleep(0.02)
                                                    full_response = fcontent
                                                    async with async_session() as db3:
                                                        am = Message(chat_id=chat_id, role="assistant", content=full_response)
                                                        db3.add(am)
                                                        await db3.commit()
                                                    yield "data: [DONE]\n\n"
                                                    return
                                    except: pass
                                    yield f"data: {json.dumps({'error': 'Zenith is busy — too many requests at once. Please wait 10 seconds and try again.'})}\n\n"
                                else:
                                    yield f"data: {json.dumps({'error': f'API error {resp.status_code}: {error_body[:300]}'})}\n\n"
                                return
                            # success - stream tokens
                            streamed = True
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
                            break  # streamed successfully, exit key loop
                except httpx.TimeoutException:
                    yield f"data: {json.dumps({'error': 'Request timed out'})}\n\n"
                    return
                except Exception as e:
                    last_error_body = str(e)
                    if idx < len(keys) - 1 and _is_exhausted(0, last_error_body):
                        continue
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
                    return
            else:
                # loop exhausted without break (no key succeeded) but not returned above - fallback
                if not streamed and last_error_body:
                    if _is_exhausted(last_status, last_error_body):
                        yield f"data: {json.dumps({'error': 'Zenith is busy — too many requests at once. Please wait 10 seconds and try again.'})}\n\n"
                    else:
                        yield f"data: {json.dumps({'error': f'API error {last_status}: {last_error_body[:300]}'})}\n\n"
                    return

        if full_response:
            full_response = strip_citations(full_response)
            async with async_session() as db:
                ai_msg = Message(chat_id=chat_id, role="assistant", content=full_response)
                db.add(ai_msg)
                await db.commit()

        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
