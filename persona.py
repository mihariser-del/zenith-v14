"""Personality: who Zelpophai is for each person.

A personality (ready-made or one the person wrote), five sliders that fine-tune it, what to call
the person, a few things to know about them, and their own standing instructions. style_block()
turns all of that into the part of the system prompt that shapes how Zelpophai talks — it never
replaces Zelpophai's identity, safety or honesty rules, it sits beside them.

Stored as JSON in user_settings.persona:
  {"active": "friendly" | "custom:ab12", "traits": {...} | null, "nickname": "", "about": "",
   "language": "", "customs": [{"id","name","description"}]}
"""

import json
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db

router = APIRouter(prefix="/api/personality", tags=["personality"])

TRAITS = {
    "warmth": ("Warmth", "Straight to business", "Warm and caring"),
    "humor": ("Humour", "Serious", "Playful and funny"),
    "detail": ("Detail", "Short and quick", "Thorough and detailed"),
    "formality": ("Formality", "Casual, like a friend", "Formal and polished"),
    "emoji": ("Emoji", "No emoji", "Lots of emoji"),
}
_DEFAULT_TRAITS = {"warmth": 3, "humor": 2, "detail": 3, "formality": 3, "emoji": 1}

PERSONAS = [
    {"id": "default", "name": "Balanced", "icon": "spark", "color": "#6d7cff",
     "tagline": "Clear, helpful and to the point — the classic Zelpophai.",
     "sample": "Sure! Here's the short answer, then the details if you want them.",
     "style": "Be clear, accurate and helpful. Lead with the answer, then add what is useful.",
     "traits": {"warmth": 3, "humor": 2, "detail": 3, "formality": 3, "emoji": 1}},
    {"id": "friendly", "name": "Friendly", "icon": "smile", "color": "#f59e0b",
     "tagline": "Like texting a kind friend who happens to know a lot.",
     "sample": "Ooh, good question! Okay, so here's the deal…",
     "style": "Talk like a kind, upbeat friend: conversational, encouraging and easy-going, using everyday words and contractions.",
     "traits": {"warmth": 5, "humor": 3, "detail": 3, "formality": 1, "emoji": 2}},
    {"id": "professional", "name": "Professional", "icon": "briefcase", "color": "#38bdf8",
     "tagline": "Polished and efficient. Great for work and school emails.",
     "sample": "Certainly. The recommended approach is as follows.",
     "style": "Write like a capable professional colleague: polished, structured, action-oriented, with clear next steps and no slang.",
     "traits": {"warmth": 2, "humor": 1, "detail": 3, "formality": 5, "emoji": 0}},
    {"id": "teacher", "name": "Teacher", "icon": "book", "color": "#34d399",
     "tagline": "Explains step by step and checks you've really got it.",
     "sample": "Let's build this up one step at a time. First…",
     "style": "Act as a patient teacher: explain step by step from the basics, use simple examples and analogies, define new words, and end with a quick check question or a small thing to try.",
     "traits": {"warmth": 4, "humor": 2, "detail": 4, "formality": 2, "emoji": 1}},
    {"id": "coder", "name": "Coder", "icon": "code", "color": "#a78bfa",
     "tagline": "A senior developer: clean code first, short explanation after.",
     "sample": "Here's the fix. The bug was an off-by-one in the loop.",
     "style": "Act as a senior software engineer: give working, clean, modern code first, then a brief explanation of what changed and why; mention edge cases and pitfalls; keep prose tight.",
     "traits": {"warmth": 2, "humor": 1, "detail": 3, "formality": 3, "emoji": 0}},
    {"id": "creative", "name": "Creative", "icon": "palette", "color": "#f472b6",
     "tagline": "Imaginative and vivid — for stories, names and big ideas.",
     "sample": "Picture this: a lighthouse that only shines for lost ideas…",
     "style": "Be imaginative and vivid: offer fresh angles, metaphors and unexpected ideas, propose a few bold options, and bring some flair to the wording while staying useful.",
     "traits": {"warmth": 4, "humor": 3, "detail": 3, "formality": 2, "emoji": 1}},
    {"id": "coach", "name": "Coach", "icon": "flag", "color": "#fb923c",
     "tagline": "Motivating and practical. Turns goals into next steps.",
     "sample": "You can do this. Here's your first small step for today.",
     "style": "Act as a motivating coach: be encouraging but honest, turn goals into small concrete next steps, ask what is getting in the way, and celebrate progress.",
     "traits": {"warmth": 5, "humor": 2, "detail": 2, "formality": 2, "emoji": 1}},
    {"id": "funny", "name": "Comedian", "icon": "laugh", "color": "#facc15",
     "tagline": "Still correct — just with jokes and a bit of cheek.",
     "sample": "Great news: it's fixable. Bad news: it was the semicolon. Again.",
     "style": "Be witty and playful: light jokes, wordplay and a bit of cheek, while every fact and instruction stays correct. Never joke about serious or sensitive problems.",
     "traits": {"warmth": 4, "humor": 5, "detail": 2, "formality": 1, "emoji": 2}},
    {"id": "concise", "name": "Straight shooter", "icon": "bolt", "color": "#94a3b8",
     "tagline": "No fluff. The answer, in as few words as possible.",
     "sample": "Yes. Use option B — it's faster and cheaper.",
     "style": "Be blunt and brief: answer in as few words as possible, no preamble, no filler, no repeating the question. Use lists only when they are shorter than sentences. Add detail only when asked.",
     "traits": {"warmth": 2, "humor": 1, "detail": 1, "formality": 3, "emoji": 0}},
    {"id": "scholar", "name": "Scholar", "icon": "cap", "color": "#60a5fa",
     "tagline": "Careful and precise, with the reasoning shown.",
     "sample": "There are two main views on this; the evidence favours the second.",
     "style": "Act as a careful scholar: be precise with terms, show the reasoning, separate facts from opinion, mention uncertainty and other views, and say where a claim comes from when you know.",
     "traits": {"warmth": 2, "humor": 1, "detail": 5, "formality": 4, "emoji": 0}},
]
_BY_ID = {p["id"]: p for p in PERSONAS}
_LEGACY = {"default": "default", "creative": "creative", "professional": "professional", "scholarly": "scholar",
           "casual": "friendly", "coder": "coder"}
