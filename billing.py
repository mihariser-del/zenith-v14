import os, time, uuid
import httpx as _httpx
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import User, get_db
from auth import get_current_user_from_cookie

router = APIRouter(prefix="/api/billing", tags=["billing"])

PLANS = {
    "pro_monthly": {"id": "pro_monthly", "name": "Pro", "price": 5.99, "interval": "month", "savings": None},
    "pro_annual": {"id": "pro_annual", "name": "Pro Annual", "price": 59.99, "interval": "year", "savings": "17% off"},
    "ultimate_monthly": {"id": "ultimate_monthly", "name": "Ultimate", "price": 11.99, "interval": "month", "savings": None},
    "ultimate_annual": {"id": "ultimate_annual", "name": "Ultimate Annual", "price": 119.99, "interval": "year", "savings": "17% off"},
    "pro_lifetime": {"id": "pro_lifetime", "name": "Pro Lifetime", "price": 200.00, "interval": "lifetime", "savings": "One-time"},
    "ultimate_lifetime": {"id": "ultimate_lifetime", "name": "Ultimate Lifetime", "price": 400.00, "interval": "lifetime", "savings": "One-time"},
}

PESAPAL_CONSUMER_KEY = os.getenv("PESAPAL_CONSUMER_KEY", "")
PESAPAL_CONSUMER_SECRET = os.getenv("PESAPAL_CONSUMER_SECRET", "")
PESAPAL_BASE_URL = os.getenv("PESAPAL_BASE_URL", "https://pay.pesapal.com/v3")
PESAPAL_SANDBOX = os.getenv("PESAPAL_SANDBOX", "").lower() in ("1", "true", "yes")
if PESAPAL_SANDBOX:
    PESAPAL_BASE_URL = "https://cybqa.pesapal.com/pesapalv3"

if PESAPAL_SANDBOX:
    PESAPAL_CONSUMER_KEY = PESAPAL_CONSUMER_KEY or os.getenv("PESAPAL_SANDBOX_KEY", "")
    PESAPAL_CONSUMER_SECRET = PESAPAL_CONSUMER_SECRET or os.getenv("PESAPAL_SANDBOX_SECRET", "")

_token_cache = {"token": None, "expires": 0}


def _pesapal_auth():
    if _token_cache["token"] and time.time() < _token_cache["expires"]:
        return _token_cache["token"]
    r = _httpx.post(
        f"{PESAPAL_BASE_URL}/api/Auth/RequestToken",
        json={"consumer_key": PESAPAL_CONSUMER_KEY, "consumer_secret": PESAPAL_CONSUMER_SECRET},
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        timeout=15,
    )
    r.raise_for_status()
    d = r.json()
    if d.get("error"):
        raise Exception(f"PesaPal auth failed: {d.get('message', d)}")
    _token_cache["token"] = d["token"]
    _token_cache["expires"] = time.time() + 270
    return d["token"]


def _pesapal_headers():
    return {"Authorization": f"Bearer {_pesapal_auth()}", "Accept": "application/json", "Content-Type": "application/json"}


def _pesapal_register_ipn(ipn_url, notification_type="POST"):
    r = _httpx.post(
        f"{PESAPAL_BASE_URL}/api/URLSetup/RegisterIPN",
        json={"url": ipn_url, "ipn_notification_type": notification_type},
        headers=_pesapal_headers(),
        timeout=15,
    )
    r.raise_for_status()
    d = r.json()
    if d.get("error") or d.get("status") != "200":
        raise Exception(f"PesaPal IPN registration failed: {d.get('error') or d}")
    ipn_id = d.get("ipn_id") or d.get("notification_id")
    if not ipn_id:
        raise Exception(f"PesaPal IPN registration returned no ID: {d}")
    return ipn_id


def _pesapal_submit_order(order_data):
    r = _httpx.post(
        f"{PESAPAL_BASE_URL}/api/Transactions/SubmitOrderRequest",
        json=order_data,
        headers=_pesapal_headers(),
        timeout=15,
    )
    r.raise_for_status()
    d = r.json()
    if d.get("status") != "200" or not d.get("redirect_url"):
        raise Exception(f"PesaPal order failed: {d}")
    return d


