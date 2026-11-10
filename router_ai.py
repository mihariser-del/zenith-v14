"""Decides how to answer each chat message, so users never pick a model.

plan_request()  → should we search the web? which model (light or heavy)?
                  would real photos help? (a tiny, fast AI call + quick rules)
web_answer()    → answer from a live web search with real sources
web_images()    → a few relevant photos from Wikipedia / Openverse (free,
                  openly licensed) with links to where they come from
cite()          → turns [1] [2] markers into clickable source chips and adds
                  a "Sources" list with page titles
"""

import asyncio
import json
import os
import re
from urllib.parse import quote, urlparse

import httpx

OR_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/") + "/chat/completions"
LIGHT_MODEL = os.getenv("CHAT_MODEL_LIGHT", "openai/gpt-6-luna")
HEAVY_MODEL = os.getenv("CHAT_MODEL_HEAVY", "openai/gpt-6-sol")
ROUTER_MODEL = os.getenv("CHAT_ROUTER_MODEL", "openai/gpt-6-luna")
SEARCH_MODEL = os.getenv("CHAT_SEARCH_MODEL", "perplexity/sonar")
UA = "ZelpophaiAI/1.0 (+https://zelpophai.up.railway.app/privacy)"

_SMALLTALK = re.compile(
    r"^\s*(hi+|hey+|hello+|hiya|yo|sup|good (morning|afternoon|evening|night)|thanks?|thank you|thx|ok(ay)?|cool|nice|great|"
    r"lol|haha+|bye|see you|how are you\??|what'?s up\??|who are you\??|yes|no|sure|please)[\s!.?😀-🙏]*$", re.I)
_HEAVY_HINT = re.compile(
    r"```|\b(debug|refactor|algorithm|complexity|prove|proof|derive|integral|equation|step[- ]by[- ]step|analy[sz]e|"
    r"compare|essay|report|thesis|research|business plan|strategy|architecture|optimi[sz]e|explain in detail|"
    r"in depth|detailed|cv|resume|cover letter|contract|translate this document)\b", re.I)
_IMAGE_HINT = re.compile(r"\b(what does .{2,40} look like|show me (a |an |some |the )?(photo|picture|image)s?|photos? of|pictures? of)\b", re.I)

ROUTER_PROMPT = """You route messages for an AI assistant. Read the conversation and the user's LATEST message, then reply with ONLY a JSON object:
{"web": true|false, "query": "", "heavy": true|false, "images": true|false, "image_query": ""}

web: true when a good answer needs fresh or checkable facts from the internet — news, current events, prices, weather, sports scores or fixtures, schedules, laws, statistics, releases, "latest", anything that may have changed since 2024, specific facts about real people, companies, products or places, or when the user asks to search, look something up, or for sources/links. false for chit-chat, opinions, creative writing, coding, maths, general knowledge that doesn't change, or questions about the user's own files.
query: when web is true, a short web search query (max 12 words) that includes needed context from earlier messages.
heavy: true for demanding tasks — coding or debugging, maths, logic puzzles, multi-step reasoning, careful long writing (essays, reports, CVs, letters, documents, plans), detailed analysis or comparisons. false for greetings, small talk, quick facts, short answers, simple rewrites.
images: true when real photos would clearly help the answer — a specific place, landmark, country, animal, plant, food, vehicle, building, artwork, famous person, product, or "what does X look like". false for abstract topics, advice, code, maths, writing tasks, or when the user wants an image GENERATED.
image_query: when images is true, 1-4 words naming the thing to photograph."""


