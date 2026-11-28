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
# How many coding requests each plan gets a day comes from the Vault (System -> Limits).
MAX_FILES = 60
MAX_FILE_CHARS = 200_000
MAX_PROJECT_CHARS = 1_500_000
MAX_PROJECTS = 40
PATH_RE = re.compile(r"^[\w\-. ()]+(/[\w\-. ()]+)*$")


def _tier(user) -> str:
    import limits_config as LC
    return LC.plan_of(user)


async def _code_limit(db, user):
    """Coding requests a day for this person, set in the Vault. None = no limit."""
    import limits_config as LC
    return await LC.allowance(user, "coding", db)


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
        try:
            d["chat"] = json.loads(p.chat or "[]")
        except Exception:
            d["chat"] = []
    else:
        # A short preview line for Recents: the first thing the person asked.
        first = ""
        try:
            for it in json.loads(p.chat or "[]"):
                if isinstance(it, dict) and it.get("t") == "user":
                    first = str(it.get("text") or "")[:90]
                    break
        except Exception:
            pass
        d["first"] = first
    return d


# ─────────────────────────────────────────────── info / limits ──
@router.get("/agent/status")
async def agent_status(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    tier = _tier(user)
    limit = await _code_limit(db, user)
    used = await _used_today(db, user.id)
    return {"tier": tier, "limit": limit, "used": used, "left": None if limit is None else max(0, limit - used),
            "guest": tier == "guest", "free": tier in ("guest", "free"),
            "model": MODEL_FREE if tier in ("guest", "free") else MODEL,
            "smart": tier not in ("guest", "free"), "max_steps": MAX_AGENT_STEPS}


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


class ChatIn(BaseModel):
    chat: list = []


@router.put("/projects/{pid}/chat")
async def save_chat(pid: int, req: ChatIn, request: Request, db: AsyncSession = Depends(get_db)):
    """26.5: keep the agent conversation with the project (newest 300 items, ~400 KB)."""
    user = await get_current_user_from_cookie(request, db)
    p = await _own(db, user, pid)
    items = [it for it in (req.chat or []) if isinstance(it, dict)][-300:]
    data = json.dumps(items)
    while len(data) > 400_000 and len(items) > 10:
        items = items[len(items) // 4:]
        data = json.dumps(items)
    if len(data) > 400_000:
        raise HTTPException(status_code=400, detail="This conversation is too long to save")
    p.chat = data
    p.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


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
    limit = await _code_limit(db, user)
    used = await _used_today(db, user.id)
    if limit == 0:
        raise HTTPException(status_code=403, detail="The AI coding agent isn't included in your plan.")
    if limit is not None and used >= limit:
        msg = (f"You've used all {limit} AI coding requests for today. "
               + ("Log in for more, or get the desktop app." if tier == "guest" else
                  "They come back at midnight (UTC). Upgrade for more, or get the Zelpophai desktop app."))
        raise HTTPException(status_code=429, detail=msg)
    text = (req.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Tell the agent what you want")
    files = _clean_files(req.files or {})
    db.add(UsageLog(user_id=user.id, action="code_agent"))
    await db.commit()
    left = None if limit is None else max(0, limit - used - 1)   # None = no daily cap

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
            _out = []
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
                                _out.append(delta)
                                yield f"data: {json.dumps({'token': delta})}\n\n"
                import ai_meter
                ai_meter.record("code", model, user.id, messages, "".join(_out))
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


# ═══════════════════════════════════════════════ 26.5: the step-by-step agent ══
# The agent works like a real coding assistant: it looks at the files, makes a
# plan, edits files, runs the code, reads the output and fixes what's wrong —
# one model call per step. The tools themselves run in the person's browser (or
# on their computer in the Windows app); this endpoint only talks to the model.
# One task (everything that happens after you press Send) counts as ONE coding
# request against the daily allowance.

AGENT_SYSTEM = """You are Coding AGT., the coding agent inside Zelpophai AI (made by Wanzu Ibrahim).
You work on the user's project the way a senior engineer pair-programs: look before you change,
make focused edits, run the code, read the output and fix problems until it works.

HOW YOU WORK
- Use the tools. Start by looking at the relevant files (list_files / read_file / search_files)
  unless the project is empty or you already have them.
- For anything bigger than a one-line change, call update_plan first with 2-7 short steps, and
  update it as you finish steps.
- Make changes with edit_file (exact text replacement — copy old_text exactly from the file) or
  write_file (whole new files / full rewrites). Never leave placeholders like "..." or TODOs.
- In web pages link CSS/JS with relative paths that exactly match the project file names
  (e.g. <link rel="stylesheet" href="css/style.css">, <script src="js/app.js"></script>).
- After changing runnable code, call run to test it, read the output and fix any errors.
  Don't run more than needed, and stop after 3 failed attempts at the same error and explain.
- Keep your messages between tool calls very short (one line). When you're done, reply with a
  short summary: what you did, which files changed, and how to use it. Use the user's language.
- If the request is unclear or risky (deleting lots of files, rewriting everything), ask first.
- Questions that need no changes: just answer.

WHERE CODE RUNS
{env}

The project is called "{name}". Files right now:
{files}"""

ENV_BROWSER = """Environment: BROWSER. run works for:
- Websites: index.html + CSS + JS (shown in the Preview; console output and errors come back to you).
  No server or npm; load libraries from cdnjs.cloudflare.com or cdn.jsdelivr.net.
- Python (Pyodide 3.12 in the browser): standard library + numpy, pandas, matplotlib, scipy.
  No input(), no network, no threads, no native pip packages. main.py is the usual entry point.
  Files the program writes (zips, .mcaddon, images, CSV…) are shown to the user with a Download
  button under the run step — just tell them to click it. Never build a separate download page.
- SQL (SQLite) .sql files.
Other languages (Java, C#, C++, Go, Rust…) can be written but NOT run here — say they can run them
with "This computer" in the Zelpophai Windows app, or download the project."""

ENV_COMPUTER = """Environment: THIS COMPUTER (the Zelpophai Windows app). run executes the entry file on the
user's own PC with the languages they have installed (Python, Node, Java, C/C++, Go, Ruby, PHP…).
Websites still show in the Preview. Programs can't read keyboard input while running. Be careful:
this is a real computer — never write code that deletes or changes files outside the project."""

AGENT_TOOLS = [
    {"type": "function", "function": {"name": "list_files", "description": "List every file in the project with its size in lines.",
                                      "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "read_file", "description": "Read a file (with line numbers). Optionally only some lines.",
                                      "parameters": {"type": "object", "properties": {
                                          "path": {"type": "string"},
                                          "start_line": {"type": "integer"}, "end_line": {"type": "integer"}},
                                          "required": ["path"]}}},
    {"type": "function", "function": {"name": "search_files", "description": "Find text in all files (case-insensitive). Returns matching lines.",
                                      "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {"name": "write_file", "description": "Create a file or replace its whole content.",
                                      "parameters": {"type": "object", "properties": {
                                          "path": {"type": "string", "description": "e.g. index.html or src/game.js"},
                                          "content": {"type": "string", "description": "the COMPLETE file"}},
                                          "required": ["path", "content"]}}},
    {"type": "function", "function": {"name": "edit_file", "description": "Replace exact text in a file. old_text must match the file exactly (including spaces) and be unique unless replace_all is true.",
                                      "parameters": {"type": "object", "properties": {
                                          "path": {"type": "string"}, "old_text": {"type": "string"}, "new_text": {"type": "string"},
                                          "replace_all": {"type": "boolean"}},
                                          "required": ["path", "old_text", "new_text"]}}},
    {"type": "function", "function": {"name": "delete_file", "description": "Delete a file from the project.",
                                      "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "run", "description": "Run the project (or one entry file) and get the console output and errors back.",
                                      "parameters": {"type": "object", "properties": {"path": {"type": "string", "description": "entry file, e.g. main.py or index.html (optional)"}}}}},
    {"type": "function", "function": {"name": "update_plan", "description": "Show or update your step-by-step plan for this task.",
                                      "parameters": {"type": "object", "properties": {"steps": {"type": "array", "items": {"type": "object", "properties": {
                                          "text": {"type": "string"}, "status": {"type": "string", "enum": ["pending", "doing", "done"]}},
                                          "required": ["text", "status"]}}}, "required": ["steps"]}}},
]

_AGENT_TASKS: dict = {}          # task id -> {"user": id, "steps": n, "t": time}
MAX_AGENT_STEPS = int(os.getenv("CODE_AGENT_MAX_STEPS", "40"))


class StepIn(BaseModel):
    task: str = ""
    messages: list = []
    files: dict = {}            # path -> number of lines (contents travel through read_file)
    name: str = ""
    env: str = "browser"        # browser | computer
    model: str = "smart"        # smart | fast


def _clean_msgs(msgs: list) -> list:
    """Only the fields the model needs, sized so a long task still fits."""
    out = []
    for m in msgs or []:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        if role == "user":
            out.append({"role": "user", "content": str(m.get("content") or "")[:20000]})
        elif role == "assistant":
            d = {"role": "assistant", "content": str(m.get("content") or "")[:20000]}
            calls = []
            for c in (m.get("tool_calls") or [])[:12]:
                try:
                    f = c.get("function") or {}
                    calls.append({"id": str(c.get("id"))[:80], "type": "function",
                                  "function": {"name": str(f.get("name"))[:40], "arguments": str(f.get("arguments") or "{}")[:200000]}})
                except Exception:
                    continue
            if calls:
                d["tool_calls"] = calls
            out.append(d)
        elif role == "tool":
            out.append({"role": "tool", "tool_call_id": str(m.get("tool_call_id"))[:80], "content": str(m.get("content") or "")[:24000]})
    # Keep the first request and as much of the recent work as fits (~260k characters).
    def size(x):
        return len(json.dumps(x))
    while len(out) > 6 and sum(size(x) for x in out) > 260_000:
        # drop the oldest step after the first message, never splitting a call from its results
        i = 1
        del out[i]
        while i < len(out) and out[i]["role"] == "tool":
            del out[i]
    # The model must never see tool results without the call that asked for them.
    while len(out) > 1 and out[1]["role"] == "tool":
        del out[1]
    return out


@router.post("/agent/step")
async def agent_step(req: StepIn, request: Request, db: AsyncSession = Depends(get_db)):
    import time as _t
    user = await get_current_user_from_cookie(request, db)
    tier = _tier(user)
    now = _t.time()
    for k in [k for k, v in _AGENT_TASKS.items() if now - v["t"] > 3600]:
        _AGENT_TASKS.pop(k, None)
    left = None
    limit = await _code_limit(db, user)
    task = _AGENT_TASKS.get(req.task) if req.task else None
    if req.task and (not task or task["user"] != user.id):
        raise HTTPException(status_code=409, detail="This task has ended — send your message again to start a new one.")
    if not task:
        used = await _used_today(db, user.id)
        if limit == 0:
            raise HTTPException(status_code=403, detail="The AI coding agent isn't included in your plan.")
        if limit is not None and used >= limit:
            raise HTTPException(status_code=429, detail=(f"You've used all {limit} AI coding tasks for today. "
                                + ("Log in for more." if tier == "guest" else "They come back at midnight (UTC). Upgrade for more.")))
        db.add(UsageLog(user_id=user.id, action="code_agent"))
        await db.commit()
        left = None if limit is None else max(0, limit - used - 1)
        tid = secrets.token_urlsafe(16)
        task = _AGENT_TASKS[tid] = {"user": user.id, "steps": 0, "t": now, "id": tid}
    if task["steps"] >= MAX_AGENT_STEPS:
        raise HTTPException(status_code=429, detail=f"That task used all {MAX_AGENT_STEPS} steps. Send a new message to keep going.")
    task["steps"] += 1
    task["t"] = now

    msgs = _clean_msgs(req.messages)
    if not msgs or msgs[0]["role"] != "user":
        raise HTTPException(status_code=400, detail="Tell the agent what you want")
    listing = "\n".join(f"- {str(p)[:120]} ({int(n) if str(n).isdigit() else n} lines)" for p, n in list((req.files or {}).items())[:80]) or "(no files yet — the project is empty)"
    system = AGENT_SYSTEM.format(env=ENV_COMPUTER if req.env == "computer" else ENV_BROWSER,
                                 name=(req.name or "Untitled project")[:80], files=listing)
    model = MODEL_FREE if (tier in ("guest", "free") or req.model == "fast") else MODEL
    payload = {"model": model, "messages": [{"role": "system", "content": system}] + msgs,
               "tools": AGENT_TOOLS, "tool_choice": "auto", "max_tokens": 16000, "temperature": 0.2}

    from ai import _get_openrouter_keys
    keys = _get_openrouter_keys()
    if not keys:
        raise HTTPException(status_code=503, detail="The AI is not configured yet.")
    data, err = None, ""
    for i, key in enumerate(keys):
        try:
            async with httpx.AsyncClient(timeout=240) as client:
                r = await client.post(f"{OR_BASE}/chat/completions", json=payload,
                                      headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
            if r.status_code == 200:
                data = r.json()
                break
            err = f"{r.status_code}: {r.text[:200]}"
            if r.status_code in (401, 402, 429) and i < len(keys) - 1:
                continue
            break
        except httpx.TimeoutException:
            err = "timeout"
        except Exception as e:
            err = type(e).__name__
    if not data:
        task["steps"] -= 1
        busy = err.startswith(("402", "429")) or err == "timeout"
        raise HTTPException(status_code=502, detail="The AI is busy right now — press Retry in a few seconds." if busy else f"The AI had a problem ({err[:80]}). Press Retry.")
    try:
        choice = (data.get("choices") or [{}])[0]
        m = choice.get("message") or {}
    except Exception:
        m, choice = {}, {}
    calls = []
    for c in (m.get("tool_calls") or [])[:12]:
        f = (c or {}).get("function") or {}
        calls.append({"id": c.get("id") or ("call_" + secrets.token_hex(6)), "type": "function",
                      "function": {"name": f.get("name") or "", "arguments": f.get("arguments") or "{}"}})
    try:
        import ai_meter
        ai_meter.record("code", model, user.id, payload["messages"], (m.get("content") or "") + json.dumps(calls)[:4000])
    except Exception:
        pass
    return {"task": task["id"], "left": left, "steps_left": MAX_AGENT_STEPS - task["steps"],
            "finish": choice.get("finish_reason") or "", "model": "fast" if model == MODEL_FREE else "smart",
            "message": {"role": "assistant", "content": m.get("content") or "", "tool_calls": calls}}
