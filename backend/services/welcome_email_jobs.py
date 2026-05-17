"""Durable welcome-email enqueueing after product access activation."""

import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from html import escape
from typing import Any, Dict, Optional


WELCOME_EMAIL_JOB_TYPE = "SEND_WELCOME_EMAIL"
WELCOME_EMAIL_ACTIVE_STATUSES = ("pending", "processing", "completed", "failed")


def build_welcome_email_activation_key(user_id: str, product: str) -> str:
    normalized_product = (product or "shop").strip().lower()
    return f"welcome_email:{normalized_product}:{user_id}"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _product_label(product: str) -> str:
    normalized = (product or "flowauxi").strip().lower()
    return {
        "shop": "Flowauxi Shop",
        "dashboard": "Flowauxi",
        "api": "Flowauxi API",
        "booking": "Flowauxi Booking",
    }.get(normalized, f"Flowauxi {escape(normalized.title())}")


def send_welcome_email_from_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Send the activation welcome email using the configured email provider."""
    if os.getenv("ENABLE_WELCOME_EMAIL", "true").lower() == "false":
        return {"sent": False, "skipped": True, "reason": "disabled"}

    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        raise RuntimeError("RESEND_API_KEY not configured")

    to_email = (payload.get("email") or "").strip()
    if not to_email:
        raise ValueError("Missing email")

    full_name = escape(str(payload.get("full_name") or "there"))
    product = _product_label(str(payload.get("product") or "Flowauxi"))
    from_email = os.getenv("RESEND_FROM_EMAIL", "onboarding@flowauxi.com")

    html = f"""
      <div>
        <h3>Welcome to Flowauxi, {full_name}!</h3>
        <p>Your <b>{product}</b> access is ready.</p>
        <p>You can safely close this email and continue in the app.</p>
      </div>
    """

    import resend  # type: ignore

    resend.api_key = api_key
    response = resend.Emails.send(
        {
            "from": from_email,
            "to": to_email,
            "subject": "Welcome to Flowauxi!",
            "html": html,
        }
    )
    return {"sent": True, "provider_response": response}


def _response_data(response: Any) -> Any:
    if response is None:
        return None
    if isinstance(response, dict):
        return response.get("data", response)
    return getattr(response, "data", None)


def _first_row(response: Any) -> Optional[Dict[str, Any]]:
    data = _response_data(response)
    if isinstance(data, list):
        return data[0] if data else None
    if isinstance(data, dict):
        return data
    return None


def _is_unique_violation(exc: Exception) -> bool:
    text = str(exc).lower()
    return "duplicate key" in text or "23505" in text or "unique" in text


def _resolve_user_contact(
    db: Any,
    user_id: str,
    email: Optional[str],
    full_name: Optional[str],
) -> Dict[str, Optional[str]]:
    if email and full_name:
        return {"email": email, "full_name": full_name}

    try:
        result = (
            db.table("users")
            .select("email, full_name")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        row = _first_row(result) or {}
        return {
            "email": email or row.get("email"),
            "full_name": full_name or row.get("full_name"),
        }
    except Exception:
        return {"email": email, "full_name": full_name}


def _find_existing_welcome_job(
    db: Any,
    activation_key: str,
    email: str,
    product: str,
) -> Optional[Dict[str, Any]]:
    try:
        result = (
            db.table("background_jobs")
            .select("id, status, attempts, max_attempts, payload")
            .eq("type", WELCOME_EMAIL_JOB_TYPE)
            .eq("payload->>activation_key", activation_key)
            .in_("status", list(WELCOME_EMAIL_ACTIVE_STATUSES))
            .limit(1)
            .execute()
        )
        row = _first_row(result)
        if row:
            return row
    except Exception:
        pass

    try:
        result = (
            db.table("background_jobs")
            .select("id, status, attempts, max_attempts, payload")
            .eq("type", WELCOME_EMAIL_JOB_TYPE)
            .eq("payload->>email", email)
            .eq("payload->>product", product)
            .in_("status", list(WELCOME_EMAIL_ACTIVE_STATUSES))
            .limit(1)
            .execute()
        )
        return _first_row(result)
    except Exception:
        return None


def _send_job_now(
    db: Any,
    job: Dict[str, Any],
    log: logging.Logger,
) -> Dict[str, Any]:
    job_id = job.get("id")
    if not job_id:
        return {"sent": False, "skipped": True, "reason": "missing_job_id"}

    status = job.get("status")
    if status == "completed":
        return {"sent": False, "skipped": True, "reason": "already_sent"}
    if status == "processing":
        return {"sent": False, "skipped": True, "reason": "already_processing"}

    now = datetime.now(timezone.utc)
    now_iso = _iso(now)
    worker_id = str(uuid.uuid4())

    try:
        claim_result = (
            db.table("background_jobs")
            .update(
                {
                    "status": "processing",
                    "locked_by": worker_id,
                    "locked_until": _iso(now + timedelta(seconds=45)),
                    "updated_at": now_iso,
                }
            )
            .eq("id", job_id)
            .in_("status", ["pending", "failed"])
            .execute()
        )
        claimed = _response_data(claim_result)
        if isinstance(claimed, list) and len(claimed) == 0:
            return {"sent": False, "skipped": True, "reason": "claim_lost"}
    except Exception as exc:
        log.warning(f"welcome_email_claim_failed job={job_id} error={exc}")
        return {
            "sent": False,
            "skipped": True,
            "reason": "claim_failed",
            "error": str(exc),
        }

    try:
        send_result = send_welcome_email_from_payload(job.get("payload") or {})
        if send_result.get("skipped"):
            db.table("background_jobs").update(
                {
                    "status": "completed",
                    "locked_by": None,
                    "locked_until": None,
                    "last_error": send_result.get("reason"),
                    "completed_at": now_iso,
                    "updated_at": now_iso,
                }
            ).eq("id", job_id).execute()
            return {**send_result, "job_id": job_id}

        db.table("background_jobs").update(
            {
                "status": "completed",
                "locked_by": None,
                "locked_until": None,
                "last_error": None,
                "completed_at": now_iso,
                "updated_at": now_iso,
            }
        ).eq("id", job_id).execute()
        log.info(f"welcome_email_sent job={job_id}")
        return {**send_result, "job_id": job_id}
    except Exception as exc:
        err = str(exc)[:500]
        attempts = int(job.get("attempts") or 0) + 1
        try:
            db.table("background_jobs").update(
                {
                    "status": "failed",
                    "attempts": attempts,
                    "locked_by": None,
                    "locked_until": None,
                    "last_error": err,
                    "next_attempt_at": _iso(now + timedelta(minutes=5)),
                    "updated_at": now_iso,
                }
            ).eq("id", job_id).execute()
        except Exception:
            pass

        log.warning(f"welcome_email_send_failed job={job_id} error={err}")
        return {
            "sent": False,
            "skipped": False,
            "reason": "send_failed",
            "job_id": job_id,
            "error": err,
        }


def enqueue_welcome_email_after_activation(
    db: Any,
    *,
    user_id: str,
    product: str,
    activation_event: str,
    activation_id: Optional[str] = None,
    email: Optional[str] = None,
    full_name: Optional[str] = None,
    request_id: Optional[str] = None,
    traceparent: Optional[str] = None,
    send_immediately: bool = False,
    logger: Optional[logging.Logger] = None,
) -> Dict[str, Any]:
    """
    Enqueue the welcome email after product access is actually active.

    Idempotency is per user+product, so retries, verify/webhook races, dashboard
    refreshes, and repeated trial clicks do not send multiple welcome emails.
    """
    log = logger or logging.getLogger("reviseit.welcome_email_jobs")
    normalized_product = (product or "shop").strip().lower()
    activation_key = build_welcome_email_activation_key(user_id, normalized_product)

    contact = _resolve_user_contact(db, user_id, email, full_name)
    to_email = (contact.get("email") or "").strip()
    resolved_full_name = (contact.get("full_name") or "").strip() or "there"

    if not to_email:
        log.warning(
            "welcome_email_skipped_missing_email "
            f"user={user_id} product={normalized_product} event={activation_event}"
        )
        return {
            "enqueued": False,
            "skipped": True,
            "reason": "missing_email",
            "activation_key": activation_key,
        }

    existing = _find_existing_welcome_job(
        db,
        activation_key=activation_key,
        email=to_email,
        product=normalized_product,
    )
    if existing:
        send_result = (
            _send_job_now(db, existing, log)
            if send_immediately
            else {"sent": False}
        )
        log.info(
            "welcome_email_already_enqueued "
            f"user={user_id} product={normalized_product} job={existing.get('id')}"
        )
        return {
            "enqueued": False,
            "skipped": True,
            "reason": "already_exists",
            "job_id": existing.get("id"),
            "activation_key": activation_key,
            **send_result,
        }

    row = {
        "type": WELCOME_EMAIL_JOB_TYPE,
        "payload": {
            "email": to_email,
            "full_name": resolved_full_name,
            "product": normalized_product,
            "user_id": user_id,
            "activation_event": activation_event,
            "activation_id": activation_id,
            "activation_key": activation_key,
        },
        "status": "pending",
        "attempts": 0,
        "max_attempts": 3,
        "next_attempt_at": _utc_now_iso(),
        "traceparent": traceparent,
        "request_id": request_id,
    }

    try:
        result = db.table("background_jobs").insert(row).execute()
        inserted = _first_row(result) or {}
        job_id = inserted.get("id")
        log.info(
            "welcome_email_enqueued "
            f"user={user_id} product={normalized_product} job={job_id}"
        )
        return {
            "enqueued": True,
            "job_id": job_id,
            "activation_key": activation_key,
            **(
                _send_job_now(db, inserted, log)
                if send_immediately and job_id
                else {"sent": False}
            ),
        }
    except Exception as exc:
        if _is_unique_violation(exc):
            log.info(
                "welcome_email_unique_duplicate "
                f"user={user_id} product={normalized_product}"
            )
            return {
                "enqueued": False,
                "skipped": True,
                "reason": "already_exists",
                "activation_key": activation_key,
            }

        log.warning(
            "welcome_email_enqueue_failed "
            f"user={user_id} product={normalized_product} error={exc}"
        )
        return {
            "enqueued": False,
            "skipped": True,
            "reason": "enqueue_failed",
            "activation_key": activation_key,
            "error": str(exc),
        }
