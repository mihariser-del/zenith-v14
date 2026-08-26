import subprocess
import tempfile
import os
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user_from_cookie

router = APIRouter(prefix="/api/code", tags=["code"])


class ExecuteRequest(BaseModel):
    code: str
    language: str = "python"


@router.post("/execute")
async def execute_code(req: ExecuteRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    code = req.code.strip()
    lang = req.language.lower()

    if not code:
        raise HTTPException(status_code=400, detail="No code provided")

    if len(code) > 10000:
        raise HTTPException(status_code=400, detail="Code too long (max 10000 chars)")

    if lang == "python":
        return await run_python(code)
    elif lang == "javascript":
        return await run_javascript(code)
    elif lang == "shell" or lang == "bash":
        return await run_shell(code)
    else:
        raise HTTPException(status_code=400, detail=f"Language not supported: {lang}")


async def run_python(code: str) -> dict:
    try:
        result = subprocess.run(
            ["python", "-c", code],
            capture_output=True, text=True, timeout=15,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )
        return {
            "stdout": result.stdout[:5000],
            "stderr": result.stderr[:2000],
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Execution timed out (15s limit)", "returncode": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "returncode": -1}


async def run_javascript(code: str) -> dict:
    try:
        result = subprocess.run(
            ["node", "-e", code],
            capture_output=True, text=True, timeout=15,
        )
        return {
            "stdout": result.stdout[:5000],
            "stderr": result.stderr[:2000],
            "returncode": result.returncode,
        }
    except FileNotFoundError:
        return {"stdout": "", "stderr": "Node.js not installed on server", "returncode": -1}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Execution timed out (15s limit)", "returncode": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "returncode": -1}


async def run_shell(code: str) -> dict:
    blocked = ["rm -rf", "mkfs", "dd if=", "> /dev/", "chmod 777", "curl", "wget", "nc ", "ncat"]
    for cmd in blocked:
        if cmd in code.lower():
            return {"stdout": "", "stderr": f"Blocked command: {cmd}", "returncode": -1}

    try:
        result = subprocess.run(
            code, shell=True, capture_output=True, text=True, timeout=10,
            cwd=tempfile.gettempdir(),
        )
        return {
            "stdout": result.stdout[:5000],
            "stderr": result.stderr[:2000],
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Execution timed out (10s limit)", "returncode": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "returncode": -1}
