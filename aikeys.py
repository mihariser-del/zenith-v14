"""The AI keys Zelpophai uses to talk to OpenRouter.

Keys are kept encrypted in the database (system_settings["openrouter_keys_enc"]) so the Owner can
change them from the Vault without touching Railway or the code — and so they are never in the
repository. A key set in Railway (OPENROUTER_API_KEY / OPENROUTER_API_KEYS) still works as a fallback.

`current()` is deliberately synchronous and cheap: the AI calls it on every message.
"""

import asyncio
import os
import time

SETTING_KEY = "openrouter_keys_enc"
STATUS_KEY = "openrouter_key_status"

# Filled at startup and whenever the Owner saves. Empty list = fall back to Railway.
_keys: list[str] = []
_loaded = False
_last_fail = {"at": 0.0, "detail": ""}


def mask(key: str) -> str:
    k = (key or "").strip()
    if len(k) < 14:
        return "•" * len(k)
    return f"{k[:11]}…{k[-4:]}"


def env_keys() -> list[str]:
    raw = os.getenv("OPENROUTER_API_KEYS") or os.getenv("OPENROUTER_API_KEY") or ""
    return [k.strip() for k in raw.split(",") if k.strip()]


def current() -> list[str]:
    """The keys to use right now: the Owner's saved ones first, else Railway's."""
    return list(_keys) if _keys else env_keys()


def source() -> str:
    return "vault" if _keys else ("railway" if env_keys() else "none")


def note_failure(status_code: int, body: str):
    """Remember the last refusal so the Vault can explain what OpenRouter said."""
    if status_code in (401, 403):
        _last_fail["at"] = time.time()
        _last_fail["detail"] = (body or "")[:200]


async def load(db=None) -> list[str]:
    """Read the saved keys out of the database into memory."""
    global _keys, _loaded
    from database import async_session, decrypt_pending_password
    from global_controls import _get_setting
    try:
        if db is not None:
            blob = await _get_setting(db, SETTING_KEY, "")
        else:
            async with async_session() as s:
                blob = await _get_setting(s, SETTING_KEY, "")
        raw = decrypt_pending_password(blob) if blob else ""
        _keys = [k.strip() for k in raw.split(",") if k.strip()]
    except Exception as e:
        print(f"[aikeys] could not read the saved key: {e}")
        _keys = []
    _loaded = True
    return _keys


async def save(db, keys: list[str]) -> list[str]:
    """Store the Owner's keys (encrypted) and start using them at once."""
    global _keys
    from database import encrypt_pending_password
    from global_controls import _set_setting
    clean = [k.strip() for k in (keys or []) if k and k.strip()]
    blob = encrypt_pending_password(",".join(clean)) if clean else ""
    await _set_setting(db, SETTING_KEY, blob)
    _keys = clean
    _last_fail["at"], _last_fail["detail"] = 0.0, ""
    return clean


async def check(key: str) -> dict:
    """Ask OpenRouter whether a key is good, and what credit is on it."""
    import httpx
    k = (key or "").strip()
    if not k:
        return {"ok": False, "error": "No key given."}
    if not k.startswith("sk-or-"):
        return {"ok": False, "error": "That doesn't look like an OpenRouter key — they start with “sk-or-”."}
    base = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"{base}/key", headers={"Authorization": f"Bearer {k}"})
    except Exception as e:
        return {"ok": False, "error": f"Couldn't reach OpenRouter just now ({type(e).__name__}). Try again in a minute."}
    if r.status_code in (401, 403):
        return {"ok": False, "error": "OpenRouter doesn't recognise this key. Check you copied all of it, and that it still exists in your OpenRouter account."}
    if r.status_code != 200:
        return {"ok": False, "error": f"OpenRouter answered {r.status_code}. Try again in a minute."}
    try:
        d = (r.json() or {}).get("data") or {}
    except Exception:
        d = {}
    limit, used = d.get("limit"), d.get("usage")
    left = None
    if isinstance(limit, (int, float)) and isinstance(used, (int, float)):
        left = max(0.0, float(limit) - float(used))
    return {"ok": True, "free_tier": bool(d.get("is_free_tier")), "used": used,
            "limit": limit, "left": left, "label": d.get("label") or ""}


async def status(db=None) -> dict:
    """Everything the Vault's AI key card shows."""
    if not _loaded:
        await load(db)
    keys = current()
    out = {"source": source(), "count": len(keys), "masked": [mask(k) for k in keys],
           "env_count": len(env_keys()), "working": None, "error": "", "credit": None, "free_tier": None}
    if not keys:
        out["error"] = "No AI key is set, so Zelpophai can't answer anyone."
        return out
    res = await check(keys[0])
    out["working"] = bool(res.get("ok"))
    if res.get("ok"):
        out["credit"] = res.get("left")
        out["free_tier"] = res.get("free_tier")
    else:
        out["error"] = res.get("error", "")
    if _last_fail["at"] and time.time() - _last_fail["at"] < 3600:
        out["recent_refusal"] = _last_fail["detail"]
    return out


async def warm():
    """Load the saved keys when Zelpophai starts, and say in the log what it found."""
    await load()
    src = source()
    if src == "vault":
        print(f"[aikeys] using the key saved in the Vault ({mask(current()[0])}).")
    elif src == "railway":
        print(f"[aikeys] using OPENROUTER_API_KEY from the server settings ({mask(current()[0])}).")
    else:
        print("[aikeys] NO AI key is set — Zelpophai cannot answer messages. Add one in the Vault: Settings → AI key.")
    await asyncio.sleep(0)
