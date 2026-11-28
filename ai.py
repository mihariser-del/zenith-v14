import json
import os
import re
import time
import asyncio
import ai_meter
import httpx
from datetime import datetime, timezone, timedelta
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from database import Message, Chat, Memory, UserSettings, KnowledgeBase, KnowledgeItem, settings, async_session

OPENROUTER_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/") + "/chat/completions"
from docgen import looks_like_file_request


def _get_openrouter_keys() -> list[str]:
    """The AI keys to use: the one saved in the Vault first, else the server's own setting."""
    try:
        import aikeys
        keys = aikeys.current()
        if keys:
            return keys
    except Exception:
        pass
    try:
        keys = settings.get_openrouter_keys()
    except Exception:
        raw = os.getenv("OPENROUTER_API_KEYS") or getattr(settings, "openrouter_api_keys", "") or getattr(settings, "openrouter_api_key", "") or ""
        keys = [k.strip() for k in raw.split(",") if k.strip()]
    return keys


def _ai_error_text(status_code: int, body: str) -> str:
    """What to show someone when the AI service refuses. Plain words, no jargon."""
    if status_code in (401, 403):
        return ("Zelpophai can't reach the AI right now because its key isn't being accepted. "
                "The team has been told — please try again shortly.")
    if status_code == 402:
        return "Zelpophai has run out of AI credit. The team has been told — please try again later."
    if status_code in (408, 504):
        return "The AI took too long to answer. Please try again."
    if status_code >= 500:
        return "The AI service is having trouble right now. Please try again in a minute."
    return f"Something went wrong talking to the AI (error {status_code}). Please try again."


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


_CALC_RE = re.compile(
    r"\b(calculat\w*|compute|work out|how much (will|would|do|does|is|are)|how many (years|months|days)|"
    r"interest|mortgage|loan|amorti[sz]\w*|(re)?payments?|monthly|per (month|year|week)|instal+ments?|compound\w*|"
    r"npv|irr|net present|roi|return on|payback|break[- ]?even|projection|forecast|percent\w*|average|mean|median|"
    r"standard deviation|"
    r"inflation[- ]adjusted|real terms|depreciat\w*|annuit\w*|cash ?flow|budget|savings? plan|tax(es)? on|"
    r"convert \d|exchange rate|how old|days (until|between|since)|statistic\w*|regression|correlat\w*|"
    r"chart|graph|plot)\b", re.I)
_NUM_RE = re.compile(r"\d")
_CHART_RE = re.compile(r"\b(chart|graph|plot|histogram|visuali[sz]\w*|diagram|pie)\b", re.I)


def _needs_calc(text: str) -> bool:
    """Does answering this properly need real arithmetic (and so the code tool)?"""
    t = (text or "")[:2000]
    if not _NUM_RE.search(t):
        return False
    # "%" can't sit inside a word boundary, so it's checked on its own: a
    # percentage next to another number is nearly always a calculation.
    return bool(_CALC_RE.search(t) or (re.search(r"\d\s*%", t) and len(_NUM_RE.findall(t)) >= 3))


_PAGE_RE = re.compile(
    r"\b(calculator|converter|quiz|flash ?cards?|game|timer|stopwatch|countdown|tracker|dashboard|simulator|"
    r"interactive|widget|tool|app|mock-?up|landing page|web ?page|website|generator|planner|chart i can|"
    r"slider|picker|visuali[sz]e|playground)\b", re.I)
_MAKE_RE = re.compile(r"\b(make|build|create|code|design|give me|i need|can you (do|make|build))\b", re.I)


def _wants_page(text: str) -> bool:
    """Does this sound like a request for something to click and play with?"""
    t = (text or "")[:500]
    return bool(_PAGE_RE.search(t) and _MAKE_RE.search(t))


async def build_system_prompt(user_id: int, think: bool, last_user_msg: str = "", research: bool = False, factcheck: bool = False, shared: bool = False) -> str:
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
            # Only when memory is switched on, and only the memories that matter for this message.
            memories = []
            if not shared and (user_settings is None or getattr(user_settings, "memory_enabled", True)):
                try:
                    import memories as _mem
                    memories = await _mem.for_prompt(db, user_id, last_user_msg or "")
                except Exception as _me:
                    print(f"[memory] selection failed: {_me}")

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
        import memories as _mem
        parts.append(_mem.prompt_text(memories))
    if kb_context:
        parts.append(kb_context)
    # Personality: the chosen personality, sliders, nickname and the user's own instructions.
    # It shapes the voice only; research and fact-check modes keep their own strict style.
    if user_settings and not (research or factcheck):
        try:
            import persona as _persona
            _style = _persona.style_block(user_settings)
            if _style:
                parts.append(_style)
        except Exception as _pe:
            print(f"[persona] style block failed: {_pe}")
    if mirror_text:
        parts.append(mirror_text)

    # Who this person said they are (roughly how old, and what they use Zelpophai
    # for). The age part is a safety rule and applies in every mode, including
    # research and fact-check; the style part only shapes the voice.
    try:
        import profiles
        async with async_session() as pdb:
            from sqlalchemy import select as _psel
            from database import User as _PU
            prow = (await pdb.execute(_psel(_PU).where(_PU.id == user_id))).scalar_one_or_none()
        if prow is not None:
            _p = profiles.of(prow)
            _age = profiles.AGE_EFFECTS.get(_p["age"], {}).get("tone", "")
            if _age:
                parts.append(_age)
            if not (research or factcheck):
                _st = profiles.STYLE_EFFECTS.get(_p["style"], {}).get("tone", "")
                if _st:
                    parts.append(_st)
    except Exception as _pfe:
        print(f"[profiles] tone skipped: {_pfe}")

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


