"""Counts what every AI call costs, for the Vault's "AI cost & usage" page.

record(feature, model, user_id, prompt, output) estimates tokens from text
length (≈4 characters per token) and prices them with OpenRouter's public price
list (refreshed every 12 h). It never slows a reply down: the database write
runs in the background and any failure is ignored.

credits() reads how much OpenRouter credit is left (cached 5 min).
"""

import asyncio
import json
import os
import time

import httpx

OR_BASE = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
VIDEO_COST_PER_SECOND = float(os.getenv("VIDEO_COST_PER_SECOND", "0.10"))

_prices = {"at": 0.0, "map": {}}
_credits = {"at": 0.0, "data": None}
_lock = asyncio.Lock()


def _chars(x) -> int:
    if x is None:
        return 0
    if isinstance(x, str):
        return len(x)
    if isinstance(x, (list, tuple)):
        return sum(_chars(i) for i in x)
    if isinstance(x, dict):
        if x.get("type") in ("image_url", "input_audio"):
            return 3000           # images / audio: a rough flat size
        return sum(_chars(v) for k, v in x.items() if k in ("content", "text"))
    return len(str(x))


async def _load_prices():
    if time.time() - _prices["at"] < 12 * 3600 and _prices["map"]:
        return _prices["map"]
    async with _lock:
        if time.time() - _prices["at"] < 12 * 3600 and _prices["map"]:
            return _prices["map"]
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.get("https://openrouter.ai/api/v1/models")
            m = {}
            for it in (r.json().get("data") or []) if r.status_code == 200 else []:
                p = it.get("pricing") or {}
                try:
                    m[it["id"]] = (float(p.get("prompt") or 0), float(p.get("completion") or 0), float(p.get("request") or 0))
                except Exception:
                    continue
            if m:
                _prices.update(at=time.time(), map=m)
        except Exception:
            _prices["at"] = time.time() - 11 * 3600   # retry in about an hour
    return _prices["map"]


def price_of(model: str, in_tok: int, out_tok: int) -> float:
    p = _prices["map"].get(model) or _prices["map"].get((model or "").split(":")[0])
    if not p:
        return 0.0
    return in_tok * p[0] + out_tok * p[1] + p[2]


async def _write(feature, model, user_id, in_tok, out_tok, cost, ok):
    try:
        await _load_prices()
        if cost is None:
            cost = price_of(model, in_tok, out_tok)
        from database import AiUsage, async_session
        async with async_session() as db:
            db.add(AiUsage(user_id=user_id, feature=feature[:30], model=(model or "")[:100], in_tokens=int(in_tok),
                           out_tokens=int(out_tok), cost=float(cost or 0), ok=bool(ok)))
            await db.commit()
    except Exception as e:
        print(f"[ai_meter] {type(e).__name__}: {e}")


def record(feature: str, model: str, user_id=None, prompt=None, output=None, *, cost=None, ok=True,
           in_tokens=None, out_tokens=None):
    """Log one AI call in the background (never raises)."""
    try:
        it = in_tokens if in_tokens is not None else max(1, _chars(prompt) // 4)
        ot = out_tokens if out_tokens is not None else _chars(output) // 4
        asyncio.get_running_loop().create_task(_write(feature, model, user_id, it, ot, cost, ok))
    except Exception:
        pass


def record_video(user_id, model, seconds):
    record("video", model, user_id, cost=VIDEO_COST_PER_SECOND * float(seconds or 0), in_tokens=0, out_tokens=0)


async def credits():
    """{"total": $, "used": $, "left": $} from OpenRouter, or None."""
    if time.time() - _credits["at"] < 300:
        return _credits["data"]
    from ai import _get_openrouter_keys
    keys = _get_openrouter_keys()
    data = None
    if keys:
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(f"{OR_BASE}/credits", headers={"Authorization": f"Bearer {keys[0]}"})
            if r.status_code == 200:
                d = r.json().get("data") or {}
                total, used = float(d.get("total_credits") or 0), float(d.get("total_usage") or 0)
                data = {"total": round(total, 4), "used": round(used, 4), "left": round(total - used, 4)}
        except Exception:
            data = None
    _credits.update(at=time.time(), data=data)
    return data
