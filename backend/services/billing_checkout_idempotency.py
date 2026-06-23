"""
Checkout idempotency with claim_token fencing and stale PROCESSING reclaim.

Used by billing_api.create_subscription before Razorpay calls.
"""

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from config.billing_flags import get_int_flag, get_bool_flag

logger = logging.getLogger('reviseit.billing.checkout_idempotency')


class IdempotencyInProgress(Exception):
    """Another worker holds the claim or reclaim not yet eligible."""

    def __init__(self, retry_after_seconds: int = 5):
        self.retry_after_seconds = retry_after_seconds
        super().__init__('Request already in progress')


class IdempotencyFencingLost(Exception):
    """Completion attempted after claim_token was rotated."""


def _reclaim_ttl_seconds() -> int:
    return get_int_flag('idempotency_reclaim_ttl_seconds', 90)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None


def resolve_idempotency_user_id(
    db,
    firebase_uid: Optional[str] = None,
    candidate_user_id: Optional[str] = None,
) -> Optional[str]:
    """
    Resolve a user_id that satisfies idempotency_records FK (public.users).

    Firebase Auth users live in public.users, not auth.users. Returns None when
    no row exists — idempotency is still keyed by idempotency key + tenant_id.
    """
    try:
        if firebase_uid:
            result = (
                db.table('users')
                .select('id')
                .eq('firebase_uid', firebase_uid)
                .limit(1)
                .execute()
            )
            if result.data:
                return result.data[0].get('id')

        if candidate_user_id and len(str(candidate_user_id)) == 36:
            result = (
                db.table('users')
                .select('id')
                .eq('id', candidate_user_id)
                .limit(1)
                .execute()
            )
            if result.data:
                return result.data[0].get('id')
    except Exception as e:
        logger.warning(f"idempotency_user_resolve_failed uid={firebase_uid}: {e}")

    return None