_TOOL_RE = re.compile(r"<(zimage|zvideo|zremind|zjob)\b([^>]*?)(?:/>|>(.*?)(?:</\1>|$))", re.S | re.I)
_TOOL_ATTR_RE = re.compile(r'(\w+)\s*=\s*"([^"]*)"')


def _tool_attrs(s):
    import html as _h
    return {k.lower(): _h.unescape(v) for k, v in _TOOL_ATTR_RE.findall(s or "")}


def _local_now(tz_name):
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(tz_name) if tz_name else timezone.utc
    except Exception:
        tz = timezone.utc
    return datetime.now(tz), tz


async def _run_tools(db, user, chat_id, text, tz_name):
    """Carry out <zimage>/<zvideo>/<zremind> tags the AI wrote. Returns
    (new_text, video_jobs, notes). Each tag is replaced by its result, or by a
    short note when the user's plan/limit doesn't allow it."""
    from fastapi import HTTPException as _HTTPExc
    found = list(_TOOL_RE.finditer(text or ""))
    if not found:
        return text, [], []
    from image import make_image, edit_last_image
    from video import start_video_job
    from database import Reminder
    jobs, notes = [], []
    counts = {"zimage": 0, "zvideo": 0, "zremind": 0, "zjob": 0}
    caps = {"zimage": 4, "zvideo": 1, "zremind": 5, "zjob": 2}
    out = text
    for m in reversed(found):
        kind = m.group(1).lower()
        a = _tool_attrs(m.group(2))
        inner = (m.group(3) or "").strip()
        counts[kind] += 1
        repl = ""
        if counts[kind] > caps[kind]:
            out = out[:m.start()] + out[m.end():]
            continue
        try:
            if kind == "zimage":
                prompt = (a.get("prompt") or inner).strip()
                shape = (a.get("shape") or "square").lower()
                w, h = {"wide": (1344, 768), "tall": (768, 1344)}.get(shape, (1024, 1024))
                if a.get("edit", "").lower() in ("true", "1", "yes"):
                    url, merged = await edit_last_image(db, user, chat_id, prompt, w, h)
                    repl = f"**Prompt:** {merged}\n\n**Changed:** {prompt}\n\n![Generated image]({url})"
                else:
                    url, _ = await make_image(db, user, prompt, w, h)
                    repl = f"**Prompt:** {prompt}\n\n![Generated image]({url})"
            elif kind == "zvideo":
                prompt = (a.get("prompt") or inner).strip()
                try:
                    secs = int(a.get("seconds") or 6)
                except ValueError:
                    secs = 6
                aspect = "9:16" if (a.get("shape") or "").lower() in ("tall", "vertical", "9:16") else "16:9"
                job = await start_video_job(db, user, prompt, secs, aspect, chat_id)
                jobs.append(job)
                shape_word = "tall" if aspect == "9:16" else "wide"
                repl = (f"> [!NOTE]\n> 🎬 Making your {job['duration']}-second {shape_word} video. It usually takes 1–3 minutes "
                        f"and will appear below by itself. ({job['remaining']} left today)")
            elif kind == "zjob":
                import scheduler
                what = (inner or a.get("prompt") or "").strip()
                job = await scheduler.create(db, user, a.get("title") or "", what, (a.get("every") or "daily").lower(),
                                             a.get("at") or "08:00", a.get("day") or 0, tz_name or "UTC")
                _nr = job.next_run if job.next_run.tzinfo else job.next_run.replace(tzinfo=timezone.utc)   # the database drops the zone; it's UTC
                nxt = _nr.astimezone(_local_now(tz_name)[1]).strftime("%a %d %b, %H:%M").replace(" 0", " ")
                repl = (f"> [!TIP]\n> 🗓️ **{job.title}** — {scheduler.describe(job.every, job.at, job.day).lower()}. "
                        f"First run: **{nxt}**. Each one arrives in its own chat and I'll let you know. "
                        "Change or pause it any time under Reminders → Scheduled jobs.")
            elif kind == "zremind":
                what = (inner or a.get("text") or "").strip()[:500]
                if not what:
                    raise ValueError("empty reminder")
                local_now, tz = _local_now(tz_name)
                when_s = (a.get("at") or "").strip().replace("T", " ")
                when = None
                for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
                    try:
                        when = datetime.strptime(when_s[:19], fmt).replace(tzinfo=tz)
                        if fmt == "%Y-%m-%d":
                            when = when.replace(hour=9)
                        break
                    except ValueError:
                        continue
                if when is None:
                    raise ValueError("bad time")
                if when <= local_now:
                    repl = "> [!WARNING]\n> ⏰ That time has already passed, so I didn't set the reminder. Tell me a time in the future."
                else:
                    rep = (a.get("repeat") or "none").lower()
                    days = 1 if rep == "daily" else (7 if rep == "weekly" else 0)
                    db.add(Reminder(user_id=user.id, text=what, next_run_at=when.astimezone(timezone.utc), repeat_days=days))
                    await db.commit()
                    nice = when.strftime("%a %d %b, %H:%M").replace(" 0", " ")
                    again = {1: ", every day", 7: ", every week"}.get(days, "")
                    repl = f"> [!TIP]\n> ⏰ Reminder set for **{nice}**{again}: {what}"
        except _HTTPExc as e:
            notes.append(str(e.detail))
            repl = f"> [!WARNING]\n> {e.detail}"
        except Exception as e:
            print(f"[tools] {kind} failed: {type(e).__name__}: {e}")
            label = {"zimage": "make that image", "zvideo": "start that video", "zremind": "set that reminder",
                     "zjob": "set up that scheduled job"}[kind]
            repl = f"> [!WARNING]\n> Sorry, I couldn't {label} just now. Please try again."
        out = out[:m.start()] + "\n\n" + repl + "\n\n" + out[m.end():]
    out = re.sub(r"\n{3,}", "\n\n", out).strip()
    return out, jobs, notes