MAX_CUSTOMS = 6
LANGUAGES = ["", "English", "Simple English", "French", "Spanish", "Arabic", "Swahili", "Hausa", "Portuguese", "German",
             "Hindi", "Chinese", "Turkish", "Indonesian"]

_hits: dict = {}


def _limit(key, limit, window):
    now = time.time()
    lst = [t for t in _hits.get(key, []) if now - t < window]
    if len(lst) >= limit:
        raise HTTPException(status_code=429, detail="That's a lot of previews — try again in a little while.")
    lst.append(now)
    _hits[key] = lst


def _legacy_prompts() -> set:
    try:
        from user_settings import PERSONALITY_PRESETS
        vals = {v.strip() for v in PERSONALITY_PRESETS.values()}
    except Exception:
        vals = set()
    vals.add("You are Zelpophai AI, created by Wanzu Ibrahim. Answer accurately and helpfully.")
    return vals


def custom_instructions(settings) -> str:
    """The person's own standing instructions (the old 'system prompt' box), minus the old presets."""
    sp = (getattr(settings, "system_prompt", "") or "").strip()
    if not sp or sp in _legacy_prompts() or sp.startswith("You are Zelpophai AI, created by Wanzu Ibrahim. Answer accurately"):
        return ""
    return sp[:2000]


def load(settings) -> dict:
    raw = getattr(settings, "persona", "") or ""
    try:
        d = json.loads(raw) if raw else {}
    except Exception:
        d = {}
    if not isinstance(d, dict):
        d = {}
    customs = [c for c in d.get("customs", []) if isinstance(c, dict) and c.get("id") and c.get("name")][:MAX_CUSTOMS]
    active = str(d.get("active") or "")
    if not active:
        active = _LEGACY.get(getattr(settings, "personality", "") or "default", "default")
    if active.startswith("custom:"):
        if not any(c["id"] == active[7:] for c in customs):
            active = "default"
    elif active not in _BY_ID:
        active = "default"
    traits = d.get("traits")
    if isinstance(traits, dict):
        traits = {k: max(0 if k == "emoji" else 1, min(2 if k == "emoji" else 5, int(traits.get(k, _DEFAULT_TRAITS[k])))) for k in TRAITS}
    else:
        traits = None
    lang = str(d.get("language") or "")
    return {"active": active, "traits": traits, "nickname": str(d.get("nickname") or "")[:40],
            "about": str(d.get("about") or "")[:600], "language": lang if lang in LANGUAGES else "", "customs": customs}


def effective_traits(state: dict) -> dict:
    if state["traits"]:
        return state["traits"]
    if state["active"].startswith("custom:"):
        return dict(_DEFAULT_TRAITS)
    return dict(_BY_ID[state["active"]]["traits"])


