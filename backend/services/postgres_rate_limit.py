"""
Postgres-primary rate limiting — no Redis required.

Degrades gracefully: if RPC fails, allow request (never block payments on DB blip).
"""

import logging
from typing import Optional

logger = logging.getLogger("reviseit.billing.rate_limit")


def check_postgres_rate_limit(
    bucket_key: str,
    window_seconds: int,
    max_requests: int,
) -> bool:
    """
    Returns True if request is allowed, False if rate limited.
    On DB error: allow (fail-open for availability — bucket is abuse protection only).
    """
    try:
        from supabase_client import get_supabase_client

        db = get_supabase_client()
        result = db.rpc(
            "check_rate_limit",
            {
                "p_bucket_key": bucket_key,
                "p_window_seconds": window_seconds,
                "p_max_requests": max_requests,
            },
        ).execute()
        if result.data is None:
            return True
        return bool(result.data)
    except Exception as e:
        logger.warning(f"postgres_rate_limit_error bucket={bucket_key}: {e}")
        return True


def rate_limit_or_429(bucket_key: str, window_seconds: int, max_requests: int) -> Optional[tuple]:
    """Returns (json_body, status_code) if limited, else None."""
    if check_postgres_rate_limit(bucket_key, window_seconds, max_requests):
        return None
    return (
        {
            "success": False,
            "error": "Too many requests",
            "error_code": "RATE_LIMITED",
        },
        429,
    )
