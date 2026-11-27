"""Live pages: small working web pages Zelpophai builds in a chat.

The AI writes <zpage title="…">…html…</zpage>. In the chat it opens in a side
panel inside a sandboxed frame. When the owner presses Share, the page is saved
here and gets its own address, /p/<slug>.

Safety is the whole design. A page is AI-written HTML and JavaScript, so it is
treated as untrusted:
  * In the chat it runs in <iframe sandbox="allow-scripts …"> WITHOUT
    allow-same-origin, so it gets a throw-away origin of its own.
  * At /p/<slug> the server sends `Content-Security-Policy: sandbox …`, which
    does the same thing for a page opened directly: the browser treats it as
    coming from nowhere, so it cannot read the zelpophai.com sign-in cookie,
    call the API as the visitor, or touch anything else on the site.
"""

import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user_from_cookie
from database import LivePage, get_db

router = APIRouter(tags=["live-pages"])

MAX_BYTES = 600_000          # a generous page; anything bigger isn't a "small tool"
MAX_PER_USER = 200           # shared pages one person can keep

# The browser sandbox for a shared page: scripts and forms work, popups open in a
# new tab, but the page has no origin of its own — so no cookies, no storage of
# ours, no same-site requests. `allow-modals` lets a quiz use alert()/confirm().
SANDBOX = "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"


def _clean_html(html: str) -> str:
    """Make sure what we store is a whole page."""
    h = (html or "").strip()
    # The AI sometimes wraps the page in a ``` fence.
    h = re.sub(r"^```[a-zA-Z]*\s*\n", "", h)
    h = re.sub(r"\n```\s*$", "", h)
    if "<html" not in h.lower():
        h = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
             '<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'
             + h + "</body></html>")
    return h


class PageIn(BaseModel):
    title: str = ""
    html: str
    chat_id: int | None = None


@router.post("/api/pages")
async def share_page(body: PageIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Save a page and give it a link anyone can open."""
    user = await get_current_user_from_cookie(request, db)
    if (getattr(user, "username", "") or "").startswith("guest_"):
        raise HTTPException(status_code=403, detail="Create a free account to share pages.")
    html = _clean_html(body.html)
    if len(html.encode("utf-8")) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="This page is too big to share.")
    count = (await db.execute(select(func.count()).select_from(LivePage).where(LivePage.user_id == user.id))).scalar() or 0
    if count >= MAX_PER_USER:
        raise HTTPException(status_code=429, detail=f"You've shared {MAX_PER_USER} pages. Delete some to share more.")
    # Sharing the same page twice gives the same link instead of a duplicate.
    same = (await db.execute(select(LivePage).where(LivePage.user_id == user.id, LivePage.html == html))).scalars().first()
    if same:
        return {"slug": same.slug, "url": f"/p/{same.slug}", "title": same.title}
    page = LivePage(slug=secrets.token_urlsafe(9).replace("-", "x").replace("_", "z"),
                    user_id=user.id, chat_id=body.chat_id,
                    title=(body.title or "Page").strip()[:120], html=html)
    db.add(page)
    await db.commit()
    return {"slug": page.slug, "url": f"/p/{page.slug}", "title": page.title}


@router.get("/api/pages")
async def my_pages(request: Request, db: AsyncSession = Depends(get_db)):
    """The pages this person has shared."""
    user = await get_current_user_from_cookie(request, db)
    rows = (await db.execute(select(LivePage).where(LivePage.user_id == user.id)
                             .order_by(LivePage.created_at.desc()).limit(MAX_PER_USER))).scalars().all()
    return {"pages": [{"slug": p.slug, "url": f"/p/{p.slug}", "title": p.title, "views": p.views or 0,
                       "created_at": p.created_at.isoformat() if p.created_at else ""} for p in rows]}


@router.delete("/api/pages/{slug}")
async def unshare_page(slug: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Stop sharing a page. Its link stops working straight away."""
    user = await get_current_user_from_cookie(request, db)
    page = (await db.execute(select(LivePage).where(LivePage.slug == slug))).scalar_one_or_none()
    if not page or page.user_id != user.id:
        raise HTTPException(status_code=404, detail="Page not found.")
    await db.delete(page)
    await db.commit()
    return {"ok": True}


def _not_found() -> HTMLResponse:
    return HTMLResponse(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Page not found</title><body style="font:16px system-ui;padding:48px 20px;text-align:center;'
        'background:#0b1020;color:#e6ebff"><h1 style="font-size:22px">This page isn\'t shared any more</h1>'
        '<p style="opacity:.75">Whoever made it may have stopped sharing it.</p>'
        '<p><a style="color:#8ab4ff" href="https://zelpophai.com">Make your own with Zelpophai</a></p>',
        status_code=404)


@router.get("/p/{slug}", response_class=HTMLResponse, include_in_schema=False)
async def view_page(slug: str, db: AsyncSession = Depends(get_db)):
    """Show a shared page — always inside the browser's sandbox."""
    if not re.fullmatch(r"[A-Za-z0-9]{6,24}", slug or ""):
        return _not_found()
    page = (await db.execute(select(LivePage).where(LivePage.slug == slug))).scalar_one_or_none()
    if not page:
        return _not_found()
    try:
        page.views = (page.views or 0) + 1
        await db.commit()
    except Exception:
        pass
    return HTMLResponse(page.html, headers={
        "Content-Security-Policy": SANDBOX,
        "X-Robots-Tag": "noindex, nofollow",          # people's own pages aren't for search engines
        "Cache-Control": "private, max-age=60",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
    })
