"""Every daily allowance in one place, editable from the Vault (System → Limits).

Numbers live in `system_settings["limits_json"]` and sit on top of the defaults below, so a change
takes effect straight away without a new release. 0 means "not allowed", and an empty box in the
Vault means "no limit".

Plans, from smallest to largest: guest, free, pro, ultimate, friend, admin, trusted, owner.
"""

import json
from datetime import datetime, timedelta, timezone

SETTING_KEY = "limits_json"

PLANS = ["guest", "free", "pro", "ultimate", "friend", "admin", "trusted", "owner"]
PLAN_LABELS = {
    "guest": "Guest", "free": "Free", "pro": "Pro", "ultimate": "Ultimate",
    "friend": "Friend", "admin": "Admin", "trusted": "Trusted admin", "owner": "Owner",
}
PLAN_ABOUT = {
    "guest": "Trying Zelpophai without an account.",
    "free": "A free account.",
    "pro": "Paying for Pro, or on a trial or invite reward.",
    "ultimate": "Paying for Ultimate, or gifted it.",
    "friend": "People you tagged as a Friend.",
    "admin": "Your admins.",
    "trusted": "Admins you marked as Trusted.",
    "owner": "You. Nothing is ever limited.",
}

# key, label, what it counts, the action that spends it
FIELDS = [
    ("messages", "Messages a day", "Every message sent to the AI. Pictures and files count as messages too."),
    ("images", "Pictures a day", "Pictures the AI draws."),
    ("files", "Files a day", "Files uploaded, read, written or edited."),
    ("videos", "Videos a day", "Short videos the AI makes. These cost real money per second."),
    ("mini", "Mini tasks a day", "Jobs given to Zelpophai Mini on a Windows PC."),
    ("coding", "Coding AGT. requests a day", "Times the coding agent is asked to write or fix code."),
    ("cooldown", "Pause after running out (minutes)", "How long someone waits once they've used everything up."),
]
FIELD_KEYS = [f[0] for f in FIELDS]

# None = no limit
DEFAULTS = {
    "guest":    {"messages": 20,   "images": 2,   "files": 3,   "videos": 0,  "mini": 0, "coding": 2,     "cooldown": 30},
    "free":     {"messages": 50,   "images": 3,   "files": 5,   "videos": 0,  "mini": 15, "coding": 5,    "cooldown": 60},
    "pro":      {"messages": 600,  "images": 50,  "files": 100, "videos": 3,  "mini": 300, "coding": 60,   "cooldown": 20},
    "ultimate": {"messages": None, "images": 200, "files": 300, "videos": 10, "mini": 2000, "coding": 300,  "cooldown": 10},
    "friend":   {"messages": None, "images": 100, "files": 150, "videos": 15, "mini": 3000, "coding": 300,  "cooldown": 10},
    "admin":    {"messages": None, "images": 150, "files": 200, "videos": 20, "mini": 5000, "coding": 500,  "cooldown": 10},
    "trusted":  {"messages": None, "images": 300, "files": 400, "videos": 30, "mini": 10000, "coding": 1000, "cooldown": 5},
    "owner":    {"messages": None, "images": None, "files": None, "videos": None, "mini": None, "coding": None, "cooldown": 0},
}

_cache = {"data": None, "at": 0.0}
_TTL = 20.0     # seconds; a Vault save clears it straight away


def _clean(raw) -> dict:
    """Keep only plans and fields we know, and only sensible numbers."""
    out = {p: dict(v) for p, v in DEFAULTS.items()}
    if not isinstance(raw, dict):
        return out
    for plan, vals in raw.items():
        if plan not in out or not isinstance(vals, dict):
            continue
        for k, v in vals.items():
            if k not in FIELD_KEYS:
                continue
            if v is None or v == "":
                out[plan][k] = None if k != "cooldown" else 0
                continue
            try:
                n = int(v)
            except (TypeError, ValueError):
                continue
            out[plan][k] = max(0, min(1_000_000, n))
    # the Owner is never limited, whatever is saved
    out["owner"] = dict(DEFAULTS["owner"])
    return out


async def load(db=None) -> dict:
    """The numbers in force right now."""
    import time
    if _cache["data"] is not None and (time.time() - _cache["at"]) < _TTL:
        return _cache["data"]
    raw = None
    try:
        from database import async_session
        from global_controls import _get_setting
        if db is not None:
            txt = await _get_setting(db, SETTING_KEY, "")
        else:
            async with async_session() as s:
                txt = await _get_setting(s, SETTING_KEY, "")
        raw = json.loads(txt) if txt else None
    except Exception:
        raw = None
    data = _clean(raw)
    _cache["data"], _cache["at"] = data, time.time()
    return data


async def save(db, partial: dict) -> dict:
    """Store what the Owner typed and use it immediately."""
    import time
    from global_controls import _set_setting
    current = await load(db)
    merged = {p: dict(v) for p, v in current.items()}
    for plan, vals in (partial or {}).items():
        if plan in merged and isinstance(vals, dict):
            merged[plan].update(vals)
    data = _clean(merged)
    await _set_setting(db, SETTING_KEY, json.dumps({p: data[p] for p in PLANS if p != "owner"}))
    _cache["data"], _cache["at"] = data, time.time()
    return data


def forget():
    _cache["data"], _cache["at"] = None, 0.0


def plan_of(user) -> str:
    """Which set of numbers this person falls under. The biggest one they qualify for wins."""
    from auth import get_role, is_trusted
    from limits import _is_guest, _is_pro, _is_ultimate
    if user is None:
        return "guest"
    if _is_guest(user):
        return "guest"
    role = get_role(user)
    if role == "owner":
        return "owner"
    if role == "admin":
        return "trusted" if is_trusted(user) else "admin"
    tags = (getattr(user, "tags", "") or "").lower().split(",")
    if "friend" in tags:
        return "friend"
    if _is_ultimate(user):
        return "ultimate"
    if _is_pro(user):
        return "pro"
    return "free"


async def allowance(user, key: str, db=None):
    """How many of `key` this person gets a day. None = no limit."""
    data = await load(db)
    return data.get(plan_of(user), DEFAULTS["free"]).get(key)


def resets_at() -> str:
    """When everything starts again (midnight UTC), as an ISO time."""
    now = datetime.now(timezone.utc)
    return (now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).isoformat()


def catalog() -> dict:
    """Everything the Vault page needs to draw itself."""
    return {
        "plans": [{"id": p, "label": PLAN_LABELS[p], "about": PLAN_ABOUT[p], "locked": p == "owner"} for p in PLANS],
        "fields": [{"key": k, "label": lbl, "about": ab} for k, lbl, ab in FIELDS],
        "defaults": DEFAULTS,
    }
