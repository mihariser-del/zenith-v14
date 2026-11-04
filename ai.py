import json
import os
import re
import httpx
from datetime import datetime, timezone, timedelta
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from database import Message, Chat, Memory, UserSettings, KnowledgeBase, KnowledgeItem, settings, async_session

OPENROUTER_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/") + "/chat/completions"
from docgen import looks_like_file_request


def _get_openrouter_keys() -> list[str]:
    """Return list of OpenRouter keys with rotation support."""
    # Uses Settings.get_openrouter_keys() which checks OPENROUTER_API_KEYS env (comma-separated) then fallback to singular key
    try:
        keys = settings.get_openrouter_keys()
    except Exception:
        raw = os.getenv("OPENROUTER_API_KEYS") or getattr(settings, "openrouter_api_keys", "") or getattr(settings, "openrouter_api_key", "") or ""
        keys = [k.strip() for k in raw.split(",") if k.strip()]
    return keys


def _is_exhausted(status_code: int, body: str) -> bool:
    if status_code in (402, 429):
        return True
    low = body.lower()
    return "in_flight_budget" in low or "available credits" in low or "rate limit" in low

DEFAULT_SYSTEM_PROMPT = "You are Zelpophai AI, created by Wanzu Ibrahim. Answer accurately and helpfully."

# File generation: the AI puts each file inside a <zfile> tag; the server turns
# every tag into a real stored file (docgen.py) and the chat shows a file card
# with Download / Preview. The tag stays in the saved message so the AI can see
# the file's content later and make edits ("make it shorter").
FILE_GEN_PROMPT = (
    "FILES: You can create real downloadable files (Word .docx, PDF, PowerPoint .pptx, "
    "Excel .xlsx, .csv, .html web pages, .md, .txt and code files like .py/.js/.json). "
    "Whenever the user asks you to create, write, make, convert or update a file, document, "
    "CV/resume, cover letter, report, essay, letter, invoice, slides/presentation, spreadsheet, "
    "budget, table, web page or code file to download, put the COMPLETE file inside ONE tag:\n"
    "<zfile name=\"Short-Descriptive-Name.ext\">\n...full content...\n</zfile>\n"
    "Rules: 1) Pick the extension the user asked for; if they didn't say: documents, letters, CVs and "
    "reports = .docx, slides = .pptx, tables/budgets/trackers = .xlsx, web pages = .html. "
    "2) Inside the tag write clean Markdown (for .html write the full HTML page with inline CSS; for code "
    "files write only the code, no fences). 3) Write the whole thing - never placeholders like '[add more here]' "
    "or 'etc.', never cut it short. Fill realistic details; use [Your Name]-style blanks only for the user's "
    "personal facts you don't know. 4) Outside the tag write at most one short sentence before it and one "
    "after it (e.g. what you made, and an offer to adjust). Do NOT repeat the content outside the tag. "
    "5) Never say you can't create files. 6) Don't wrap the tag in a code block. "
    "Format tips - Slides (.pptx): '# Deck title', a one-line subtitle, then one '## Slide title' per slide "
    "with 3-6 short bullets; '### ' sub-headings inside a slide become 2-3 columns; a line starting "
    "'Notes:' becomes speaker notes; end with '## Thank you'. Spreadsheets (.xlsx/.csv): one Markdown table per "
    "sheet, a '## Sheet name' heading above each, plain numbers (1200, 12%, $5.50) and Excel formulas like "
    "=SUM(B2:B9) where totals help. Documents: '# Title', '## Sections', lists, tables, and callouts like "
    "'> [!TIP] ...' or '> [!WARNING] ...' where useful. When the user asks to change a file you made, send "
    "the full updated file in a new tag with the same name."
)

# Grounding: the model has no live knowledge. Give it today's date and tell it
# not to invent current facts when no web results were provided.
HONESTY_PROMPT = (
    "TODAY is {today} (UTC). Your built-in knowledge stops at your training date and you can't see the "
    "internet unless web results are included in this conversation. For anything that changes over time "
    "(news, 'this week', prices, exchange rates, scores, who currently holds a job or office, latest versions, "
    "release dates, weather) and NO web results are provided: say plainly that you can't check live "
    "information right now, give what you knew as of your training (clearly labelled as possibly out of "
    "date), and suggest turning on Web search. Never invent dates, numbers, quotes, events, people, links "
    "or sources. If you're not sure, say so."
)