def _insert_processing_claim(
    db,
    key: str,
    user_id: Optional[str],
    tenant_id: Optional[str],
    my_token: str,
):
    return db.table('idempotency_records').insert({
        'key': key,
        'status': 'PROCESSING',
        'user_id': user_id,
        'tenant_id': tenant_id,
        'claim_token': my_token,
        'reclaim_count': 0,
        'created_at': _now_iso(),
        'updated_at': _now_iso(),
        'expires_at': (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
    }).execute()


def _is_user_fk_violation(exc: Exception) -> bool:
    if '23503' in str(exc):
        return True
    code = getattr(exc, 'code', None)
    if code == '23503':
        return True
    if exc.args and isinstance(exc.args[0], dict):
        return exc.args[0].get('code') == '23503'
    return 'foreign key' in str(exc).lower() and 'user_id' in str(exc).lower()


def claim_or_reclaim(
    db,
    key: str,
    user_id: Optional[str],
    tenant_id: Optional[str],
    firebase_uid: Optional[str] = None,
) -> Tuple[str, str]:
    """
    Claim idempotency key or reclaim stale PROCESSING row.

    Returns (key, claim_token).
    Raises IdempotencyInProgress if in-flight and not reclaimable.
    """
    if not get_bool_flag('fix_server_idempotency', True):
        return key, str(uuid.uuid4())

    my_token = str(uuid.uuid4())
    reclaim_ttl = _reclaim_ttl_seconds()
    resolved_user_id = resolve_idempotency_user_id(db, firebase_uid, user_id)

    try:
        insert_result = _insert_processing_claim(
            db, key, resolved_user_id, tenant_id, my_token
        )
        if insert_result.data:
            logger.info(f"idempotency_claimed key={key[:12]}... token={my_token[:8]}")
            return key, my_token
    except Exception as e:
        err = str(e).lower()

        # FK miss (legacy auth.users FK or missing users row) — claim without user_id
        if resolved_user_id and _is_user_fk_violation(e):
            logger.warning(
                f"idempotency_user_fk_miss user_id={resolved_user_id[:8]}... "
                f"— retrying claim with null user_id"
            )
            try:
                insert_result = _insert_processing_claim(db, key, None, tenant_id, my_token)
                if insert_result.data:
                    return key, my_token
            except Exception as retry_e:
                err = str(retry_e).lower()
                e = retry_e

        if 'duplicate key' not in err and '23505' not in err:
            raise

    existing = db.table('idempotency_records').select('*').eq('key', key).maybe_single().execute()
    row = existing.data if hasattr(existing, 'data') else None
    if not row:
        raise IdempotencyInProgress(retry_after_seconds=3)

    status = row.get('status')
    if status == 'COMPLETE':
        return key, row.get('claim_token') or ''

    if status == 'FAILED':
        # Allow retry after brief cooldown
        updated = _parse_dt(row.get('updated_at') or row.get('completed_at'))
        if updated and (datetime.now(timezone.utc) - updated).total_seconds() < 30:
            raise IdempotencyInProgress(retry_after_seconds=30)
        db.table('idempotency_records').delete().eq('key', key).execute()
        return claim_or_reclaim(db, key, user_id, tenant_id)

    if status == 'PROCESSING':
        updated = _parse_dt(row.get('updated_at') or row.get('created_at'))
        age_seconds = (datetime.now(timezone.utc) - updated).total_seconds() if updated else 0
        if age_seconds < reclaim_ttl:
            retry_after = max(1, int(reclaim_ttl - age_seconds))
            logger.info(
                f"idempotency_in_progress key={key[:12]}... age={age_seconds:.0f}s "
                f"reclaim_in={retry_after}s"
            )
            raise IdempotencyInProgress(retry_after_seconds=retry_after)

        # Stale reclaim with claim_token rotation
        reclaim_result = db.table('idempotency_records').update({
            'status': 'PROCESSING',
            'claim_token': my_token,
            'updated_at': _now_iso(),
            'reclaim_count': (row.get('reclaim_count') or 0) + 1,
        }).eq('key', key).eq('status', 'PROCESSING').execute()

        if reclaim_result.data:
            reclaim_count = (row.get('reclaim_count') or 0) + 1
            if reclaim_count > 2:
                logger.warning(
                    f"idempotency_reclaim_thrash key={key[:12]}... reclaim_count={reclaim_count}"
                )
            logger.info(f"idempotency_reclaimed key={key[:12]}... token={my_token[:8]}")
            return key, my_token

        raise IdempotencyInProgress(retry_after_seconds=5)

    raise IdempotencyInProgress(retry_after_seconds=5)


def get_cached_complete(db, key: str) -> Optional[Dict[str, Any]]:
    """Return cached COMPLETE result if present."""
    try:
        result = db.table('idempotency_records').select('status, result').eq('key', key).maybe_single().execute()
        row = result.data if hasattr(result, 'data') else None
        if row and row.get('status') == 'COMPLETE' and row.get('result'):
            raw = row['result']
            if isinstance(raw, str):
                return json.loads(raw)
            return raw
    except Exception as e:
        logger.error(f"idempotency_cache_read_error key={key[:12]}: {e}")
    return None


def complete_claim(
    db,
    key: str,
    claim_token: str,
    response_payload: Dict[str, Any],
) -> bool:
    """Mark COMPLETE only if claim_token still matches. Returns True if row updated."""
    update_result = db.table('idempotency_records').update({
        'status': 'COMPLETE',
        'result': response_payload,
        'completed_at': _now_iso(),
        'updated_at': _now_iso(),
    }).eq('key', key).eq('claim_token', claim_token).execute()

    updated = bool(update_result.data)
    if not updated:
        logger.warning(
            f"idempotency_fencing_lost key={key[:12]}... token={claim_token[:8]} "
            f"— completion dropped; check for orphan Razorpay sub"
        )
    return updated


def fail_claim(db, key: str, claim_token: str, error: str) -> bool:
    update_result = db.table('idempotency_records').update({
        'status': 'FAILED',
        'error': error[:500],
        'completed_at': _now_iso(),
        'updated_at': _now_iso(),
    }).eq('key', key).eq('claim_token', claim_token).execute()
    return bool(update_result.data)