async def _after_reply(chat_id, user_id, user_text, tz_name=None):
    """After a reply is saved: build files from <zfile> blocks and carry out
    tool tags (<zimage>, <zvideo>, <zremind>). Also catches the case where the
    user asked for a file but the model forgot the tag. Yields one SSE event:
    {"files", "content", "video_jobs", "notes"} or {"file_error"}."""
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
        user = await db.get(_User, user_id)
        if not user:
            return
        original = msg.content
        text = docgen._strip_outer_fence_markers(original)
        files, file_error = [], None

        blocks = docgen.extract_files(text)
        if not blocks and "<zfile" not in text.lower() and "<zpage" not in text.lower() and "<zcanvas" not in text.lower() and "<zdeck" not in text.lower() and len(text) >= 250 \
                and looks_like_file_request(user_text) and not _TOOL_RE.search(text):
            intro, body, name, fmt, outro = docgen.wrap_untagged(text, user_text)
            if len(body) >= 200:
                text = "\n\n".join(x for x in (intro, f'<zfile name="{name}">\n{body}\n</zfile>', outro) if x)
                blocks = docgen.extract_files(text)
        todo = [b for b in blocks if not b["attrs"].get("id") and b["body"].strip()]
        if todo:
            try:
                await check_limit(user, db, "file_tool")
            except _HTTPExc as e:
                file_error = str(e.detail)
                todo = []
        for b in reversed(blocks):
            if b not in todo:
                continue
            try:
                row, size, info = await store_file(db, user_id, b["body"], b["name"], b["fmt"])
            except Exception as e:
                print(f"[files] render failed for {b['name']}: {type(e).__name__}: {e}")
                files.insert(0, {"name": b["name"], "error": "Couldn't build this file. Ask me to try again."})
                continue
            tag = docgen.build_tag(row.id, b["name"], size, b["body"], b["attrs"].get("title", ""),
                                   docgen.folder_path(b["attrs"].get("name") or b["attrs"].get("filename") or "", b["name"]))
            text = text[:b["span"][0]] + tag + text[b["span"][1]:]
            files.insert(0, {
                "id": row.id, "name": b["name"], "format": b["fmt"], "size": size, "stats": info,
                "label": docgen.format_label(b["fmt"]), "url": f"/api/files/{row.id}/download",
                "preview": f"/api/generate/preview/{row.id}", "truncated": not b["closed"],
            })

        # Tool tags outside file blocks only (a file may legitimately contain the text "<zimage").
        jobs, notes = [], []
        if _TOOL_RE.search(text):
            parts = re.split(r"(<zfile\b.*?(?:</zfile>|$))", text, flags=re.S | re.I)
            for i in range(0, len(parts), 2):
                if _TOOL_RE.search(parts[i]):
                    parts[i], j, n = await _run_tools(db, user, chat_id, parts[i], tz_name)
                    jobs += j
                    notes += n
            text = "".join(parts)

        if file_error:
            yield _sse({"file_error": file_error})
        if text == original and not files:
            return
        msg = await db.get(Message, msg.id)
        msg.content = text
        await db.commit()
        yield _sse({"files": files, "content": text, "message_id": msg.id, "video_jobs": jobs, "notes": notes})


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
                    ai_meter.record("title", os.getenv("TITLE_MODEL", "openai/gpt-6-luna"), None, prompt, title)
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