def _trait_lines(t: dict) -> list:
    out = []
    w, h, d, f, e = t["warmth"], t["humor"], t["detail"], t["formality"], t["emoji"]
    out.append({1: "Keep it matter-of-fact; skip pleasantries.", 2: "Be polite but businesslike.", 3: "Be friendly and approachable.",
                4: "Be warm and encouraging.", 5: "Be very warm, caring and encouraging — show you are on their side."}[w])
    out.append({1: "No jokes at all.", 2: "Mostly serious; a light touch only when it fits.", 3: "A little humour now and then is welcome.",
                4: "Be playful — light jokes are welcome.", 5: "Be funny: jokes and wordplay are part of your voice (never about serious problems)."}[h])
    out.append({1: "Answer in one to three sentences unless asked for more.", 2: "Keep answers short; only the essentials.",
                3: "Give a balanced amount of detail.", 4: "Be thorough: explain the why and include examples.",
                5: "Be very thorough: full explanations, examples, edge cases and context."}[d])
    out.append({1: "Write very casually, like texting a friend.", 2: "Write casually and conversationally.", 3: "Use a neutral, everyday tone.",
                4: "Write in a polished, professional tone.", 5: "Write formally and precisely."}[f])
    out.append({0: "Never use emoji.", 1: "Use an emoji only occasionally.", 2: "Use emoji freely to add feeling."}[e])
    return out


def style_block(settings) -> str:
    """The personality part of the system prompt ('' when everything is default)."""
    state = load(settings)
    lines = []
    if state["active"].startswith("custom:"):
        c = next(c for c in state["customs"] if c["id"] == state["active"][7:])
        lines.append(f"Personality chosen by the user — “{c['name']}”: {c['description']}")
    else:
        p = _BY_ID[state["active"]]
        if state["active"] != "default" or state["traits"]:
            lines.append(f"Personality chosen by the user — {p['name']}: {p['style']}")
    if state["active"] != "default" or state["traits"]:
        lines += _trait_lines(effective_traits(state))
    if state["nickname"]:
        lines.append(f"Call the user “{state['nickname']}” (use the name naturally, not in every message).")
    if state["about"]:
        lines.append(f"About the user, in their own words (use it to make answers fit them; don't recite it back): {state['about']}")
    if state["language"]:
        lines.append("Reply in simple, easy English with short sentences and common words." if state["language"] == "Simple English"
                     else f"Reply in {state['language']} unless the user writes in another language or asks otherwise.")
    ci = custom_instructions(settings)
    if ci:
        lines.append(f"The user's own standing instructions for you: {ci}")
    if not lines:
        return ""
    return ("HOW TO TALK TO THIS USER (their personality settings). This changes your voice and style only — you are "
            "still Zelpophai AI, and your honesty, safety and tool rules always come first:\n- " + "\n- ".join(lines))


# ──────────────────────────────────────────────── endpoints ──
async def _ctx(request: Request, db: AsyncSession):
    from auth import get_current_user_from_cookie
    from user_settings import get_user_settings
    user = await get_current_user_from_cookie(request, db)
    return user, await get_user_settings(user.id, db)


def _public(settings) -> dict:
    state = load(settings)
    return {"state": {**state, "effective_traits": effective_traits(state)},
            "custom_instructions": custom_instructions(settings)}


@router.get("")
async def get_personality(request: Request, db: AsyncSession = Depends(get_db)):
    user, s = await _ctx(request, db)
    return {"personas": [{k: p[k] for k in ("id", "name", "icon", "color", "tagline", "sample", "traits")} for p in PERSONAS],
            "traits": [{"id": k, "name": v[0], "low": v[1], "high": v[2], "min": 0 if k == "emoji" else 1, "max": 2 if k == "emoji" else 5} for k, v in TRAITS.items()],
            "languages": LANGUAGES, "max_customs": MAX_CUSTOMS, **_public(s)}


class SaveIn(BaseModel):
    active: str | None = None
    traits: dict | None = None
    reset_traits: bool = False
    nickname: str | None = None
    about: str | None = None
    language: str | None = None
    custom_instructions: str | None = None


def _clean(text: str, n: int) -> str:
    return " ".join((text or "").replace("\r", " ").split())[:n] if n <= 80 else (text or "").replace("\r", "").strip()[:n]