def _pesapal_get_status(order_tracking_id):
    r = _httpx.get(
        f"{PESAPAL_BASE_URL}/api/Transactions/GetTransactionStatus",
        params={"orderTrackingId": order_tracking_id},
        headers=_pesapal_headers(),
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def _apply_plan(user, plan_id):
    if plan_id in ("pro_monthly", "pro_annual", "pro_lifetime", "pro_trial"):
        user.is_pro = True
        user.is_ultimate = False
        user.pro_plan = plan_id
    elif plan_id in ("ultimate_monthly", "ultimate_annual", "ultimate_lifetime"):
        user.is_pro = True
        user.is_ultimate = True
        user.pro_plan = plan_id


class CheckoutRequest(BaseModel):
    plan_id: str
    success_url: str = ""
    cancel_url: str = ""


@router.get("/plans")
async def get_plans():
    return {"plans": list(PLANS.values())}


@router.get("/status")
async def get_status(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    trial_active = False
    if user.trial_end and user.trial_end > datetime.now(timezone.utc):
        trial_active = True
    return {
        "is_pro": user.is_pro or trial_active,
        "is_ultimate": user.is_ultimate,
        "pro_plan": user.pro_plan,
        "trial_end": user.trial_end.isoformat() if user.trial_end else None,
        "trial_active": trial_active,
    }


@router.post("/create-checkout")
async def create_checkout(req: CheckoutRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if req.plan_id not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    if not PESAPAL_CONSUMER_KEY or not PESAPAL_CONSUMER_SECRET:
        _apply_plan(user, req.plan_id)
        await db.commit()
        return {
            "url": req.success_url or "/app?checkout=mock",
            "mock": True,
            "message": "PesaPal not configured — plan granted in dev mode. Set PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET on Railway for real billing.",
            "plan": PLANS[req.plan_id],
        }

    base = str(request.base_url).rstrip("/")
    ipn_url = f"{base}/api/billing/webhook"
    try:
        notification_id = _pesapal_register_ipn(ipn_url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment provider unavailable (IPN setup): {e}")

    plan = PLANS[req.plan_id]
    merchant_ref = f"{user.id}_{req.plan_id}_{int(time.time())}"
    is_lifetime = req.plan_id in ("pro_lifetime", "ultimate_lifetime")

    order_data = {
        "id": merchant_ref,
        "currency": "USD",
        "amount": plan["price"],
        "description": f"Quolvex AI - {plan['name']}",
        "callback_url": req.success_url or f"{base}/app?checkout=success",
        "cancellation_url": req.cancel_url or f"{base}/app?checkout=cancel",
        "notification_id": notification_id,
        "billing_address": {
            "email_address": user.email,
            "first_name": user.username,
            "country_code": "UG",
        },
        "account_number": str(user.id),
    }

    if not is_lifetime:
        freq_map = {"month": "MONTHLY", "year": "YEARLY"}
        interval = plan.get("interval", "month")
        freq = freq_map.get(interval, "MONTHLY")
        now = datetime.now(timezone.utc)
        if interval == "year":
            end = now + timedelta(days=365)
        else:
            end = now + timedelta(days=30)
        order_data["subscription_details"] = {
            "start_date": now.strftime("%d-%m-%Y"),
            "end_date": end.strftime("%d-%m-%Y"),
            "frequency": freq,
        }

    try:
        result = _pesapal_submit_order(order_data)
        return {"url": result["redirect_url"], "mock": False, "plan": plan}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment provider unavailable (checkout): {e}")


@router.post("/trial/start")
async def start_trial(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if user.is_pro or user.is_ultimate:
        raise HTTPException(status_code=400, detail="Already subscribed")
    if user.trial_end and user.trial_end > datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Trial already active")
    if user.trial_end is not None:
        raise HTTPException(status_code=400, detail="Trial already used")
    trial_end = datetime.now(timezone.utc) + timedelta(days=5)
    user.trial_end = trial_end
    user.is_pro = True
    user.pro_plan = "pro_trial"
    await db.commit()
    return {"message": "Pro trial started for 5 days", "trial_end": trial_end.isoformat(), "is_pro": True}


@router.post("/webhook")
async def pesapal_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        body = await request.json()
    except Exception:
        try:
            body = dict(request.query_params)
        except Exception:
            return {"received": True}

    order_tracking_id = body.get("OrderTrackingId") or body.get("orderTrackingId")
    merchant_ref = body.get("OrderMerchantReference") or body.get("orderMerchantReference")

    if not order_tracking_id:
        return {"received": True}

    if not PESAPAL_CONSUMER_KEY or not PESAPAL_CONSUMER_SECRET:
        if merchant_ref and "_" in merchant_ref:
            parts = merchant_ref.split("_")
            if len(parts) >= 2:
                try:
                    uid = int(parts[0])
                    plan_id = parts[1]
                    result = await db.execute(select(User).where(User.id == uid))
                    user = result.scalar_one_or_none()
                    if user:
                        _apply_plan(user, plan_id)
                        await db.commit()
                except Exception:
                    pass
        return {"received": True, "mock": True}

    try:
        status_data = _pesapal_get_status(order_tracking_id)
        payment_status = (status_data.get("payment_status_description") or "").lower()
        sub_info = status_data.get("subscription_transaction_info") or {}
        correlation_id = sub_info.get("correlation_id")

        if merchant_ref and "_" in merchant_ref:
            parts = merchant_ref.split("_")
            if len(parts) >= 2:
                uid = int(parts[0])
                plan_id = parts[1]
                result = await db.execute(select(User).where(User.id == uid))
                user = result.scalar_one_or_none()
                if user and payment_status == "completed":
                    _apply_plan(user, plan_id)
                    user.stripe_customer_id = merchant_ref
                    if correlation_id:
                        user.stripe_subscription_id = str(correlation_id)
                    await db.commit()
        return {"received": True, "status": payment_status}
    except Exception as e:
        return {"error": str(e)}
