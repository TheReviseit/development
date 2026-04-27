"""
Auth Sync Background Jobs Processor
==================================

Processes rows from Supabase `background_jobs` with:
- Locking (locked_until) + reclaim
- Exponential backoff with jitter
- Dead-letter after max_attempts

Job types (current):
- SEND_WELCOME_EMAIL
- START_TRIAL
"""

import logging
import os
import random
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from celery import shared_task

logger = logging.getLogger("reviseit.tasks.auth_sync_jobs")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


_otel_initialized = False


def _maybe_init_otel():
    """
    Best-effort OTEL init for background jobs.
    No-op unless OTEL_EXPORTER_OTLP_ENDPOINT is configured.
    """
    global _otel_initialized
    if _otel_initialized:
        return

    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        _otel_initialized = True
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )
        from opentelemetry.semconv.resource import ResourceAttributes

        service_name = os.getenv("OTEL_SERVICE_NAME", "flowauxi-backend-jobs")
        resource = Resource.create({ResourceAttributes.SERVICE_NAME: service_name})

        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(endpoint=endpoint)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        _otel_initialized = True
        logger.info("otel_initialized: enabled=true endpoint_configured=true")
    except Exception as e:
        _otel_initialized = True
        logger.warning(f"otel_initialized: enabled=false error={e}")


def _compute_next_attempt(attempts: int) -> datetime:
    """
    Exponential backoff: now + (2 ^ attempts) minutes, with ±20% jitter.
    attempts is the *new* attempt count after increment (1-based).
    """
    base_seconds = (2 ** attempts) * 60
    jitter = random.uniform(0.8, 1.2)
    return _utc_now() + timedelta(seconds=base_seconds * jitter)


def _send_welcome_email(payload: Dict[str, Any]) -> None:
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        raise RuntimeError("RESEND_API_KEY not configured")

    to_email = payload.get("email")
    full_name = payload.get("full_name") or "there"
    product = payload.get("product") or "Flowauxi"

    if not to_email:
        raise ValueError("Missing email")

    from_email = os.getenv("RESEND_FROM_EMAIL", "onboarding@flowauxi.com")

    subject = "Welcome to Flowauxi!"
    html = f"""
      <div>
        <h3>Welcome to Flowauxi, {full_name}!</h3>
        <p>Your <b>{product}</b> is ready.</p>
        <p>You can safely close this email and continue in the app.</p>
      </div>
    """

    import resend  # type: ignore

    resend.api_key = api_key
    resend.Emails.send(
        {
            "from": from_email,
            "to": to_email,
            "subject": subject,
            "html": html,
        }
    )


def _start_trial(payload: Dict[str, Any]) -> None:
    user_id = payload.get("user_id")
    org_id = payload.get("org_id") or user_id
    domain = payload.get("domain") or payload.get("product") or "shop"
    plan_slug = payload.get("plan_slug") or "starter"
    source = payload.get("source") or domain
    ip_address = payload.get("ip_address")
    device_fingerprint = payload.get("device_fingerprint")
    user_agent = payload.get("user_agent")
    email = payload.get("email")

    if not user_id or not org_id:
        raise ValueError("Missing user_id/org_id")

    # Pricing plan lookup (same logic as /api/trials/start)
    try:
        from services.pricing_service import get_pricing_service

        pricing = get_pricing_service()
        plan = pricing.get_plan(domain, plan_slug, "monthly")
        plan_id = plan["id"]
    except Exception as e:
        raise RuntimeError(f"PLAN_LOOKUP_FAILED: {e}")

    from services.trial_engine import TrialStartOptions, TrialSource, get_trial_engine

    email_domain = email.split("@")[1] if email and "@" in email else None

    options = TrialStartOptions(
        user_id=user_id,
        org_id=org_id,
        plan_slug=plan_slug,
        plan_id=str(plan_id),
        domain=domain,
        trial_days=7,
        source=TrialSource.ORGANIC if isinstance(source, str) else source,
        ip_address=ip_address,
        email_domain=email_domain,
        device_fingerprint=device_fingerprint,
        user_agent=user_agent,
        idempotency_key=payload.get("idempotency_key"),
    )

    import asyncio

    engine = get_trial_engine()
    asyncio.run(engine.start_trial(options))


