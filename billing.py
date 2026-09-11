import os
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

STRIPE_SECRET = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_IDS = {
    "pro_monthly": os.getenv("STRIPE_PRICE_PRO_MONTHLY", ""),
    "pro_annual": os.getenv("STRIPE_PRICE_PRO_ANNUAL", ""),
    "ultimate_monthly": os.getenv("STRIPE_PRICE_ULTIMATE_MONTHLY", ""),
    "ultimate_annual": os.getenv("STRIPE_PRICE_ULTIMATE_ANNUAL", ""),
    "pro_lifetime": os.getenv("STRIPE_PRICE_PRO_LIFETIME", ""),
    "ultimate_lifetime": os.getenv("STRIPE_PRICE_ULTIMATE_LIFETIME", ""),
}
APP_BASE = os.getenv("APP_BASE_URL", "https://zenithai.up.railway.app")


class CheckoutRequest(BaseModel):
    plan_id: str
    success_url: str = ""
    cancel_url: str = ""


def _apply_plan(user, plan_id):
    if plan_id in ("pro_monthly", "pro_annual", "pro_lifetime", "pro_trial"):
        user.is_pro = True
        user.is_ultimate = False
        user.pro_plan = plan_id
    elif plan_id in ("ultimate_monthly", "ultimate_annual", "ultimate_lifetime"):
        user.is_pro = True
        user.is_ultimate = True
        user.pro_plan = plan_id


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
        "stripe_customer_id": getattr(user, "stripe_customer_id", "") or "",
    }


def _need_stripe():
    try:
        import stripe
        return stripe
    except ImportError:
        raise HTTPException(status_code=500, detail="Stripe SDK not installed — pip install stripe or wait for redeploy.")


@router.post("/create-checkout")
async def create_checkout(req: CheckoutRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if req.plan_id not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    if not STRIPE_SECRET or not STRIPE_PRICE_IDS.get(req.plan_id):
        _apply_plan(user, req.plan_id)
        await db.commit()
        return {
            "url": req.success_url or "/app?checkout=mock",
            "mock": True,
            "message": "Stripe not configured — plan granted in dev mode. Set STRIPE_SECRET_KEY and STRIPE_PRICE_* on Railway for real billing.",
            "plan": PLANS[req.plan_id],
        }

    stripe = _need_stripe()
    stripe.api_key = STRIPE_SECRET
    try:
        price_id = STRIPE_PRICE_IDS[req.plan_id]
        customer_id = getattr(user, "stripe_customer_id", "") or ""
        if not customer_id:
            customer = stripe.Customer.create(
                email=user.email,
                metadata={"user_id": str(user.id), "username": user.username},
            )
            customer_id = customer.id
            user.stripe_customer_id = customer_id
            await db.commit()
        is_lifetime = req.plan_id in ("pro_lifetime", "ultimate_lifetime")
        success_url = req.success_url or f"{APP_BASE}/app?checkout=success"
        cancel_url = req.cancel_url or f"{APP_BASE}/app?checkout=cancel"
        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="payment" if is_lifetime else "subscription",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"user_id": str(user.id), "plan_id": req.plan_id},
        )
        return {"url": session.url, "mock": False, "plan": PLANS[req.plan_id]}
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
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    sig_header = request.headers.get("stripe-signature", "")
    if not STRIPE_WEBHOOK_SECRET or not sig_header:
        try:
            data = await request.json()
            user_id = data.get("user_id")
            plan_id = data.get("plan_id")
            if not user_id or not plan_id:
                return {"received": True, "mock": True}
            result = await db.execute(select(User).where(User.id == int(user_id)))
            user = result.scalar_one_or_none()
            if not user:
                return {"error": "user not found"}
            _apply_plan(user, plan_id)
            await db.commit()
            return {"received": True, "mock": True}
        except Exception as e:
            return {"error": str(e)}

    payload = await request.body()
    try:
        stripe = _need_stripe()
        stripe.api_key = STRIPE_SECRET
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]
            user_id = session.get("metadata", {}).get("user_id")
            plan_id = session.get("metadata", {}).get("plan_id")
            customer_id = session.get("customer")
            subscription_id = session.get("subscription")
            if user_id and plan_id:
                result = await db.execute(select(User).where(User.id == int(user_id)))
                user = result.scalar_one_or_none()
                if user:
                    _apply_plan(user, plan_id)
                    if plan_id == "pro_trial":
                        user.trial_end = datetime.now(timezone.utc) + timedelta(days=5)
                    user.stripe_customer_id = customer_id or getattr(user, "stripe_customer_id", "") or ""
                    user.stripe_subscription_id = subscription_id or getattr(user, "stripe_subscription_id", "") or ""
                    await db.commit()
        elif event["type"] == "customer.subscription.deleted":
            subscription = event["data"]["object"]
            customer_id = subscription.get("customer")
            result = await db.execute(select(User).where(User.stripe_customer_id == customer_id))
            user = result.scalar_one_or_none()
            if user:
                user.is_pro = False
                user.is_ultimate = False
                user.pro_plan = ""
                user.stripe_subscription_id = ""
                await db.commit()
        return {"received": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook error: {str(e)}")