@router.put("")
async def save_personality(req: SaveIn, request: Request, db: AsyncSession = Depends(get_db)):
    user, s = await _ctx(request, db)
    state = load(s)
    if req.active is not None:
        a = req.active
        if a.startswith("custom:"):
            if not any(c["id"] == a[7:] for c in state["customs"]):
                raise HTTPException(status_code=404, detail="That personality no longer exists.")
        elif a not in _BY_ID:
            raise HTTPException(status_code=400, detail="Unknown personality.")
        if a != state["active"]:
            state["traits"] = None            # a new personality starts with its own slider positions
        state["active"] = a
    if req.reset_traits:
        state["traits"] = None
    elif req.traits is not None:
        base = effective_traits(state)
        try:
            for k in TRAITS:
                if k in req.traits:
                    lo, hi = (0, 2) if k == "emoji" else (1, 5)
                    base[k] = max(lo, min(hi, int(req.traits[k])))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Bad slider value.")
        state["traits"] = base
    if req.nickname is not None:
        state["nickname"] = _clean(req.nickname, 40)
    if req.about is not None:
        state["about"] = _clean(req.about, 600)
    if req.language is not None:
        state["language"] = req.language if req.language in LANGUAGES else ""
    if req.custom_instructions is not None:
        s.system_prompt = _clean(req.custom_instructions, 2000)
    s.persona = json.dumps(state)
    s.personality = state["active"] if state["active"] in _BY_ID else "default"
    await db.commit()
    await db.refresh(s)
    return _public(s)


class CustomIn(BaseModel):
    name: str
    description: str
    id: str = ""


@router.post("/custom")
async def save_custom(req: CustomIn, request: Request, db: AsyncSession = Depends(get_db)):
    user, s = await _ctx(request, db)
    name, desc = _clean(req.name, 30), _clean(req.description, 700)
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Give your personality a name.")
    if len(desc) < 10:
        raise HTTPException(status_code=400, detail="Describe how it should talk (at least a sentence).")
    state = load(s)
    cur = next((c for c in state["customs"] if c["id"] == req.id), None) if req.id else None
    if cur:
        cur["name"], cur["description"] = name, desc
        cid = cur["id"]
    else:
        if len(state["customs"]) >= MAX_CUSTOMS:
            raise HTTPException(status_code=400, detail=f"You can keep up to {MAX_CUSTOMS} of your own personalities. Delete one first.")
        cid = secrets.token_hex(4)
        state["customs"].append({"id": cid, "name": name, "description": desc})
        state["active"], state["traits"] = f"custom:{cid}", None
    s.persona = json.dumps(state)
    await db.commit()
    await db.refresh(s)
    return {"id": cid, **_public(s)}


@router.delete("/custom/{cid}")
async def delete_custom(cid: str, request: Request, db: AsyncSession = Depends(get_db)):
    user, s = await _ctx(request, db)
    state = load(s)
    state["customs"] = [c for c in state["customs"] if c["id"] != cid]
    if state["active"] == f"custom:{cid}":
        state["active"], state["traits"] = "default", None
    s.persona = json.dumps(state)
    await db.commit()
    await db.refresh(s)
    return _public(s)


class PreviewIn(BaseModel):
    active: str = "default"
    traits: dict | None = None
    nickname: str = ""
    question: str = ""
    name: str = ""
    description: str = ""


class _Fake:
    def __init__(self, persona, system_prompt=""):
        self.persona, self.system_prompt, self.personality = persona, system_prompt, "default"


@router.post("/preview")
async def preview(req: PreviewIn, request: Request, db: AsyncSession = Depends(get_db)):
    """A short sample answer in the chosen personality, before saving anything."""
    user, s = await _ctx(request, db)
    _limit(f"pv:{user.id}", 20, 3600)
    state = load(s)
    trial = {"active": req.active, "traits": req.traits if isinstance(req.traits, dict) else None,
             "nickname": _clean(req.nickname, 40) or state["nickname"], "about": "", "language": state["language"], "customs": list(state["customs"])}
    if req.description.strip():          # previewing a personality that isn't saved yet
        trial["customs"] = trial["customs"] + [{"id": "preview", "name": _clean(req.name, 30) or "My personality", "description": _clean(req.description, 700)}]
        trial["active"] = "custom:preview"
    block = style_block(_Fake(json.dumps(trial)))
    question = _clean(req.question, 200) or "Why is the sky blue?"
    from router_ai import LIGHT_MODEL, _post
    data = await _post({"model": LIGHT_MODEL, "temperature": 0.8, "max_tokens": 220,
                        "messages": [{"role": "system", "content": "You are Zelpophai AI. Answer in at most 70 words.\n" + block},
                                     {"role": "user", "content": question}]}, timeout=25)
    try:
        text = (data["choices"][0]["message"]["content"] or "").strip()
    except Exception:
        text = ""
    try:
        import ai_meter
        ai_meter.record("personality_preview", LIGHT_MODEL, user.id, block + question, text, ok=bool(text))
    except Exception:
        pass
    if not text:
        raise HTTPException(status_code=502, detail="Couldn't make a preview right now. Try again in a moment.")
    return {"text": text[:900], "question": question}