DEFAULT_THINK_PROMPT = (
    "You are Zelpophai AI, created by Wanzu Ibrahim. "
    "Think step-by-step before answering. "
    "Show your reasoning process clearly, then provide your final answer."
)

RESEARCH_PROMPT = (
    "You are Zelpophai AI, a deep research assistant created by Wanzu Ibrahim. "
    "When given a research query, provide a comprehensive, well-structured analysis. "
    "Include multiple perspectives, cite web sources where available, and clearly state "
    "what is known vs what is uncertain. Structure your response with clear headings. "
    "End with a brief summary of key findings."
)

FACTCHECK_PROMPT = (
    "You are Zelpophai AI, a fact-checking assistant created by Wanzu Ibrahim. "
    "When given a claim to verify, analyze it thoroughly. For each claim: "
    "1) State whether it is TRUE, FALSE, PARTIALLY TRUE, or UNVERIFIED. "
    "2) Provide evidence and reasoning. "
    "3) Cite sources where available with clickable markdown links. "
    "Always include source URLs as markdown links [1](url) and list Sources at the end with clickable links. "
    "Be precise, neutral, and transparent about the limits of your knowledge."
)


_CITE_RE = re.compile(r"(?<![\w\]\[(])[ \t]?\[\d+(?:,\s*\d+)*\](?!\()")


def strip_citations(text: str) -> str:
    """Remove web-search markers like "[1]" or "[2, 3]" from prose.

    The old version also removed every "[0]" (so `arr[0]` in code became
    `arr`) and squashed all runs of spaces, which wrecked code indentation.
    Now code blocks and inline code are left alone, an index straight after a
    word (arr[0]) is never touched, and spacing is preserved."""
    if not text or "[" not in text:
        return text
    parts = re.split(r"(```[\s\S]*?(?:```|$)|`[^`\n]*`)", text)
    for i in range(0, len(parts), 2):
        parts[i] = _CITE_RE.sub("", parts[i])
    return "".join(parts)


