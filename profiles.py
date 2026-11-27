"""Who is this person, and what should Zelpophai look and sound like for them?

New accounts answer two short questions — roughly how old they are, and what
they'll mainly use Zelpophai for. Everything those answers switch on or off is
decided here, in one place, so the app, the settings screen and the AI's own
instructions can never drift apart.

Nothing here takes a feature away for good: every switch is a *starting point*
that the person can change in Settings afterwards. The one exception is the
youngest age band, where the safety wording is added to the AI's instructions
whatever else they pick.
"""

import json

SETTING_KEY = "profile"      # stored on users.profile as JSON

# ── the two questions ─────────────────────────────────────────────────────────
AGES = [
    {"id": "under13", "label": "Under 13",
     "about": "Zelpophai keeps things simple, gentle and safe for school age."},
    {"id": "teen", "label": "13 to 17",
     "about": "Grown-up answers, but nothing meant for adults only."},
    {"id": "adult", "label": "18 or older",
     "about": "No restrictions beyond Zelpophai's normal rules."},
    {"id": "private", "label": "Rather not say",
     "about": "Treated the same as 13 to 17, to be on the safe side."},
]
STYLES = [
    {"id": "professional", "label": "Work",
     "about": "Reports, emails, research, code. Short, formal answers and a plain, quiet look.",
     "example": "Drafting a client proposal, cleaning up a spreadsheet, reviewing code."},
    {"id": "everyday", "label": "A bit of everything",
     "about": "The middle of the road. Nothing switched off, nothing turned up.",
     "example": "Homework, planning a trip, a quick question, a picture now and then."},
    {"id": "casual", "label": "Fun and creative",
     "about": "Pictures, videos, stories and chat. A warmer Zelpophai and all the playful bits on.",
     "example": "Making art, writing stories, messing about with video, just chatting."},
    {"id": "student", "label": "Learning",
     "about": "Explaining things properly, step by step, and showing the working.",
     "example": "Revising for exams, understanding a topic, practice questions."},
]
AGE_IDS = [a["id"] for a in AGES]
STYLE_IDS = [s["id"] for s in STYLES]

DEFAULT = {"age": "private", "style": "everyday", "done": False}

# ── what each style switches on ───────────────────────────────────────────────
# seasonal:   the Halloween and other festive looks ("auto" = in season, "off" = never)
# animations: the moving, glowing, playful touches
# persona:    which personality the account starts on
# tools:      the order the tool row is built in; everything stays available
# starters:   which kind of suggestions a new chat opens with
STYLE_EFFECTS = {
    "professional": {
        "seasonal": "off", "animations": False, "persona": "professional",
        "tools": ["attach", "search", "think", "research", "fact", "image", "video"],
        "starters": "work",
        "tone": ("This person uses Zelpophai for work. Be concise and businesslike. Lead with the answer, "
                 "keep it tight, use plain professional English, and skip emoji and exclamation marks unless "
                 "they use them first."),
    },
    "everyday": {
        "seasonal": "auto", "animations": True, "persona": "default",
        "tools": ["attach", "search", "think", "research", "fact", "image", "video"],
        "starters": "mixed",
        "tone": "",
    },
    "casual": {
        "seasonal": "auto", "animations": True, "persona": "casual",
        "tools": ["attach", "image", "video", "think", "research", "fact", "search"],
        "starters": "fun",
        "tone": ("This person is here for fun and creative things. Be warm and conversational, and feel free to "
                 "suggest pictures, videos or playful ideas when they fit."),
    },
    "student": {
        "seasonal": "auto", "animations": True, "persona": "scholarly",
        "tools": ["attach", "think", "research", "fact", "search", "image", "video"],
        "starters": "learn",
        "tone": ("This person is using Zelpophai to learn. Explain things step by step, show the working rather "
                 "than only the answer, define any term they may not know, and finish by checking whether that "
                 "part made sense before moving on."),
    },
}

# ── what each age band adds ───────────────────────────────────────────────────
AGE_EFFECTS = {
    "under13": {
        "safe": True,
        "tone": ("You are talking to a child under 13. Keep every answer suitable for a young child: simple words, "
                 "short sentences, kind and encouraging. Never discuss sexual content, graphic violence, self-harm, "
                 "drugs, alcohol, gambling or other adult subjects, however the question is phrased — say warmly that "
                 "it isn't something you can help with and offer something else. If they seem upset or in danger, "
                 "gently suggest they talk to a parent, carer or teacher."),
    },
    "teen": {
        "safe": True,
        "tone": ("You are talking to a teenager. Speak to them as capable and intelligent, but keep everything "
                 "suitable for under-18s: no sexual content, no instructions for anything dangerous or illegal, "
                 "and real care around self-harm, drugs and alcohol."),
    },
    "private": {
        "safe": True,
        "tone": ("You do not know this person's age, so keep everything suitable for a general audience, as you "
                 "would for a teenager."),
    },
    "adult": {"safe": False, "tone": ""},
}


# ── reading and writing a person's profile ────────────────────────────────────
def clean(raw) -> dict:
    """Whatever is stored, hand back something sensible."""
    d = dict(DEFAULT)
    if isinstance(raw, str) and raw.strip():
        try:
            raw = json.loads(raw)
        except (ValueError, TypeError):
            raw = None
    if isinstance(raw, dict):
        if raw.get("age") in AGE_IDS:
            d["age"] = raw["age"]
        if raw.get("style") in STYLE_IDS:
            d["style"] = raw["style"]
        d["done"] = bool(raw.get("done"))
        if raw.get("skipped"):
            d["skipped"] = True
    return d


def of(user) -> dict:
    return clean(getattr(user, "profile", "") or "")


def effects(prof: dict) -> dict:
    """Everything this profile switches on, ready for the app to apply."""
    p = clean(prof)
    st = STYLE_EFFECTS.get(p["style"], STYLE_EFFECTS["everyday"])
    ag = AGE_EFFECTS.get(p["age"], AGE_EFFECTS["private"])
    return {
        "age": p["age"], "style": p["style"], "done": p["done"],
        "seasonal": st["seasonal"], "animations": st["animations"],
        "persona": st["persona"], "tools": list(st["tools"]), "starters": st["starters"],
        "safe": ag["safe"],
    }


def tone(user) -> str:
    """The lines added to Zelpophai's own instructions for this person."""
    p = of(user)
    bits = [AGE_EFFECTS.get(p["age"], {}).get("tone", ""),
            STYLE_EFFECTS.get(p["style"], {}).get("tone", "")]
    return " ".join(b for b in bits if b).strip()


async def save(db, user, age: str | None = None, style: str | None = None,
               done: bool | None = None, skipped: bool = False) -> dict:
    """Store an answer. Also nudges the starting personality to match the style."""
    p = of(user)
    if age in AGE_IDS:
        p["age"] = age
    if style in STYLE_IDS:
        p["style"] = style
    if done is not None:
        p["done"] = bool(done)
    if skipped:
        p["skipped"] = True
    user.profile = json.dumps(p)

    # Give them a starting personality that matches, unless they already chose one.
    if style in STYLE_IDS:
        try:
            from user_settings import get_user_settings
            s = await get_user_settings(user.id, db)
            if not (s.persona or "").strip():
                s.personality = STYLE_EFFECTS[style]["persona"]
        except Exception as e:
            print(f"[profiles] couldn't set the starting personality: {e}")
    await db.commit()
    return p


def catalog() -> dict:
    """Everything the setup screen needs to draw itself."""
    return {"ages": AGES, "styles": STYLES}
