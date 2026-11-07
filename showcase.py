"""Welcome-page preview made of real Zelpophai output.

- image / video: real files made in Zelpophai. Defaults ship in
  static/showcase/; the Owner can feature any image or video they made with
  "Show on welcome page" in a chat (POST /api/showcase).
- doc: a real cover letter built by the app's own document generator.
- news: today's top headlines, found with a web-search model and written in our
  own words, refreshed at most every 6 hours (one AI call for all visitors).
"""

import asyncio
import json
import os
import re
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth import get_current_user_from_cookie, is_owner
from database import get_db

router = APIRouter(prefix="/api/showcase", tags=["showcase"])

OR_BASE = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
NEWS_MODEL = os.getenv("SHOWCASE_NEWS_MODEL", "perplexity/sonar")
NEWS_TTL = 6 * 3600
SRC_RE = {
    "image": re.compile(r"^/api/image/serve/[A-Za-z0-9_.\-]{1,120}$"),
    "video": re.compile(r"^/api/video/serve/vid_[0-9a-f]{16}\.mp4$"),
}
DEFAULTS = {
    "image": {"src": "/static/showcase/lighthouse_dusk.jpg", "prompt": "Make an image of a lighthouse on a cliff at dusk",
              "caption": "lighthouse_dusk.jpg · made in Zelpophai"},
    "video": None,
    "doc": {"src": "/static/showcase/Cover_Letter.docx", "name": "Cover_Letter.docx",
            "prompt": "Write a short cover letter for a junior designer job"},
}

_news = {"items": None, "at": 0.0}
_news_lock = asyncio.Lock()


def _file():
    try:
        from appdist import _dir
        return _dir() / "showcase.json"
    except Exception:
        return None


def _load() -> dict:
    f = _file()
    if f and f.is_file():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save(data: dict):
    f = _file()
    if not f:
        raise HTTPException(status_code=500, detail="No storage for the showcase")
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(data), encoding="utf-8")
    os.replace(tmp, f)


async def _refresh_news():
    if _news_lock.locked():
        return
    async with _news_lock:
        if _news["items"] is not None and time.time() - _news["at"] < NEWS_TTL:
            return
        from ai import _get_openrouter_keys
        keys = _get_openrouter_keys()
        if not keys:
            return
        today = datetime.now(timezone.utc).strftime("%A %d %B %Y")
        prompt = (f"Today is {today}. Search the web for the 3 most important world news stories of the last 24 hours. "
                  "Reply with ONLY JSON: {\"items\":[{\"title\":\"short headline in your own words, max 12 words\","
                  "\"summary\":\"one sentence in your own words, max 25 words\",\"source\":\"publication name\","
                  "\"url\":\"https link to the article\"}]}. No other text. Keep it neutral and factual.")
        for key in keys:
            try:
                async with httpx.AsyncClient(timeout=60) as c:
                    r = await c.post(f"{OR_BASE}/chat/completions",
                                     headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                                     json={"model": NEWS_MODEL, "max_tokens": 700, "temperature": 0.2,
                                           "messages": [{"role": "user", "content": prompt}]})
                if r.status_code != 200:
                    continue
                text = (r.json().get("choices") or [{}])[0].get("message", {}).get("content") or ""
                m = re.search(r"\{.*\}", text, re.S)
                data = json.loads(m.group(0)) if m else {}
                items = []
                for it in (data.get("items") or [])[:3]:
                    title = str(it.get("title", "")).strip()[:120]
                    url = str(it.get("url", "")).strip()
                    if not title or not re.match(r"^https://[^\s\"'<>]{4,400}$", url):
                        continue
                    items.append({"title": title, "summary": str(it.get("summary", "")).strip()[:220],
                                  "source": str(it.get("source", "")).strip()[:60], "url": url})
                if items:
                    _news.update(items=items, at=time.time())
                    return
            except Exception:
                continue
        # Don't hammer the AI if it failed: try again in 30 minutes.
        _news["at"] = time.time() - NEWS_TTL + 1800


@router.get("")
async def get_showcase():
    saved = _load()
    out = {k: (saved.get(k) or DEFAULTS[k]) for k in ("image", "video", "doc")}
    if _news["items"] is None or time.time() - _news["at"] > NEWS_TTL:
        asyncio.create_task(_refresh_news())
    out["news"] = ({"items": _news["items"], "at": datetime.fromtimestamp(_news["at"], timezone.utc).isoformat()}
                   if _news["items"] else None)
    return out


class FeatureIn(BaseModel):
    kind: str
    src: str = ""
    prompt: str = ""
    clear: bool = False


@router.post("")
async def feature(req: FeatureIn, request: Request, db=Depends(get_db)):
    """Owner only: show one of their images or videos on the welcome page."""
    user = await get_current_user_from_cookie(request, db)
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    if req.kind not in SRC_RE:
        raise HTTPException(status_code=400, detail="Only images and videos can be featured")
    data = _load()
    if req.clear:
        data.pop(req.kind, None)
        _save(data)
        return {"ok": True, "cleared": True}
    src = (req.src or "").strip()
    if not SRC_RE[req.kind].match(src):
        raise HTTPException(status_code=400, detail="That file can't be featured")
    prompt = re.sub(r"\s+", " ", req.prompt or "").strip()[:200]
    name = src.rsplit("/", 1)[-1]
    data[req.kind] = {"src": src, "prompt": prompt or ("Make a short video" if req.kind == "video" else "Make an image"),
                      "caption": name + " · made in Zelpophai"}
    _save(data)
    return {"ok": True, req.kind: data[req.kind]}