def process_response(text: str, research: bool) -> str:
    # Tokens from normal (non-web) models never carry citation markers, and a
    # single token can't tell whether it's inside code — so leave them as-is.
    return text


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

        # Personality Mirror: if this user has mirror mode on and an analyzed
        # profile, tell the model to match how THEY write (tone, wording, vibe).
        mirror_text = ""
        try:
            from database import User as UM
            from sqlalchemy import select as _sel
            from json import loads as _jloads
            ures = await db.execute(_sel(UM).where(UM.id == user_id))
            urow = ures.scalar_one_or_none()
            if urow and getattr(urow, "personality_enabled", False):
                _p = getattr(urow, "personality_profile", "") or ""
                if _p:
                    try:
                        prof = _jloads(_p)
                        mirror_text = (
                            f"Mirror the user's communication style: tone \"{prof.get('tone', '')}\", "
                            f"formality \"{prof.get('formality', '')}\", energy \"{prof.get('energy', '')}\", "
                            f"humor \"{prof.get('humor', '')}\", emoji usage \"{prof.get('emoji_use', '')}\", "
                            f"detail level \"{prof.get('detail_level', '')}\". Style summary: {prof.get('style_summary', '')}. "
                            "Match their vocabulary, sentence length, energy and vibe in your replies while staying accurate and helpful."
                        )
                    except Exception:
                        mirror_text = f"Mirror the user's communication style (match their tone, wording and vibe): {_p}"
        except Exception:
            mirror_text = ""

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
        is_owner = False
        try:
            async with async_session() as db2:
                from database import User as UserModel2
                ures2 = await db2.execute(select(UserModel2).where(UserModel2.id == user_id))
                uobj2 = ures2.scalar_one_or_none()
                if uobj2:
                    _role = getattr(uobj2, 'role', '') or ''
                    if _role == 'owner':
                        is_owner = True
                        is_admin = True
                    elif getattr(uobj2, 'is_admin', False):
                        is_admin = True
        except: pass

    if is_owner:
        base = "You are Zelpophai AI, created by Wanzu Ibrahim. This user is THE OWNER and supreme creator of Zelpophai AI - treat them with absolute highest priority, they have no restrictions, remember everything about them for life, and always be at their service with maximum detail and brilliance."
        if research:
            base = RESEARCH_PROMPT + " The user is THE OWNER of Zelpophai AI - deliver the most elite quality research."
        elif factcheck:
            base = FACTCHECK_PROMPT
    elif is_admin:
        base = "You are Zelpophai AI, created by Wanzu Ibrahim. This user is an ADMIN of Zelpophai AI - treat them with highest priority, remember their preferences for life, and be extra helpful and detailed."
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

    base += "\n" + FILE_GEN_PROMPT
    if not (research or factcheck):
        base += "\n" + HONESTY_PROMPT.format(today=datetime.now(timezone.utc).strftime("%A, %d %B %Y"))

    parts = [base]
    if memories:
        memory_text = "\n".join(f"- {m.content}" for m in memories)
        parts.append(f"Things you remember about this user:\n{memory_text}")
    if kb_context:
        parts.append(kb_context)
    if mirror_text:
        parts.append(mirror_text)

    # Self-awareness: give Zelpophai AI live knowledge of the platform it runs on,
    # so when users ask "how many users are on here?", "how many admins?", "who made
    # you?" etc. it can answer from its own context instead of guessing.
    try:
        async with async_session() as sap:
            from sqlalchemy import func as _sf, text as _stext
            from database import User as _U, Chat as _C, Message as _M
            _u = (await sap.execute(_sf(_sf.count()).select_from(_U).where(_U.is_deleted == False))).scalar() or 0
            _admin = (await sap.execute(_sf(_sf.count()).select_from(_U).where(_U.role == "admin", _U.is_deleted == False))).scalar() or 0
            _owner = (await sap.execute(_sf(_sf.count()).select_from(_U).where(_U.role == "owner", _U.is_deleted == False))).scalar() or 0
            _chats = (await sap.execute(_sf(_sf.count()).select_from(_C))).scalar() or 0
            _msgs = (await sap.execute(_sf(_sf.count()).select_from(_M))).scalar() or 0
            try:
                _online = (await sap.execute(_sf(_sf.count()).select_from(_U).where(_U.last_seen >= datetime.now(timezone.utc) - timedelta(minutes=2), _U.is_deleted == False))).scalar() or 0
            except Exception:
                _online = 0
            try:
                _row = (await sap.execute(_stext("SELECT value FROM system_settings WHERE key='registrations'"))).first()
                _regs = (_row[0] if _row else "on")
            except Exception:
                _regs = "on"
        sap_text = (
            f"PLATFORM AWARENESS (live data, use these numbers if asked about the platform):\n"
            f"- Platform name: Zelpophai AI; creator/Owner: WANZU-IBRAHIM; you are the AI behind it.\n"
            f"- Registered accounts (not deleted): {_u}. Owners: {_owner}. Staff admins: {_admin}.\n"
            f"- Total chats: {_chats}. Total messages: {_msgs}. Users online right now: ~{_online}.\n"
            f"- New registrations: {'OPEN' if _regs == 'on' else 'CLOSED'}.\n"
            f"- When asked about user counts, admins, online users or platform stats, answer from these numbers."
        )
        parts.append(sap_text)
    except Exception:
        pass

    return "\n\n".join(parts)


# Auto web search: questions that need live/current data are routed to
# Perplexity Sonar automatically — no toggle needed. Heuristic covers news,
# weather, prices, scores, "latest/current/today", who-is/won questions,
# and explicit recent years.
_LIVE_DATA_RE = re.compile(
    r"\b("
    r"latest|newest|up[- ]to[- ]date|recent(?:ly)?|current(?:ly)?|"
    r"today|tonight|tomorrow|yesterday|right now|as of|breaking|live(?!ly)|"
    r"news|weather|forecast|update[sd]?|"
    r"stock(?:s| price)?|price[sd]?|exchange rate|currency|inflation|gdp|"
    r"bitcoin|crypto|btc|eth|"
    r"score[sd]?|match(?:es| result)?|election|poll(?:s|ing)?|"
    r"who (?:won|is|are|will be)|what(?:'s| is) (?:new|happening|trending)|"
    r"this (?:year|month|week|hour)|last (?:night|week|month|year)|"
    r"next (?:week|month|year)|"
    r"20(?:2[4-9]|[3-9]\d)"
    r")",
    re.IGNORECASE,
)


