"""Zelpophai app downloads and updates (Windows .exe, Android .apk).

Installers live on the Railway volume (/data/downloads) and are served from
/downloads/<platform>/<file>. The Windows app's updater reads
/downloads/win/latest.yml; the Android app (and the website) read
/api/app/latest.

New builds are uploaded with POST /api/app/upload and a release token. Only
the SHA-256 of a token is stored (here or in APP_UPLOAD_TOKEN_SHA256), so the
token itself never appears in the code. Rotate it by changing the hash.
"""

import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, PlainTextResponse

router = APIRouter(tags=["app-downloads"])

_TOKEN_HASHES = {h.strip().lower() for h in (
    os.getenv("APP_UPLOAD_TOKEN_SHA256", "") + ","
    "9dc86df132581d75fdf488743626169e4d56d07b199e16d4f8a006feab2ab8e5"
).split(",") if h.strip()}

ALLOWED = {
    "win": {"Zelpophai-Setup.exe", "Zelpophai-Setup.exe.blockmap", "latest.yml"},
    "android": {"Zelpophai.apk", "android.json"},
}
MAX_BYTES = 300 * 1024 * 1024


def _dir() -> Path:
    for cand in (os.getenv("DOWNLOAD_DIR", ""), "/data/downloads", os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloads")):
        if not cand:
            continue
        try:
            p = Path(cand)
            p.mkdir(parents=True, exist_ok=True)
            probe = p / ".probe"
            probe.write_text("ok")
            probe.unlink()
            return p
        except Exception:
            continue
    raise RuntimeError("no writable download folder")


def _check_token(token: str) -> bool:
    h = hashlib.sha256((token or "").encode()).hexdigest()
    return any(hmac.compare_digest(h, t) for t in _TOKEN_HASHES)


@router.post("/api/app/upload")
async def upload(request: Request, platform: str, name: str):
    if not _check_token(request.headers.get("x-upload-token", "")):
        raise HTTPException(status_code=403, detail="Not allowed")
    if platform not in ALLOWED or name not in ALLOWED[platform]:
        raise HTTPException(status_code=400, detail="Unknown file")
    folder = _dir() / platform
    folder.mkdir(parents=True, exist_ok=True)
    tmp = folder / (name + ".part")
    size = 0
    with open(tmp, "wb") as f:
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_BYTES:
                f.close()
                tmp.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Too big")
            f.write(chunk)
    os.replace(tmp, folder / name)
    return {"ok": True, "platform": platform, "name": name, "size": size,
            "sha256": hashlib.sha256((folder / name).read_bytes()).hexdigest() if size < 400 * 1024 * 1024 else None}


@router.get("/downloads/{platform}/{name}")
async def download(platform: str, name: str):
    if platform not in ALLOWED or name not in ALLOWED[platform]:
        raise HTTPException(status_code=404, detail="Not found")
    p = _dir() / platform / name
    if not p.is_file():
        raise HTTPException(status_code=404, detail="Not available yet")
    if name.endswith(".yml") or name.endswith(".json"):
        return PlainTextResponse(p.read_text(encoding="utf-8"), headers={"Cache-Control": "no-cache"},
                                 media_type="application/json" if name.endswith(".json") else "text/yaml")
    media = {"exe": "application/vnd.microsoft.portable-executable", "apk": "application/vnd.android.package-archive"}.get(
        name.rsplit(".", 1)[-1], "application/octet-stream")
    return FileResponse(p, media_type=media, filename=name if not name.endswith(".blockmap") else None,
                        headers={"Cache-Control": "public, max-age=300"})


def _win_info():
    p = _dir() / "win" / "latest.yml"
    exe = _dir() / "win" / "Zelpophai-Setup.exe"
    if not p.is_file() or not exe.is_file():
        return None
    txt = p.read_text(encoding="utf-8")
    ver = (re.search(r"^version:\s*['\"]?([\w.\-]+)", txt, re.M) or [None, None])[1]
    date = (re.search(r"^releaseDate:\s*['\"]?([^'\"\n]+)", txt, re.M) or [None, None])[1]
    return {"version": ver, "url": "/downloads/win/Zelpophai-Setup.exe", "size": exe.stat().st_size, "released": date}


def _android_info():
    p = _dir() / "android" / "android.json"
    apk = _dir() / "android" / "Zelpophai.apk"
    if not p.is_file() or not apk.is_file():
        return None
    try:
        meta = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None
    meta.update({"url": "/downloads/android/Zelpophai.apk", "size": apk.stat().st_size})
    return meta


@router.get("/api/app/latest")
async def latest():
    return {"windows": _win_info(), "android": _android_info(),
            "checked": datetime.now(timezone.utc).isoformat()}


@router.get("/download")
async def download_page():
    return FileResponse("static/download.html")
