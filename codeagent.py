"""Coding AGT. — projects and the AI coding agent.

Projects are small sets of text files saved per user. Code never runs on this
server: websites run in a sandboxed browser frame, Python in Pyodide
(WebAssembly) and SQL in sql.js — all inside the visitor's own browser. The
desktop app can additionally run code on the user's own computer.

The agent streams an answer and proposes file changes as
<zfile name="path/to/file">full new content</zfile> blocks; the page shows
them as changes the user can apply or reject.
"""

import json
import os
import re
import secrets
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user_from_cookie, get_role
from database import CodeProject, UsageLog, async_session, get_db
from limits import _is_guest, _is_pro, _is_ultimate

router = APIRouter(prefix="/api/code", tags=["code-agent"])

OR_BASE = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
MODEL = os.getenv("CODE_AGENT_MODEL", "openai/gpt-6-sol")
MODEL_FREE = os.getenv("CODE_AGENT_MODEL_FREE", "openai/gpt-6-luna")
DAILY = {
    "guest": int(os.getenv("CODE_AGENT_DAILY_GUEST", "2")),
    "free": int(os.getenv("CODE_AGENT_DAILY_FREE", "5")),
    "pro": int(os.getenv("CODE_AGENT_DAILY_PRO", "60")),
    "max": int(os.getenv("CODE_AGENT_DAILY_MAX", "200")),
    "owner": 10**9,          # the Owner has no daily limit
}
MAX_FILES = 60
MAX_FILE_CHARS = 200_000
MAX_PROJECT_CHARS = 1_500_000
MAX_PROJECTS = 40
PATH_RE = re.compile(r"^[\w\-. ()]+(/[\w\-. ()]+)*$")


def _tier(user) -> str:
    if _is_guest(user):
        return "guest"
    if get_role(user) == "owner":
        return "owner"
    tags = (getattr(user, "tags", "") or "").lower().split(",")
    if get_role(user) in ("owner", "admin") or _is_ultimate(user) or "friend" in tags:
        return "max"
    if _is_pro(user):
        return "pro"
    return "free"


async def _used_today(db, user_id) -> int:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    q = select(func.count()).select_from(UsageLog).where(
        UsageLog.user_id == user_id, UsageLog.action == "code_agent", UsageLog.created_at >= start)
    return (await db.execute(q)).scalar() or 0


def _clean_files(files) -> dict:
    if not isinstance(files, dict):
        raise HTTPException(status_code=400, detail="files must be an object")
    out, total = {}, 0
    for path, content in list(files.items())[:MAX_FILES]:
        path = str(path).strip().strip("/").replace("\\", "/")
        if not path or len(path) > 120 or ".." in path or not PATH_RE.match(path):
            raise HTTPException(status_code=400, detail=f"Bad file name: {path[:60]}")
        content = str(content or "")
        if len(content) > MAX_FILE_CHARS:
            raise HTTPException(status_code=400, detail=f"{path} is too big (max {MAX_FILE_CHARS // 1000} KB)")
        total += len(content)
        out[path] = content
    if total > MAX_PROJECT_CHARS:
        raise HTTPException(status_code=400, detail="This project is too big to save (max ~1.5 MB of code)")
    return out


def _project_out(p: CodeProject, full=True) -> dict:
    d = {"id": p.id, "name": p.name, "kind": p.kind,
         "updated_at": p.updated_at.isoformat() if p.updated_at else None,
         "share_id": p.share_id}
    if full:
        try:
            d["files"] = json.loads(p.files or "{}")
        except Exception:
            d["files"] = {}
    return d