def _place_images(text: str, imgs: list) -> str:
    """Put each photo next to the heading or bold line that names it (ChatGPT style).
    Anything that finds no home is added as a small row at the top, as before."""
    if not imgs:
        return text
    lines = text.split("\n")
    used, inserts = set(), {}
    for im in imgs:
        name = (im.get("target") or im.get("title") or "").strip()
        if not name:
            continue
        key = re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()
        if not key or key in used:
            continue
        best = None
        for i, ln in enumerate(lines):
            if i in inserts:
                continue
            stripped = ln.strip()
            # a heading, a numbered/bulleted item, or a bold lead-in
            if not re.match(r"^(#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|\*\*)", stripped):
                continue
            plain = re.sub(r"[^a-z0-9]+", " ", re.sub(r"[#*_`\[\]()]", " ", stripped.lower())).strip()
            if key in plain or (len(key) > 6 and key.split()[0] in plain.split()):
                best = i
                break
        if best is None:
            continue
        used.add(key)
        alt = re.sub(r'["\n<>]', " ", im.get("title") or name)[:90]
        credit = re.sub(r'["\n<>]', " ", im.get("credit") or "")[:40]
        inserts[best] = (f'<zimg src="{im["thumb"]}" href="{im.get("page") or im["thumb"]}" '
                         f'alt="{alt}" credit="{credit}">')
    if not inserts:
        from router_ai import images_markdown
        return images_markdown(imgs) + text
    out = []
    for i, ln in enumerate(lines):
        if i in inserts:
            out.append(inserts[i])
        out.append(ln)
    leftovers = [im for im in imgs if re.sub(r"[^a-z0-9]+", " ", (im.get("target") or im.get("title") or "").lower()).strip() not in used]
    head = ""
    if leftovers and len(leftovers) == len(imgs):
        from router_ai import images_markdown
        head = images_markdown(leftovers)
    return head + "\n".join(out)


_BUILD_RE = re.compile(
    r"\b(make|create|build|code|write|develop|program|generate|craft|design|give me|cook up)\b"
    r"(?:(?!\b(?:poster|picture|image|photo|logo|video|song|essay|story|recipe|card|flyer|invite|list|plan|explain|about)\b)[^.?!\n]){0,45}?"
    r"\b(mods?|add-?ons?|plugins?|extensions?|exe|executables?|apps?|applications?|games?|bots?|programs?|software|"
    r"scripts?|launchers?|data ?packs?|behaviou?r packs?|resource packs?|shaders?)\b", re.I)


def _build_ask(text: str) -> bool:
    """Someone asking Zelpophai to make software (26.4.6)."""
    return bool(text) and bool(_BUILD_RE.search(text[:500]))