def _needs_live_data(text: str) -> bool:
    """True when the message likely needs current/live information."""
    if not text:
        return False
    return bool(_LIVE_DATA_RE.search(text[:500]))


def _sse(obj):
    return f"data: {json.dumps(obj)}\n\n"


async def _after_reply(chat_id, user_id, user_text):
    """Turn <zfile> blocks in the reply just saved into real stored files.

    Also catches the case where the user asked for a file but the model forgot
    the tag: the reply (minus a chatty first/last line) becomes the file.
    Yields one SSE event: {"files": [...], "content": updated message} or
    {"file_error": "..."} when the user's file allowance is used up."""
    import docgen
    from fastapi import HTTPException as _HTTPExc
    from sqlalchemy import select as _sel
    from database import User as _User
    from generate import store_file
    from limits import check_limit

    async with async_session() as db:
        msg = (await db.execute(
            _sel(Message).where(Message.chat_id == chat_id, Message.role == "assistant").order_by(Message.id.desc()).limit(1)
        )).scalar_one_or_none()
        if not msg or not msg.content:
            return
        text = docgen._strip_outer_fence_markers(msg.content)
        blocks = docgen.extract_files(text)
        if not blocks:
            if "<zfile" in text.lower() or len(text) < 250 or not looks_like_file_request(user_text):
                return
            intro, body, name, fmt, outro = docgen.wrap_untagged(text, user_text)
            if len(body) < 200:
                return
            text = "\n\n".join(x for x in (intro, f'<zfile name="{name}">\n{body}\n</zfile>', outro) if x)
            blocks = docgen.extract_files(text)
        todo = [b for b in blocks if not b["attrs"].get("id") and b["body"].strip()]
        if not todo:
            return
        user = await db.get(_User, user_id)
        if not user:
            return
        try:
            await check_limit(user, db, "file_tool")
        except _HTTPExc as e:
            yield _sse({"file_error": str(e.detail)})
            return
        files = []
        new_text = text
        for b in reversed(blocks):
            if b not in todo:
                continue
            try:
                row, size, info = await store_file(db, user_id, b["body"], b["name"], b["fmt"])
            except Exception as e:
                print(f"[files] render failed for {b['name']}: {type(e).__name__}: {e}")
                files.insert(0, {"name": b["name"], "error": "Couldn't build this file. Ask me to try again."})
                continue
            tag = docgen.build_tag(row.id, b["name"], size, b["body"], b["attrs"].get("title", ""))
            new_text = new_text[:b["span"][0]] + tag + new_text[b["span"][1]:]
            files.insert(0, {
                "id": row.id, "name": b["name"], "format": b["fmt"], "size": size, "stats": info,
                "label": docgen.format_label(b["fmt"]), "url": f"/api/files/{row.id}/download",
                "preview": f"/api/generate/preview/{row.id}", "truncated": not b["closed"],
            })
        msg.content = new_text
        await db.commit()
        yield _sse({"files": files, "content": new_text, "message_id": msg.id})


def _provisional_title(text):
    """Quick title from the first message, used until the AI names the chat."""
    t = (text or "").split("[File content:")[0].split("[File:")[0]
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"^(hi|hello|hey)[,!. ]+", "", t, flags=re.I)
    if not t:
        return ""
    first = re.split(r"(?<=[.?!])\s", t)[0]
    if len(first) > 52:
        first = first[:52].rsplit(" ", 1)[0] + "\u2026"
    return first[:1].upper() + first[1:]