# ─────────────────────────────────────────────── info / limits ──
@router.get("/agent/status")
async def agent_status(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    tier = _tier(user)
    limit = DAILY[tier]
    used = await _used_today(db, user.id)
    return {"tier": tier, "limit": limit, "used": used, "left": max(0, limit - used),
            "guest": tier == "guest", "free": tier in ("guest", "free"),
            "model": MODEL_FREE if tier in ("guest", "free") else MODEL}


# ─────────────────────────────────────────────────── projects ──
class ProjectIn(BaseModel):
    name: str = "Untitled project"
    kind: str = "web"
    files: dict = {}


@router.get("/projects")
async def list_projects(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    rows = (await db.execute(select(CodeProject).where(CodeProject.user_id == user.id)
                             .order_by(CodeProject.updated_at.desc()))).scalars().all()
    return {"projects": [_project_out(p, full=False) for p in rows]}


@router.post("/projects")
async def create_project(req: ProjectIn, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if _is_guest(user):
        raise HTTPException(status_code=403, detail="Log in to save projects — guests can still try code here without saving.")
    n = (await db.execute(select(func.count()).select_from(CodeProject).where(CodeProject.user_id == user.id))).scalar() or 0
    if n >= MAX_PROJECTS:
        raise HTTPException(status_code=400, detail=f"You can keep up to {MAX_PROJECTS} projects. Delete an old one first.")
    files = _clean_files(req.files)
    p = CodeProject(user_id=user.id, name=(req.name or "Untitled project").strip()[:80] or "Untitled project",
                    kind=(req.kind or "web")[:20], files=json.dumps(files))
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return _project_out(p)


async def _own(db, user, pid) -> CodeProject:
    p = (await db.execute(select(CodeProject).where(CodeProject.id == pid, CodeProject.user_id == user.id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.get("/projects/{pid}")
async def get_project(pid: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    return _project_out(await _own(db, user, pid))


@router.put("/projects/{pid}")
async def save_project(pid: int, req: ProjectIn, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    p = await _own(db, user, pid)
    p.files = json.dumps(_clean_files(req.files))
    p.name = (req.name or p.name).strip()[:80] or p.name
    p.kind = (req.kind or p.kind)[:20]
    p.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "updated_at": p.updated_at.isoformat()}


@router.delete("/projects/{pid}")
async def delete_project(pid: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    p = await _own(db, user, pid)
    await db.delete(p)
    await db.commit()
    return {"ok": True}


@router.post("/projects/{pid}/share")
async def share_project(pid: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    p = await _own(db, user, pid)
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    if isinstance(body, dict) and body.get("off"):
        p.share_id = None
    elif not p.share_id:
        p.share_id = secrets.token_hex(12)
    await db.commit()
    return {"share_id": p.share_id, "url": f"/code/{p.share_id}" if p.share_id else None}


@router.get("/shared/{share_id}")
async def get_shared_project(share_id: str):
    async with async_session() as db:
        p = (await db.execute(select(CodeProject).where(CodeProject.share_id == share_id[:64]))).scalar_one_or_none()
        if not p:
            raise HTTPException(status_code=404, detail="This project isn't shared")
        d = _project_out(p)
        d.pop("share_id", None)
        return d


# ────────────────────────────────────────────────────── agent ──
SYSTEM = """You are Zelpophai Coding AGT., an expert software engineer working inside a small
browser-based code workspace (made by Wanzu Ibrahim for Zelpophai AI).

What the workspace can run (all inside the user's browser):
- Web projects: index.html + CSS + JavaScript files, shown live in a Preview panel. Files are linked
  normally (<link href="style.css">, <script src="script.js">). No server, no npm/build step; load
  libraries from a CDN (cdnjs.cloudflare.com or cdn.jsdelivr.net) if needed.
- Python via Pyodide (Python 3.12 in WebAssembly): the standard library plus numpy, pandas, matplotlib
  (plots show in the console panel), scipy, etc. No input(), no network sockets, no threads, no pip
  packages that need native code. main.py is the entry point; other .py files can be imported.
- SQL via SQLite (sql.js): .sql files run against an in-memory database.
- Other languages (Java, C++, Go, Rust…) can be written and downloaded but only run in the Zelpophai
  desktop app or on the user's own computer — say so when relevant.

How to change files: write the COMPLETE new content of every file you create or change, each in its
own block:
<zfile name="path/file.ext">
...entire file content...
</zfile>
- Never write partial files, "..." or "rest unchanged" — the block replaces the whole file.
- Only include files that change. To delete a file write <zfile name="path" delete="true"></zfile>.
- Don't wrap the blocks in code fences. Keep file names short and relative (e.g. "js/app.js").
- Before the blocks, explain briefly (2-5 short lines) what you're doing; after them, one line on how
  to run or test it. For questions that need no code changes, just answer (use ``` fences for snippets).
- When the user pastes an error, find the real cause, explain it in one or two lines and fix it.
- Write clean, modern, well-structured code with short helpful comments. Make web pages look good
  (responsive, accessible, nice colours) unless told otherwise."""


class AgentIn(BaseModel):
    message: str
    files: dict = {}
    active: str = ""
    history: list = []
    console: str = ""
    selection: str = ""


def _files_block(files: dict, active: str) -> str:
    parts, budget = [], 90_000
    order = ([active] if active in files else []) + [p for p in files if p != active]
    for path in order:
        content = files[path]
        if len(content) > 30_000:
            content = content[:30_000] + "\n... (truncated)"
        chunk = f'<file name="{path}">\n{content}\n</file>'
        if budget - len(chunk) < 0:
            parts.append(f'<file name="{path}" note="not shown — too long"></file>')
            continue
        budget -= len(chunk)
        parts.append(chunk)
    return "\n".join(parts) or "(the project is empty)"


@router.post("/agent")
async def agent(req: AgentIn, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    tier = _tier(user)
    limit = DAILY[tier]
    used = await _used_today(db, user.id)
    if used >= limit:
        msg = ("You've used today's AI coding requests on the website. "
               + ("Log in for more, or get the desktop app." if tier == "guest" else
                  "They reset at midnight (UTC). Upgrade for more, or get the Zelpophai desktop app."))
        raise HTTPException(status_code=429, detail=msg)
    text = (req.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Tell the agent what you want")
    files = _clean_files(req.files or {})
    db.add(UsageLog(user_id=user.id, action="code_agent"))
    await db.commit()
    left = max(0, limit - used - 1)

    context = f"PROJECT FILES (active file: {req.active or 'none'}):\n{_files_block(files, req.active)}"
    if (req.selection or "").strip():
        context += f"\n\nTHE USER HAS SELECTED THIS CODE IN {req.active}:\n{req.selection[:6000]}"
    if (req.console or "").strip():
        context += f"\n\nLATEST CONSOLE OUTPUT / ERRORS:\n{req.console[-6000:]}"
    messages = [{"role": "system", "content": SYSTEM}]
    for h in (req.history or [])[-8:]:
        if isinstance(h, dict) and h.get("role") in ("user", "assistant") and isinstance(h.get("content"), str):
            messages.append({"role": h["role"], "content": h["content"][:8000]})
    messages.append({"role": "user", "content": f"{context}\n\nREQUEST:\n{text[:8000]}"})
    model = MODEL_FREE if tier in ("guest", "free") else MODEL

    from ai import _get_openrouter_keys
    keys = _get_openrouter_keys()

    async def gen():
        yield f"data: {json.dumps({'left': left, 'limit': limit})}\n\n"
        if not keys:
            yield f"data: {json.dumps({'error': 'The AI is not configured yet.'})}\n\n"
            return
        for i, key in enumerate(keys):
            try:
                async with httpx.AsyncClient(timeout=180) as client:
                    async with client.stream("POST", f"{OR_BASE}/chat/completions",
                                             headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                                             json={"model": model, "messages": messages, "stream": True,
                                                   "max_tokens": 12000, "temperature": 0.2}) as r:
                        if r.status_code != 200:
                            body = (await r.aread()).decode("utf-8", "ignore")[:300]
                            if r.status_code in (402, 429) and i < len(keys) - 1:
                                continue
                            yield f"data: {json.dumps({'error': 'The AI is busy right now — please try again in a few seconds.' if r.status_code in (402, 429) else 'AI error ' + str(r.status_code) + ': ' + body})}\n\n"
                            return
                        async for line in r.aiter_lines():
                            if not line.startswith("data: "):
                                continue
                            data = line[6:].strip()
                            if data == "[DONE]":
                                break
                            try:
                                delta = json.loads(data).get("choices", [{}])[0].get("delta", {}).get("content")
                            except Exception:
                                continue
                            if delta:
                                yield f"data: {json.dumps({'token': delta})}\n\n"
                yield "data: [DONE]\n\n"
                return
            except httpx.TimeoutException:
                yield f"data: {json.dumps({'error': 'The AI took too long. Try a smaller request.'})}\n\n"
                return
            except Exception as e:
                if i < len(keys) - 1:
                    continue
                yield f"data: {json.dumps({'error': f'Connection problem: {type(e).__name__}'})}\n\n"
                return

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
