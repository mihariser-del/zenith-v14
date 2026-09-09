import subprocess
import os
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user_from_cookie, is_owner

router = APIRouter(prefix="/api/code", tags=["code"])

# Secrets that must never leak into a sandboxed subprocess environment.
_SECRET_ENV_KEYS = ("OPENROUTER_API_KEY", "OPENROUTER_API_KEYS", "SECRET_KEY")


def _safe_env() -> dict:
    return {k: v for k, v in os.environ.items() if k not in _SECRET_ENV_KEYS}


class ExecuteRequest(BaseModel):
    code: str
    language: str = "python"


@router.post("/execute")
async def execute_code(req: ExecuteRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    # SECURITY: arbitrary code execution on the server is only allowed for the Owner.
    # This endpoint previously ran python -c and shell=True for any authenticated user,
    # which allowed reading .env (OpenRouter keys, SECRET_KEY) and dumping the DB.
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Code execution is disabled for security and only available to the Owner.")
    code = req.code.strip()
    lang = req.language.lower()

    if not code:
        raise HTTPException(status_code=400, detail="No code provided")

    if len(code) > 10000:
        raise HTTPException(status_code=400, detail="Code too long (max 10000 chars)")

    if lang == "python":
        return await run_python(code)
    elif lang in ("javascript", "js"):
        return await run_javascript(code)
    elif lang == "html":
        return {"stdout": f"HTML preview ({len(code)} chars) - use Preview tab", "stderr": "", "returncode": 0, "html": code}
    elif lang == "json":
        return await run_json_format(code)
    elif lang == "markdown" or lang == "md":
        return {"stdout": code, "stderr": "", "returncode": 0}
    elif lang == "sql":
        return {"stdout": "[SQL execution requires a database - showing formatted query]", "stderr": "", "returncode": 0, "formatted": code.strip()}
    elif lang in ("shell", "bash", "sh"):
        raise HTTPException(status_code=400, detail="Shell execution is disabled for security reasons.")
    else:
        raise HTTPException(status_code=400, detail=f"Language not supported: {lang}")


async def run_python(code: str) -> dict:
    try:
        result = subprocess.run(
            ["python", "-c", code],
            capture_output=True, text=True, timeout=15,
            env={**_safe_env(), "PYTHONDONTWRITEBYTECODE": "1"},
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


async def run_json_format(code: str) -> dict:
    import json
    try:
        parsed = json.loads(code)
        formatted = json.dumps(parsed, indent=2, ensure_ascii=False)
        return {"stdout": formatted, "stderr": "", "returncode": 0}
    except json.JSONDecodeError as e:
        return {"stdout": "", "stderr": f"JSON error: {e}", "returncode": 1}


async def run_javascript(code: str) -> dict:
    try:
        result = subprocess.run(
            ["node", "-e", code],
            capture_output=True, text=True, timeout=15,
            env=_safe_env(),
        )
        return {
            "stdout": result.stdout[:5000],
            "stderr": result.stderr[:2000],
            "returncode": result.returncode,
        }
    except FileNotFoundError:
        return {"stdout": "", "stderr": "Node.js not installed - JS will run in your browser instead. Click Run again to use browser execution.", "returncode": -1, "fallback": "browser"}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Execution timed out (15s limit)", "returncode": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "returncode": -1}