async def _post(payload, timeout=20):
    from ai import _get_openrouter_keys
    keys = _get_openrouter_keys()
    for key in keys:
        try:
            async with httpx.AsyncClient(timeout=timeout) as c:
                r = await c.post(OR_URL, json=payload, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
            if r.status_code == 200:
                return r.json()
            if r.status_code in (401, 402, 429):
                continue
            return None
        except Exception:
            continue
    return None


def _json(text):
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {}


async def plan_request(text: str, history: list, *, has_images=False, think=False, wants_file=False,
                       force_web=False, live_hint=False) -> dict:
    """Return {web, query, heavy, images, image_query, why}."""
    t = (text or "").strip()
    plan = {"web": bool(force_web), "query": t[:200], "heavy": bool(think or wants_file), "images": False,
            "image_query": "", "why": "rules"}
    if not t or (_SMALLTALK.match(t) and not force_web):
        return plan
    if has_images:
        plan["heavy"] = plan["heavy"] or len(t) > 300 or bool(_HEAVY_HINT.search(t))
        return plan
    # Ask a small, fast model (with a short time limit); fall back to rules.
    convo = []
    for m in (history or [])[-4:]:
        c = m.get("content")
        if isinstance(c, str) and m.get("role") in ("user", "assistant"):
            convo.append(f"{m['role'].upper()}: {re.sub(r'<zfile[^>]*>.*?(</zfile>|$)', '[file]', c, flags=re.S)[:500]}")
    convo.append(f"USER (latest): {t[:1500]}")
    data = None
    try:
        data = await asyncio.wait_for(_post({
            "model": ROUTER_MODEL, "temperature": 0, "max_tokens": 120,
            "messages": [{"role": "system", "content": ROUTER_PROMPT}, {"role": "user", "content": "\n".join(convo)}],
        }, timeout=6), timeout=4.5)
    except Exception:
        data = None
    d = _json(((data or {}).get("choices") or [{}])[0].get("message", {}).get("content", "")) if data else {}
    if data:
        import ai_meter
        ai_meter.record("router", ROUTER_MODEL, None, convo, json.dumps(d))
    if d:
        plan["why"] = "router"
        plan["web"] = plan["web"] or bool(d.get("web"))
        if str(d.get("query") or "").strip():
            plan["query"] = str(d["query"]).strip()[:200]
        plan["heavy"] = plan["heavy"] or bool(d.get("heavy"))
        plan["images"] = bool(d.get("images")) and not wants_file
        plan["image_query"] = str(d.get("image_query") or "").strip()[:60]
    else:
        plan["web"] = plan["web"] or live_hint
        plan["heavy"] = plan["heavy"] or len(t) > 600 or bool(_HEAVY_HINT.search(t))
        if _IMAGE_HINT.search(t):
            plan["images"], plan["image_query"] = True, t[:60]
    return plan


def model_for(plan) -> str:
    return HEAVY_MODEL if plan.get("heavy") else LIGHT_MODEL


# ──────────────────────────────────────────────────────── web search ──
def _sources_from(obj) -> list:
    """Collect [{url, title}] from any of the shapes OpenRouter / Perplexity use."""
    out, seen = [], set()

    def add(url, title=""):
        url = str(url or "").strip()
        if not url.startswith("http") or url in seen:
            return
        seen.add(url)
        out.append({"url": url, "title": str(title or "").strip()[:140]})

    msg = ((obj.get("choices") or [{}])[0] or {}).get("message", {}) or {}
    titles = {}
    for sr in (obj.get("search_results") or msg.get("search_results") or []):
        if isinstance(sr, dict) and sr.get("url"):
            titles[sr["url"]] = sr.get("title", "")
    cites = obj.get("citations") or msg.get("citations") or []
    for c in cites:
        if isinstance(c, str):
            add(c, titles.get(c, ""))
        elif isinstance(c, dict):
            add(c.get("url") or c.get("link"), c.get("title") or titles.get(c.get("url"), ""))
    if not out:
        for a in msg.get("annotations") or []:
            uc = (a or {}).get("url_citation") or {}
            if uc.get("url"):
                add(uc["url"], uc.get("title", ""))
    if not out:
        for u, ti in titles.items():
            add(u, ti)
    return out


def _host(url):
    try:
        return urlparse(url).hostname.replace("www.", "")
    except Exception:
        return url


def cite(text: str, sources: list) -> str:
    """[1] / [1][2] / [1, 2] → clickable source chips; add a Sources list."""
    if not text:
        return text
    parts = re.split(r"(```[\s\S]*?(?:```|$)|`[^`\n]*`)", text)

    def repl(m):
        out = []
        for n in re.findall(r"\d+", m.group(0)):
            i = int(n) - 1
            if 0 <= i < len(sources):
                out.append(f"[{n}]({sources[i]['url']})")
        return (" " + " ".join(out)) if out else ""

    for i in range(0, len(parts), 2):
        parts[i] = re.sub(r"(?<![\w\]\[(])[ \t]?(?:\[\d+(?:,\s*\d+)*\])+(?!\()", repl, parts[i])
    body = "".join(parts).rstrip()
    body = re.sub(r"\n+\**(Sources|References|Citations)\**:?\s*\n(?:\s*(?:[-*\d.]+\s*)?\[?\d*\]?\(?https?://\S+\)?\s*\n?)+\s*$", "", body, flags=re.I)
    if sources:
        lines = []
        for i, s in enumerate(sources[:10]):
            title = s.get("title") or _host(s["url"])
            title = title.replace("[", "(").replace("]", ")")
            lines.append(f"{i + 1}. [{title}]({s['url']}) · {_host(s['url'])}")
        body += "\n\n**Sources**\n\n" + "\n".join(lines)
    return body


async def web_answer(messages: list, query: str, max_tokens: int = 2048):
    """Answer with a web-search model. Returns (text_with_citations, sources) or (None, [])."""
    msgs = [m for m in messages if isinstance(m.get("content"), str)]
    if msgs and msgs[0].get("role") == "system":
        msgs[0] = {"role": "system", "content": msgs[0]["content"] +
                   "\n\nWEB SEARCH IS ON: you have live search results. Use them, cite facts with [1], [2] "
                   "matching the sources, give dates for time-sensitive facts, and don't add your own Sources list."}
    # Perplexity needs user/assistant turns to alternate after the system message.
    clean = msgs[:1] if msgs and msgs[0]["role"] == "system" else []
    for m in msgs[len(clean):]:
        if clean and clean[-1]["role"] == m["role"] and m["role"] != "system":
            clean[-1] = {"role": m["role"], "content": clean[-1]["content"] + "\n\n" + m["content"]}
        elif m["role"] in ("user", "assistant"):
            clean.append({"role": m["role"], "content": m["content"]})
    while len(clean) > 1 and clean[1]["role"] == "assistant":
        clean.pop(1)
    data = await _post({"model": SEARCH_MODEL, "messages": clean[-13:] if len(clean) > 13 else clean,
                        "max_tokens": max_tokens, "temperature": 0.2}, timeout=90)
    if not data:
        return None, []
    text = ((data.get("choices") or [{}])[0].get("message", {}) or {}).get("content") or ""
    if not text.strip():
        return None, []
    sources = _sources_from(data)
    return cite(text, sources), sources


# ─────────────────────────────────────────────────────────── images ──
async def web_images(query: str, n: int = 3) -> list:
    """[{thumb, page, title, credit}] — openly licensed photos for `query`."""
    q = (query or "").strip()
    if not q:
        return []
    out = []
    async with httpx.AsyncClient(timeout=6, headers={"User-Agent": UA}) as c:
        try:
            r = await c.get("https://en.wikipedia.org/w/api.php", params={
                "action": "query", "generator": "search", "gsrsearch": q, "gsrlimit": 6, "prop": "pageimages|info",
                "piprop": "thumbnail", "pithumbsize": 640, "inprop": "url", "format": "json", "formatversion": 2})
            pages = (r.json().get("query") or {}).get("pages") or [] if r.status_code == 200 else []
            for p in sorted(pages, key=lambda p: p.get("index", 99)):
                th = (p.get("thumbnail") or {}).get("source", "")
                if th and not th.lower().endswith((".svg.png",)) and "Flag_of" not in th:
                    out.append({"thumb": th, "page": p.get("fullurl", ""), "title": p.get("title", ""), "credit": "Wikipedia"})
                if len(out) >= n:
                    break
        except Exception:
            pass
        if len(out) < n:
            try:
                r = await c.get("https://api.openverse.org/v1/images/", params={"q": q, "page_size": n + 3, "mature": "false"})
                for it in (r.json().get("results") or []) if r.status_code == 200 else []:
                    th = it.get("thumbnail") or it.get("url")
                    if th:
                        out.append({"thumb": th, "page": it.get("foreign_landing_url") or it.get("url", ""),
                                    "title": it.get("title", "") or q, "credit": it.get("source", "Openverse")})
                    if len(out) >= n:
                        break
            except Exception:
                pass
    return out[:n]


def images_markdown(imgs: list) -> str:
    """A row of photos (each links to where it comes from); render.js shows it as a gallery."""
    if not imgs:
        return ""
    cells = []
    for im in imgs:
        alt = re.sub(r"[\[\]\n]", " ", im.get("title") or "photo")[:80]
        th = im["thumb"].replace(")", "%29").replace(" ", "%20")
        page = (im.get("page") or im["thumb"]).replace(")", "%29").replace(" ", "%20")
        cells.append(f"[![{alt}]({th})]({page})")
    return " ".join(cells) + "\n\n"