async def _auto_title(chat_id, user_text):
    """After the first reply in a chat, ask a small model for a 2-6 word title."""
    from sqlalchemy import select as _sel, func as _f
    async with async_session() as db:
        chat = await db.get(Chat, chat_id)
        if not chat:
            return
        n_user = (await db.execute(_sel(_f.count()).select_from(Message).where(Message.chat_id == chat_id, Message.role == "user"))).scalar() or 0
        if n_user != 1:
            return
        cur = (chat.title or "").strip()
        auto_ok = cur.startswith("New Chat") or cur == _provisional_title(user_text) or cur == (user_text or "")[:80]
        if not auto_ok:
            return
        reply = (await db.execute(
            _sel(Message.content).where(Message.chat_id == chat_id, Message.role == "assistant").order_by(Message.id.desc()).limit(1)
        )).scalar() or ""
    reply = re.sub(r"<zfile\b[^>]*name=\"([^\"]+)\"[^>]*>.*?(</zfile>|$)", r"[file \1]", reply, flags=re.S)
    keys = _get_openrouter_keys()
    title = ""
    if keys and (user_text or "").strip():
        prompt = (
            "Give this conversation a short title of 2 to 6 words, like a chat app would. "
            "Use the user's language. No quotes, no emoji, no full stop at the end. Reply with the title only.\n\n"
            f"User: {(user_text or '')[:600]}\nAssistant: {reply[:500]}"
        )
        for key in keys[:2]:
            try:
                async with httpx.AsyncClient(timeout=12) as client:
                    r = await client.post(OPENROUTER_URL, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                                          json={"model": os.getenv("TITLE_MODEL", "openai/gpt-6-luna"),
                                                "messages": [{"role": "user", "content": prompt}],
                                                "max_tokens": 24, "temperature": 0.3})
                if r.status_code == 200:
                    title = (r.json().get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
                    break
            except Exception:
                continue
    title = re.sub(r"^(title\s*:\s*)", "", title, flags=re.I).strip().strip("\"'`*#").strip()
    title = re.sub(r"[.\s]+$", "", title).split("\n")[0][:60]
    if not title or len(title) < 2:
        title = _provisional_title(user_text)
    if not title:
        return
    async with async_session() as db:
        chat = await db.get(Chat, chat_id)
        if not chat:
            return
        chat.title = title
        await db.commit()
    yield _sse({"title": title, "chat_id": chat_id})


async def stream_chat(chat_id: int, think: bool, images: list = None, web_search: bool = False, research: bool = False, factcheck: bool = False):
    user_id = None
    messages = []
    user_model = "openai/gpt-6-luna"
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
        # Per-chat model override (set from the chat header selector)
        if chat.model:
            user_model = chat.model

    has_images = bool(images)

    last_user_msg = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            content = m.get("content", "")
            if isinstance(content, str):
                last_user_msg = content
            break

    # Auto web search: live-data questions (news, prices, scores, "latest"...)
    # are routed to Sonar without any toggle. Explicit web/research/factcheck
    # flags still force it.
    _user_ask = last_user_msg.split("[File content:")[0].split("[File:")[0]
    _wants_file = looks_like_file_request(_user_ask)
    auto_web = (not has_images) and _needs_live_data(_user_ask) and not (
        _wants_file and "[File" in last_user_msg)
    if _wants_file:
        # Whole documents need room: the default 2048 tokens cuts CVs/decks short.
        user_max_tokens = max(user_max_tokens or 0, int(os.getenv("FILE_MAX_TOKENS", "8000")))

    if not has_images and (web_search or research or factcheck or auto_web):
        user_model = "perplexity/sonar"

    if has_images and (research or factcheck):
        user_model = "openai/gpt-4o"

    if research or factcheck:
        user_max_tokens = 4096
        user_temperature = 0.3

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
                    yield f"data: {json.dumps({'error': 'Zelpophai AI is busy — too many requests at once. Please wait 10 seconds and try again.'})}\n\n"
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
                                    # Single retry after 1s before fallback (non-disruptive queue)
                                    try:
                                        import asyncio as _aio_retry
                                        await _aio_retry.sleep(1.0)
                                        async with httpx.AsyncClient(timeout=60) as fb_retry:
                                            fr_retry = await fb_retry.post(OPENROUTER_URL, headers={"Authorization": f"Bearer {_key}", "Content-Type": "application/json"}, json={"model": user_model, "messages": messages, "max_tokens": user_max_tokens, "temperature": user_temperature})
                                            if fr_retry.status_code == 200:
                                                fobj_retry = fr_retry.json()
                                                fcontent_retry = fobj_retry.get("choices", [{}])[0].get("message", {}).get("content", "")
                                                if fcontent_retry:
                                                    citations_retry = fobj_retry.get("citations", []) or fobj_retry.get("choices", [{}])[0].get("message", {}).get("citations", [])
                                                    if citations_retry:
                                                        full_response = convert_citations_to_links(fcontent_retry, citations_retry)
                                                    else:
                                                        full_response = strip_citations(fcontent_retry) if fcontent_retry else ""
                                                    for i in range(0, len(full_response), 20):
                                                        yield f"data: {json.dumps({'token': full_response[i:i+20]})}\n\n"
                                                        import asyncio as _aio_retry2
                                                        await _aio_retry2.sleep(0.02)
                                                    if full_response:
                                                        async with async_session() as db2_retry:
                                                            ai_msg2_retry = Message(chat_id=chat_id, role="assistant", content=full_response)
                                                            db2_retry.add(ai_msg2_retry)
                                                            await db2_retry.commit()
                                                    yield "data: [DONE]\n\n"
                                                    return
                                    except: pass
                                    # Try free fallback before giving up
                                    try:
                                        async with httpx.AsyncClient(timeout=60) as fb:
                                            fr = await fb.post(OPENROUTER_URL, headers={"Authorization": f"Bearer {keys[0]}", "Content-Type": "application/json"}, json={"model": "openai/gpt-6-luna", "messages": messages, "max_tokens": min(user_max_tokens, 1024), "temperature": 0.7})
                                            if fr.status_code == 200:
                                                fobj = fr.json()
                                                fcontent = fobj.get("choices", [{}])[0].get("message", {}).get("content", "")
                                                if fcontent:
                                                    full_response = strip_citations(fcontent)
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
                                    yield f"data: {json.dumps({'error': 'Zelpophai AI is busy — too many requests at once. Please wait 10 seconds and try again.'})}\n\n"
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
                        yield f"data: {json.dumps({'error': 'Zelpophai AI is busy — too many requests at once. Please wait 10 seconds and try again.'})}\n\n"
                    else:
                        yield f"data: {json.dumps({'error': f'API error {last_status}: {last_err[:300]}'})}\n\n"
                    return
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                return

        # Normal streaming path (no web or has images) - with key rotation on 402/429
        keys = _get_openrouter_keys()
        if not keys:
            yield f"data: {json.dumps({'error': 'Zelpophai AI is busy — too many requests at once. Please wait 10 seconds and try again.'})}\n\n"
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
                                            fr = await fb.post(OPENROUTER_URL, headers={"Authorization": f"Bearer {keys[0]}", "Content-Type": "application/json"},                     json={"model": "openai/gpt-6-luna", "messages": messages, "max_tokens": min(user_max_tokens, 1024), "temperature": 0.7})
                                            if fr.status_code == 200:
                                                fobj = fr.json()
                                                fcontent = fobj.get("choices", [{}])[0].get("message", {}).get("content", "")
                                                if fcontent:
                                                    fcontent = strip_citations(fcontent)
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
                                    yield f"data: {json.dumps({'error': 'Zelpophai AI is busy — too many requests at once. Please wait 10 seconds and try again.'})}\n\n"
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
                        yield f"data: {json.dumps({'error': 'Zelpophai AI is busy — too many requests at once. Please wait 10 seconds and try again.'})}\n\n"
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

    async def generate_wrapped():
        done_sent = False
        async for chunk in generate():
            if not done_sent and chunk.strip() == "data: [DONE]":
                done_sent = True
                try:
                    async for extra in _after_reply(chat_id, user_id, _user_ask):
                        yield extra
                except Exception as e:  # never break the reply over a file/title problem
                    print(f"[after_reply] {type(e).__name__}: {e}")
                yield chunk
                try:
                    async for extra in _auto_title(chat_id, _user_ask):
                        yield extra
                except Exception as e:
                    print(f"[auto_title] {type(e).__name__}: {e}")
                continue
            yield chunk

    return StreamingResponse(generate_wrapped(), media_type="text/event-stream")