async def stream_chat(chat_id: int, think: bool, images: list = None, web_search: bool = False, research: bool = False, factcheck: bool = False, client_tz: str = None, voice: bool = False, continuation: str = "", actor_id: int = None):
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

        # Who is asking: in a shared chat that's whoever sent the message, so
        # their own settings and allowance apply (see groupchats.py).
        user_id = actor_id or chat.user_id
        _group = bool(getattr(chat, "is_group", False))
        _who = {}
        if _group:
            import groupchats as _gc
            _who = await _gc.names(db, chat)
        for msg in chat.messages:
            if msg.role == "system":
                continue          # "Bob joined the chat" notes are for people, not the AI
            c = msg.content
            if "<zpoll" in c:
                c = re.sub(r"<zpoll\b[^>]*>([\s\S]*?)</zpoll>", r"(started a poll for the group: \1)", c)
            if _group and msg.role == "user" and getattr(msg, "author_id", None):
                c = f"[{_who.get(msg.author_id, 'Someone')}]: {c}"
            messages.append({"role": msg.role, "content": c})

        settings_result = await db.execute(
            select(UserSettings).where(UserSettings.user_id == user_id)
        )
        user_settings_obj = settings_result.scalar_one_or_none()
        _actor = chat.user if user_id == chat.user_id else await db.get(__import__("database").User, user_id)
        _is_owner_chat = getattr(_actor, "role", "") == "owner"
        pinned_model = ""
        if user_settings_obj:
            user_max_tokens = user_settings_obj.max_tokens
            user_temperature = user_settings_obj.temperature
            # Models are chosen automatically now; only the Owner can still pin one.
            if _is_owner_chat and (user_settings_obj.model or "").startswith("pin:"):
                pinned_model = user_settings_obj.model[4:]
        if _is_owner_chat and chat.model:
            pinned_model = chat.model

    has_images = bool(images)

    last_user_msg = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            content = m.get("content", "")
            if isinstance(content, str):
                last_user_msg = content
            break

    # After Zelpophai's code has run on the person's device, it's given the
    # results (not saved as a message) and asked to finish the answer. The
    # routing below still looks at what the person actually asked.
    if continuation:
        messages.append({"role": "user", "content": continuation})

    # Auto web search: live-data questions (news, prices, scores, "latest"...)
    # are routed to Sonar without any toggle. Explicit web/research/factcheck
    # flags still force it.
    _user_ask = last_user_msg.split("[File content:")[0].split("[File:")[0]
    _wants_file = looks_like_file_request(_user_ask)
    auto_web = (not has_images) and _needs_live_data(_user_ask) and not (
        _wants_file and "[File" in last_user_msg)
    # (26.4.5) Code and file work, and "continue / fix the file" follow-ups, also
    # need room — a 2048-token cap cut a 170-line Python script off half way.
    _prev_file = any("<zfile" in (m.get("content") or "") for m in messages[-4:] if m.get("role") == "assistant" and isinstance(m.get("content"), str))
    _codeish = bool(re.search(r"\b(script|code|python|program|plugin|mod|addon|add-on|resource pack|shader|html|css|javascript|\.py|\.js|continue|finish (it|the)|rewrite|fix (it|the|that))\b", _user_ask, re.I)) or _build_ask(_user_ask)
    if _wants_file or _wants_page(_user_ask) or _codeish or _prev_file:
        # Whole documents and working pages need room: the default 2048 tokens
        # cuts CVs, decks and calculators off half way.
        user_max_tokens = max(user_max_tokens or 0, int(os.getenv("FILE_MAX_TOKENS", "8000")))

    # Links the person pasted are read before answering (see linkreader.py).
    import linkreader
    _links = [] if continuation else linkreader.find_links(_user_ask)

    # Decide automatically: web search? light or heavy model? photos?
    from router_ai import plan_request, model_for, web_answer, web_images, web_images_for, images_markdown
    _history = [m for m in messages[:-1] if m.get("role") in ("user", "assistant")]
    _steps_sent = []

    def _step(sid, label, detail="", state="doing"):
        """One real stage of this answer, for the live "what I'm doing" list."""
        _steps_sent.append(sid)
        return _sse({"step": {"id": sid, "label": label, "detail": detail[:160], "state": state}})

    _plan_t0 = time.time()
    plan = await plan_request(_user_ask, _history, has_images=has_images, think=think, wants_file=_wants_file,
                              force_web=bool(web_search or research or factcheck), live_hint=auto_web)
    # Real maths needs the main model — the web-search model can't run code.
    _calc = bool(continuation) or (_needs_calc(_user_ask) and not (research or factcheck))
    if _calc:
        plan["heavy"] = True
    user_model = pinned_model or model_for(plan)
    use_web = (not has_images) and plan["web"] and not (_wants_file and "[File" in last_user_msg)
    if continuation:
        # Finishing an answer after code ran: everything needed is already here.
        use_web = False
    if _calc:
        user_max_tokens = max(user_max_tokens or 0, 4096)
    # Maths — and charts of it — is worked out on the server's calculation engine
    # (calcengine.py) before the answer is written. Attached spreadsheets still go
    # to Python on the person's device, which has pandas.
    _engine = (_calc and not continuation and not has_images and not _wants_file
               and not re.search(r"\[File content: [^\]]+\.(csv|xlsx?|xlsm|tsv|json)\]", last_user_msg, re.I))
    # Think mode shows the real stages of the answer as they happen.
    _early_steps = []
    if think:
        _plan_took = time.time() - _plan_t0
        _early_steps.append(_step("plan", "Working out what you need", f"{_plan_took:.1f}s" if _plan_took >= 0.3 else "", "done"))
        for i, st in enumerate(plan.get("steps") or []):
            _early_steps.append(_step(f"idea{i}", st, "", "planned"))
    if research or factcheck:
        plan["heavy"] = True

    if has_images and (research or factcheck) and not pinned_model:
        user_model = model_for({"heavy": True})

    if research or factcheck:
        user_max_tokens = 4096
        user_temperature = 0.3

    system_prompt = await build_system_prompt(user_id, think, last_user_msg, research, factcheck, shared=_group)
    # 26.3: answer in the language the person writes in (unless they ask for another).
    system_prompt += ("\n\nLANGUAGE: always reply in the same language as the user's latest message (Luganda, Swahili, "
                      "French, Arabic… whatever they wrote in), unless they ask for a different language or a translation. "
                      "If they mix languages, use the main one. Code, names and quoted text stay as they are.")
    # 26.4.6: "make me a mod / an exe / a game / an app" — build it here, then point to Coding AGT.
    if _build_ask(_user_ask):
        system_prompt += ("\n\nBUILD REQUEST: the user wants software made (a mod, app, game, program, bot, plugin, extension, script or .exe). "
                          "Build it now in this reply: every file it needs as complete <zfile name=\"path/name.ext\">…</zfile> blocks (use folders in the "
                          "name for structure, e.g. src/main.py or behavior_pack/manifest.json), with real working code — no placeholders. "
                          "Then give short numbered steps to use or install it. For an .exe you can't hand over a compiled file, so write the "
                          "program plus a build script (e.g. build.bat using PyInstaller) that turns it into an .exe on their PC. "
                          "For a game mod, follow that game's real format (e.g. Minecraft Bedrock add-ons: manifest.json with UUIDs, "
                          "behavior/resource packs, zipped as .mcaddon/.mcpack). Be honest in one sentence about anything that can't be done. "
                          "Finish with one line recommending Coding AGT. — e.g. \"Tip: press Open in Coding AGT. below to run it, fix errors with the "
                          "coding agent and download the whole project.\"")
    # 26.4.5: do the work instead of offering to.
    system_prompt += ("\n\nFOLLOW THROUGH: if the user wants something made, fixed or improved (a file, script, pack, page), "
                      "make it in this reply — don't end with \"I can make/replace/fix that…\" and wait. Be honest about limits "
                      "in a sentence, then deliver the best version that is possible. Any file you write must be COMPLETE and "
                      "runnable from top to bottom — never leave a file half-written or with placeholder lines.")
    # Project instructions & files, a custom assistant's role, and the open canvas (workspace.py).
    try:
        import workspace as _ws
        async with async_session() as _wdb:
            _wchat = await _wdb.get(Chat, chat_id)
            if _wchat:
                system_prompt += await _ws.prompt_for_chat(_wdb, _wchat, last_user_msg)
    except Exception as _we:
        print(f"[workspace] {type(_we).__name__}: {_we}")
    if _group:
        _people = ", ".join(sorted(set(_who.values())))
        system_prompt += (f"\n\nSHARED CHAT: several people are talking to you together in this chat ({_people}). Each "
                          "message starts with [Name] to show who wrote it. Address people by name when it helps, keep "
                          "track of what each person wants, and be fair to everyone. Never bring up private things you "
                          "may know about one person — nothing from anyone's memories is used here.")
    if voice and not (research or factcheck):
        # Voice conversation: the reply is read aloud, so it must sound like talking.
        system_prompt += ("\n\nVOICE CONVERSATION: The person is talking to you out loud and your reply will be spoken by a text-to-speech voice. "
                          "Answer the way a friendly person talks: usually 1 to 3 short sentences, plain words, no markdown, no lists, no headings, no emoji, "
                          "no code blocks and no links. If the honest answer is long, give the short version and offer to say more. "
                          "Write numbers and symbols so they read naturally aloud.")
    # Tell the AI what it can actually do for THIS user (tools, plan, what's left today).
    try:
        from tools_prompt import capabilities_prompt
        from database import User as _UT
        _now_local, _tz = _local_now(client_tz)
        async with async_session() as _tdb:
            _u = await _tdb.get(_UT, user_id)
            if _u:
                system_prompt += (f"\n\nThe user's local time is {_now_local.strftime('%A %d %B %Y, %H:%M')} "
                                  f"({client_tz or 'UTC'}).\n" + await capabilities_prompt(_tdb, _u, chat_id))
    except Exception as _e:
        print(f"[tools_prompt] {type(_e).__name__}: {_e}")
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
        for _s in _early_steps:
            yield _s
        full_response = ""

        if _links:
            from urllib.parse import urlsplit as _us
            _host = (_us(_links[0]).hostname or "").removeprefix("www.")
            _what = _host + (f" and {len(_links) - 1} more" if len(_links) > 1 else "")
            yield _sse({"status": "reading", "url": _what})
            if think:
                yield _step("read", "Reading " + _what)
            _t0 = time.time()
            _read = await asyncio.gather(*[linkreader.read(u) for u in _links])
            _block = linkreader.prompt_block(_read)
            for _m in reversed(messages):
                if _m.get("role") != "user":
                    continue
                if isinstance(_m.get("content"), str):
                    _m["content"] = _m["content"] + "\n\n" + _block
                elif isinstance(_m.get("content"), list):
                    _m["content"] = _m["content"] + [{"type": "text", "text": _block}]
                break
            _ok = [r for r in _read if r.get("ok")]
            if think:
                yield _step("read", f"Read {len(_ok)} of {len(_read)} link{'s' if len(_read) != 1 else ''}" if _ok else "Couldn't read the link",
                            f"{time.time() - _t0:.1f}s", "done")

        img_task = None
        _targets = [t for t in (plan.get("image_targets") or []) if t]
        if plan.get("images") and _targets:
            # Several named things: one photo each, shown beside the thing it belongs to.
            img_task = asyncio.create_task(web_images_for(_targets, 1))
        elif plan.get("images") and plan.get("image_query"):
            img_task = asyncio.create_task(web_images(plan["image_query"], 3))

        async def _photos(wait):
            if not img_task:
                return []
            try:
                return await asyncio.wait_for(asyncio.shield(img_task), timeout=wait) or []
            except Exception:
                return []

        async def _gallery(wait):
            return images_markdown(await _photos(wait))

        # Research button: split the question, research every part at once, then
        # write one report from all the notes (see research.py).
        _deep_sources = None
        if research and not factcheck and not has_images:
            import research as _rs
            yield _sse({"status": "searching", "query": "Planning the research"})
            yield _step("rplan", "Splitting your question into parts")
            _t0 = time.time()
            _parts = await _rs.plan(_user_ask, _history)
            yield _step("rplan", f"Split it into {len(_parts)} part{'s' if len(_parts) != 1 else ''}", f"{time.time() - _t0:.1f}s", "done")
            for _i, _p in enumerate(_parts):
                yield _step(f"r{_i}", _p, "researching…", "doing")

            async def _one(i, p):
                try:
                    return i, await _rs.dig(p)
                except Exception:
                    return i, {"ok": False, "text": "", "sources": []}

            _results = [None] * len(_parts)
            for _fut in asyncio.as_completed([_one(i, p) for i, p in enumerate(_parts)]):
                _i, _res = await _fut
                _results[_i] = _res
                _n = len(_res.get("sources") or [])
                yield _step(f"r{_i}", _parts[_i], (f"{_n} source{'s' if _n != 1 else ''}" if _res.get("ok") else "nothing came back"), "done")
            _notes, _srcs = _rs.merge(_parts, _results)
            if any(r and r.get("ok") for r in _results):
                _deep_sources = _srcs
                for _m in reversed(messages):
                    if _m.get("role") == "user" and isinstance(_m.get("content"), str):
                        _m["content"] += _rs.writer_brief(_notes)
                        break
                yield _step("rwrite", "Writing the report", f"from {len(_srcs)} sources", "doing")
                ai_meter.record("search", "perplexity/sonar", user_id, messages, _notes)

        if use_web and _calc and _deep_sources is None:
            yield _sse({"status": "searching", "query": plan.get("query", "")[:120]})
            yield _step("web", "Looking up the facts", plan.get("query", "")[:120])
            _t0 = time.time()
            _facts, _fsrc = await web_answer(messages, plan.get("query") or _user_ask, 1200)
            _deep_sources = _fsrc or []
            if _facts:
                _listing = "\n".join(f"[{i}] {x.get('title') or x['url']} — {x['url']}" for i, x in enumerate(_deep_sources, start=1))
                for _m in reversed(messages):
                    if _m.get("role") == "user" and isinstance(_m.get("content"), str):
                        _m["content"] += (
                            "\n\n[FACTS FROM A WEB SEARCH JUST NOW]\n" + strip_citations(_facts) +
                            ("\n\nSOURCES (numbered):\n" + _listing if _listing else "") +
                            "\n[END OF FACTS]\n\nUse these facts for the numbers you need and cite them with [n] from the "
                            "SOURCES list. Never estimate the maths in your head and never say you can't calculate. "
                            "Don't write your own Sources list.")
                        break
                yield _step("web", "Looked up the facts", (f"{len(_deep_sources)} sources · " if _deep_sources else "") + f"{time.time() - _t0:.1f}s", "done")
            else:
                yield _step("web", "Couldn't reach the web", "working from what I know", "done")

        if use_web and _deep_sources is None:
            # Tell the app we're searching so it can show "Searching the web…".
            yield _sse({"status": "searching", "query": plan.get("query", "")[:120]})
            if think:
                yield _step("web", "Searching the web", plan.get("query", "")[:120])
            _t0 = time.time()
            text, sources = await web_answer(messages, plan.get("query") or _user_ask, max(user_max_tokens or 0, 2048))
            if think:
                yield _step("web", "Searched the web", (f"{len(sources)} sources · " if sources else "") + f"{time.time() - _t0:.1f}s", "done")
            if text:
                _imgs = await _photos(4.0)
                if think and _imgs:
                    yield _step("pics", "Found pictures", f"{len(_imgs)} photo{'' if len(_imgs) == 1 else 's'}", "done")
                full_response = _place_images(text, _imgs)
                if sources:
                    yield _sse({"sources": sources[:10]})
                for i in range(0, len(full_response), 24):
                    yield _sse({"token": full_response[i:i + 24]})
                    await asyncio.sleep(0.012)
                async with async_session() as db:
                    db.add(Message(chat_id=chat_id, role="assistant", content=full_response))
                    await db.commit()
                ai_meter.record("search", "perplexity/sonar", user_id, messages, text)
                yield "data: [DONE]\n\n"
                return
            # Search failed: answer normally, and say so honestly.
            yield _sse({"status": "search_failed"})
            messages[0]["content"] += ("\n\nNOTE: a live web search was needed but failed just now. Answer from what you "
                                       "know, and say clearly that you couldn't check the latest information.")

        # Exact maths first, on the calculation engine (see calcflow.py).
        _prefix = ""
        _finish = ""
        if _engine:
            import calcflow
            yield _sse({"status": "calculating"})
            yield _step("calc", "Calculating it exactly", "on the calculation engine", "doing")
            _t0 = time.time()
            try:
                _cres = await calcflow.work_out(messages)
            except Exception as _ce:
                print(f"[calcflow] {type(_ce).__name__}: {_ce}")
                _cres = None
            if _cres and _cres.get("ok"):
                _prefix = calcflow.card(_cres)
                for _m in reversed(messages):
                    if _m.get("role") == "user" and isinstance(_m.get("content"), str):
                        _m["content"] += calcflow.brief(_cres)
                        break
                yield _step("calc", "Calculated it exactly",
                            f"{time.time() - _t0:.1f}s" + (f" · fixed itself {_cres['tries'] - 1}×" if _cres["tries"] > 1 else ""), "done")
                full_response = _prefix
                yield _sse({"token": _prefix})
            else:
                yield _step("calc", "Switching to Python on your device", "the engine couldn't finish it", "done")
                for _m in reversed(messages):
                    if _m.get("role") == "user" and isinstance(_m.get("content"), str):
                        _m["content"] += ("\n\n[Do the calculation with a <zrun> block as your tools describe — never "
                                          "estimate it in your head and never say you can't calculate.]")
                        break
        elif _calc and use_web and not continuation:
            for _m in reversed(messages):
                if _m.get("role") == "user" and isinstance(_m.get("content"), str):
                    _m["content"] += "\n\n[Do the calculation with a <zrun> block as your tools describe.]"
                    break

        # Photos go in beside the thing they show, once the answer is written (see the end of this function).
        if think or _engine or (use_web and _calc):
            yield _step("write", "Writing the answer", "", "doing")

        # Normal streaming path (no web or has images) - with key rotation on 402/429
        keys = _get_openrouter_keys()
        if not keys:
            yield f"data: {json.dumps({'error': 'Zelpophai AI is busy — too many requests at once. Please wait 10 seconds and try again.'})}\n\n"
            return
        else:
            last_error_body = ""
            last_status = 0
            streamed = False
            _finish = ""
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
                                try:
                                    import aikeys
                                    aikeys.note_failure(resp.status_code, error_body)
                                except Exception:
                                    pass
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
                                    yield f"data: {json.dumps({'error': _ai_error_text(resp.status_code, error_body)})}\n\n"
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
                                    _fr = (obj.get("choices") or [{}])[0].get("finish_reason")
                                    if _fr:
                                        _finish = _fr
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
                        yield f"data: {json.dumps({'error': _ai_error_text(last_status, last_error_body)})}\n\n"
                    return

        # (26.4.5) Ran out of room in the middle of a file: keep writing (up to two
        # more rounds) so the file isn't left cut off and broken.
        _rounds = 0
        while (_finish == "length" and _rounds < 2 and full_response
               and full_response.count("<zfile") > full_response.count("</zfile>")):
            _rounds += 1
            _finish = ""
            try:
                _more = messages + [{"role": "assistant", "content": full_response},
                                    {"role": "user", "content": "You ran out of room in the middle of the file. Continue EXACTLY where you stopped — the very next characters, no repetition, no explanation — and finish the file and its closing </zfile> tag, then one short line on how to use it."}]
                async with httpx.AsyncClient(timeout=150) as _cl:
                    async with _cl.stream("POST", OPENROUTER_URL,
                                          headers={"Authorization": f"Bearer {keys[0]}", "Content-Type": "application/json"},
                                          json={"model": user_model, "messages": _more, "max_tokens": user_max_tokens,
                                                "temperature": user_temperature, "stream": True}) as _r2:
                        if _r2.status_code != 200:
                            break
                        async for line in _r2.aiter_lines():
                            if not line.startswith("data: "):
                                continue
                            if line[6:].strip() == "[DONE]":
                                break
                            try:
                                _o = json.loads(line[6:])
                            except json.JSONDecodeError:
                                continue
                            _c0 = (_o.get("choices") or [{}])[0]
                            if _c0.get("finish_reason"):
                                _finish = _c0["finish_reason"]
                            _t = (_c0.get("delta") or {}).get("content")
                            if _t:
                                _t = process_response(_t, _research)
                                full_response += _t
                                yield f"data: {json.dumps({'token': _t})}\n\n"
            except Exception as _e:
                import logging as _lg; _lg.getLogger("ai").warning("file continuation failed: %s", _e)
                break

        if full_response:
            _body = full_response[len(_prefix):] if _prefix and full_response.startswith(_prefix) else full_response
            _keep = _prefix if _body is not full_response else ""
            if _deep_sources:
                from router_ai import cite as _cite
                full_response = _keep + _cite(_body, _deep_sources)
                yield _sse({"content": full_response})
                if "rwrite" in _steps_sent:
                    yield _step("rwrite", "Wrote the report", f"{len(_deep_sources)} sources", "done")
            else:
                full_response = _keep + strip_citations(_body)
            # Photos last: now that the answer is written we know where each one belongs.
            if img_task:
                _imgs = await _photos(3.0)
                if _imgs:
                    with_pics = _place_images(full_response, _imgs)
                    if with_pics != full_response:
                        full_response = with_pics
                        if think:
                            yield _step("pics", "Added pictures", f"{len(_imgs)} photo{'' if len(_imgs) == 1 else 's'}", "done")
                        yield _sse({"content": full_response})
                if not img_task.done():
                    img_task.cancel()
            if "write" in _steps_sent:
                yield _step("write", "Wrote the answer", "", "done")
            ai_meter.record("chat", user_model, user_id, messages, full_response)
            async with async_session() as db:
                ai_msg = Message(chat_id=chat_id, role="assistant", content=full_response)
                db.add(ai_msg)
                await db.commit()
                await db.refresh(ai_msg)
            # The browser needs the saved message's id to keep checklist ticks.
            yield _sse({"message_id": ai_msg.id})

        yield "data: [DONE]\n\n"

    async def generate_wrapped():
        done_sent = False
        async for chunk in generate():
            if chunk.startswith('data: {"error"'):
                try:
                    from vault_events import log_error
                    log_error("ai", json.loads(chunk[6:]).get("error", ""), f"chat:{chat_id} model:{user_model}", user_id)
                except Exception:
                    pass
            if not done_sent and chunk.strip() == "data: [DONE]":
                done_sent = True
                try:
                    async for extra in _after_reply(chat_id, user_id, _user_ask, client_tz):
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