def _process_job(job_type: str, payload: Dict[str, Any]) -> None:
    if job_type == "SEND_WELCOME_EMAIL":
        _send_welcome_email(payload)
        return
    if job_type == "START_TRIAL":
        _start_trial(payload)
        return
    raise ValueError(f"UNKNOWN_JOB_TYPE: {job_type}")


@shared_task(
    name="auth_sync_jobs.process_background_jobs",
    bind=True,
    max_retries=0,
    soft_time_limit=50,
    time_limit=60,
)
def process_background_jobs(self) -> Dict[str, Any]:
    _maybe_init_otel()

    from supabase_client import get_supabase_client

    db = get_supabase_client()
    if not db:
        return {"status": "error", "error": "SUPABASE_UNAVAILABLE"}

    worker_id = str(uuid.uuid4())
    now = _utc_now()
    now_iso = _iso(now)

    # Reclaim stuck jobs (processing, lock expired) -> failed
    try:
        db.table("background_jobs").update(
            {
                "status": "failed",
                "locked_by": None,
                "locked_until": None,
                "last_error": "LOCK_TIMEOUT_RECLAIM",
                "updated_at": now_iso,
            }
        ).eq("status", "processing").lt("locked_until", now_iso).execute()
    except Exception:
        pass

    # Fetch claimable jobs
    try:
        jobs_result = (
            db.table("background_jobs")
            .select("*")
            .in_("status", ["pending", "failed"])
            .lte("next_attempt_at", now_iso)
            .or_(f"locked_until.is.null,locked_until.lt.{now_iso}")
            .order("created_at", desc=False)
            .limit(25)
            .execute()
        )
        jobs = jobs_result.data or []
    except Exception as e:
        logger.error(f"background_jobs_fetch_error: {e}")
        return {"status": "error", "error": "FETCH_FAILED"}

    processed = 0
    succeeded = 0
    failed = 0
    dead_lettered = 0

    for job in jobs:
        processed += 1
        job_id = job.get("id")
        job_type = job.get("type")
        payload = job.get("payload") or {}
        attempts = int(job.get("attempts") or 0)
        max_attempts = int(job.get("max_attempts") or 3)

        if not job_id or not job_type:
            continue

        # Claim (optimistic)
        lock_until = _iso(now + timedelta(seconds=45))
        try:
            claim_result = (
                db.table("background_jobs")
                .update(
                    {
                        "status": "processing",
                        "locked_by": worker_id,
                        "locked_until": lock_until,
                        "updated_at": now_iso,
                    }
                )
                .eq("id", job_id)
                .in_("status", ["pending", "failed"])
                .or_(f"locked_until.is.null,locked_until.lt.{now_iso}")
                .execute()
            )
            if not claim_result.data:
                continue
        except Exception:
            continue

        # Execute
        try:
            _process_job(job_type, payload)

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

            succeeded += 1
        except Exception as e:
            failed += 1
            err = str(e)[:500]
            next_attempts = attempts + 1

            if next_attempts >= max_attempts:
                # Dead-letter
                try:
                    db.table("background_jobs_dead_letter").insert(
                        {
                            "job_id": job_id,
                            "type": job_type,
                            "payload": payload,
                            "attempts": next_attempts,
                            "max_attempts": max_attempts,
                            "last_error": job.get("last_error"),
                            "traceparent": job.get("traceparent"),
                            "request_id": job.get("request_id"),
                            "final_error": err,
                        }
                    ).execute()
                except Exception:
                    pass

                try:
                    db.table("background_jobs").update(
                        {
                            "status": "dead_lettered",
                            "attempts": next_attempts,
                            "locked_by": None,
                            "locked_until": None,
                            "last_error": err,
                            "completed_at": now_iso,
                            "updated_at": now_iso,
                        }
                    ).eq("id", job_id).execute()
                except Exception:
                    pass

                dead_lettered += 1
                continue

            next_attempt_at = _compute_next_attempt(next_attempts)
            try:
                db.table("background_jobs").update(
                    {
                        "status": "failed",
                        "attempts": next_attempts,
                        "next_attempt_at": _iso(next_attempt_at),
                        "locked_by": None,
                        "locked_until": None,
                        "last_error": err,
                        "updated_at": now_iso,
                    }
                ).eq("id", job_id).execute()
            except Exception:
                pass

    return {
        "status": "completed",
        "processed": processed,
        "succeeded": succeeded,
        "failed": failed,
        "dead_lettered": dead_lettered,
    }

