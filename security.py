from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import LoginHistory, get_db
from auth import get_current_user_from_cookie

router = APIRouter(prefix="/api/security", tags=["security"])


class LoginEntry(BaseModel):
    id: int
    ip_address: str
    user_agent: str
    login_at: str
    success: bool

    model_config = {"from_attributes": True}


@router.get("/login-history")
async def get_login_history(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(LoginHistory).where(LoginHistory.user_id == user.id).order_by(LoginHistory.login_at.desc()).limit(50)
    )
    entries = result.scalars().all()
    return {"history": [
        LoginEntry(
            id=e.id,
            ip_address=e.ip_address,
            user_agent=e.user_agent[:120],
            login_at=e.login_at.strftime("%Y-%m-%d %H:%M UTC") if e.login_at else "",
            success=e.success,
        ) for e in entries
    ]}


@router.get("/dashboard")
async def security_dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)

    total_result = await db.execute(
        select(func.count()).select_from(LoginHistory).where(LoginHistory.user_id == user.id)
    )
    total_logins = total_result.scalar() or 0

    failed_result = await db.execute(
        select(func.count()).select_from(LoginHistory).where(
            LoginHistory.user_id == user.id, LoginHistory.success == False
        )
    )
    failed_logins = failed_result.scalar() or 0

    unique_ip_result = await db.execute(
        select(func.count(func.distinct(LoginHistory.ip_address))).where(LoginHistory.user_id == user.id)
    )
    unique_ips = unique_ip_result.scalar() or 0

    last_result = await db.execute(
        select(LoginHistory).where(
            LoginHistory.user_id == user.id, LoginHistory.success == True
        ).order_by(LoginHistory.login_at.desc()).limit(1)
    )
    last_login = last_result.scalar_one_or_none()

    return {
        "total_logins": total_logins,
        "failed_logins": failed_logins,
        "unique_ips": unique_ips,
        "last_login": last_login.login_at.strftime("%Y-%m-%d %H:%M UTC") if last_login else "Never",
        "last_ip": last_login.ip_address if last_login else "N/A",
    }
