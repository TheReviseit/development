"""
ActivationService — single activation path for webhook + verify-payment.

INVARIANTS on successful activation:
  1. status == 'active' => plan_id == pricing_plans.razorpay_plan_id
  2. plan_name == pricing_plans.plan_slug
  3. pending_upgrade fields cleared on upgrade path
  4. previous subscription cancelled on upgrade path
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Literal, Optional

logger = logging.getLogger("reviseit.billing.activation")

ActivationSource = Literal["webhook", "verify_payment", "reconciliation"]

PRE_ACTIVATION_STATUSES = frozenset({"pending", "pending_upgrade", "upgrade_failed"})


def resolve_expected_activation_status(subscription: Dict[str, Any]) -> str:
    """Map DB row status to the optimistic-lock value for activate_subscription."""
    status = subscription.get("status") or "pending"
    if status in PRE_ACTIVATION_STATUSES:
        return status
    return "pending_upgrade"


@dataclass
class ActivationResult:
    activated: bool
    already_active: bool
    reconciled: bool
    subscription_id: str
    plan_slug: Optional[str] = None


def _resolve_plan_snapshot(supabase, pricing_plan_id: str) -> Optional[Dict[str, Any]]:
    if not pricing_plan_id:
        return None
    result = (
        supabase.table("pricing_plans")
        .select("id, plan_slug, razorpay_plan_id, display_name, limits_json")
        .eq("id", pricing_plan_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _plan_fields_correct(subscription: Dict, plan: Dict) -> bool:
    return (
        subscription.get("plan_id") == plan.get("razorpay_plan_id")
        and subscription.get("plan_name") == plan.get("plan_slug")
        and subscription.get("pricing_plan_id") == plan.get("id")
    )


def _write_funnel_event(
    supabase,
    *,
    correlation_id: Optional[str],
    user_id: Optional[str],
    product_domain: Optional[str],
    event_name: str,
    metadata: Optional[Dict] = None,
):
    try:
        supabase.table("billing_funnel_events").insert(
            {
                "correlation_id": correlation_id or "unknown",
                "user_id": user_id,
                "product_domain": product_domain,
                "event_name": event_name,
                "metadata": metadata or {},
            }
        ).execute()
    except Exception as e:
        logger.debug(f"billing_funnel_event_skip: {e}")


def reconcile_plan_snapshot(
    supabase,
    subscription_id: str,
    *,
    correlation_id: Optional[str] = None,
    source: ActivationSource = "reconciliation",
) -> ActivationResult:
    """Fix plan_name/plan_id drift on an already-active subscription."""
    sub_result = (
        supabase.table("subscriptions")
        .select("*")
        .eq("id", subscription_id)
        .limit(1)
        .execute()
    )
    if not sub_result.data:
        return ActivationResult(
            activated=False,
            already_active=False,
            reconciled=False,
            subscription_id=subscription_id,
        )

    subscription = sub_result.data[0]
    plan_id = subscription.get("pending_upgrade_to_plan_id") or subscription.get(
        "pricing_plan_id"
    )
    plan = _resolve_plan_snapshot(supabase, plan_id)
    if not plan:
        return ActivationResult(
            activated=False,
            already_active=subscription.get("status") == "active",
            reconciled=False,
            subscription_id=subscription_id,
        )

    if _plan_fields_correct(subscription, plan):
        return ActivationResult(
            activated=False,
            already_active=True,
            reconciled=False,
            subscription_id=subscription_id,
            plan_slug=plan.get("plan_slug"),
        )

    update_data = {
        "pricing_plan_id": plan["id"],
        "plan_name": plan.get("plan_slug"),
        "plan_id": plan.get("razorpay_plan_id"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("subscriptions").update(update_data).eq(
        "id", subscription_id
    ).execute()

    _write_funnel_event(
        supabase,
        correlation_id=correlation_id,
        user_id=subscription.get("user_id"),
        product_domain=subscription.get("product_domain"),
        event_name="plan_reconciled",
        metadata={
            "source": source,
            "plan_fields_written": True,
            "subscription_id": subscription_id,
        },
    )

    return ActivationResult(
        activated=False,
        already_active=True,
        reconciled=True,
        subscription_id=subscription_id,
        plan_slug=plan.get("plan_slug"),
    )


def _cancel_previous_subscription(
    supabase, subscription: Dict, subscription_id: str
) -> None:
    user_id = subscription.get("user_id")
    domain = subscription.get("product_domain")
    previous_sub_id = subscription.get("previous_subscription_id")
    now = datetime.now(timezone.utc).isoformat()
    cancel_data = {
        "status": "cancelled",
        "cancelled_at": now,
        "cancellation_reason": "upgraded",
        "updated_at": now,
    }
    try:
        if previous_sub_id:
            supabase.table("subscriptions").update(cancel_data).eq(
                "id", previous_sub_id
            ).execute()
        elif user_id and domain:
            supabase.table("subscriptions").update(cancel_data).match(
                {
                    "user_id": user_id,
                    "product_domain": domain,
                    "status": "active",
                }
            ).neq("id", subscription_id).execute()
    except Exception as e:
        logger.warning(f"cancel_previous_subscription_skipped: {e}")


def activate_subscription(
    supabase,
    subscription: Dict,
    *,
    source: ActivationSource,
    expected_status: str,
    period_start: Optional[str] = None,
    period_end: Optional[str] = None,
    razorpay_payment_id: Optional[str] = None,
    razorpay_subscription_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
) -> ActivationResult:
    """
    Activate subscription with full plan snapshot.

    Uses optimistic locking on expected_status. Loser path reconciles plan fields.
    """
    subscription_id = subscription["id"]
    user_id = subscription.get("user_id")
    domain = subscription.get("product_domain")

    target_plan_id = (
        subscription.get("pending_upgrade_to_plan_id")
        or subscription.get("pricing_plan_id")
    )
    if not target_plan_id:
        logger.error(f"activation_no_plan_id sub={subscription_id}")
        return ActivationResult(
            activated=False,
            already_active=False,
            reconciled=False,
            subscription_id=subscription_id,
        )

    plan = _resolve_plan_snapshot(supabase, target_plan_id)
    if not plan:
        logger.error(f"activation_plan_not_found plan_id={target_plan_id}")
        return ActivationResult(
            activated=False,
            already_active=False,
            reconciled=False,
            subscription_id=subscription_id,
        )

    limits = plan.get("limits_json") or {}
    ai_limit = limits.get("ai_responses") or limits.get("ai_responses_limit")

    update_data: Dict[str, Any] = {
        "status": "active",
        "pricing_plan_id": plan["id"],
        "plan_name": plan.get("plan_slug"),
        "plan_id": plan.get("razorpay_plan_id"),
        "pending_upgrade_to_plan_id": None,
        "pending_upgrade_razorpay_subscription_id": None,
        "upgrade_failure_reason": None,
        "upgrade_initiated_at": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if razorpay_subscription_id:
        update_data["razorpay_subscription_id"] = razorpay_subscription_id
    if period_start:
        update_data["current_period_start"] = period_start
    if period_end:
        update_data["current_period_end"] = period_end
    if ai_limit is not None:
        update_data["ai_responses_limit"] = ai_limit

    result = (
        supabase.table("subscriptions")
        .update(update_data)
        .eq("id", subscription_id)
        .eq("status", expected_status)
        .execute()
    )

    if result.data:
        _cancel_previous_subscription(supabase, subscription, subscription_id)

        if domain and domain != "dashboard" and user_id:
            try:
                supabase.table("user_products").upsert(
                    {
                        "user_id": user_id,
                        "product": domain,
                        "status": "active",
                        "activated_by": "system",
                    },
                    on_conflict="user_id,product",
                ).execute()
            except Exception as e:
                logger.warning(f"user_products_upsert_failed: {e}")

        _write_funnel_event(
            supabase,
            correlation_id=correlation_id,
            user_id=user_id,
            product_domain=domain,
            event_name="activated",
            metadata={
                "source": source,
                "plan_fields_written": True,
                "subscription_id": subscription_id,
                "razorpay_payment_id": razorpay_payment_id,
                "plan_slug": plan.get("plan_slug"),
            },
        )

        logger.info(
            f"activation_success sub={subscription_id} source={source} "
            f"plan={plan.get('plan_slug')}"
        )
        return ActivationResult(
            activated=True,
            already_active=False,
            reconciled=False,
            subscription_id=subscription_id,
            plan_slug=plan.get("plan_slug"),
        )

    # Loser path — other actor won the race
    refetch = (
        supabase.table("subscriptions")
        .select("*")
        .eq("id", subscription_id)
        .limit(1)
        .execute()
    )
    if not refetch.data:
        return ActivationResult(
            activated=False,
            already_active=False,
            reconciled=False,
            subscription_id=subscription_id,
        )

    current = refetch.data[0]
    if current.get("status") == "active":
        reconcile_result = reconcile_plan_snapshot(
            supabase,
            subscription_id,
            correlation_id=correlation_id,
            source=source,
        )
        return ActivationResult(
            activated=False,
            already_active=True,
            reconciled=reconcile_result.reconciled,
            subscription_id=subscription_id,
            plan_slug=reconcile_result.plan_slug,
        )

    return ActivationResult(
        activated=False,
        already_active=False,
        reconciled=False,
        subscription_id=subscription_id,
    )


def get_activation_service(supabase):
    """Thin wrapper for dependency injection."""
    return supabase
