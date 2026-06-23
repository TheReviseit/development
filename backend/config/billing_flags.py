"""
Billing runtime flags — Postgres-backed with 30s in-process cache.

Env vars are fallback defaults when the flags table is unreachable.
"""

import json
import logging
import os
import time
from typing import Any, Dict, Optional

logger = logging.getLogger('reviseit.billing.flags')

_CACHE_TTL_SECONDS = 30
_cache: Dict[str, Any] = {}
_cache_loaded_at: float = 0.0

_DEFAULTS: Dict[str, Any] = {
    'fix_domain_context': True,
    'billing_behavior_pinning': True,
    'fix_webhook_lock_contention': True,
    'fix_auth_check_revoked': True,
    'fix_409_recovery': True,
    'fix_checkout_user_id': True,
    'fix_server_idempotency': True,
    'webhook_dlq_on_exhausted': True,
    'canary_percent': 0,
    'billing_timeout_ms': 20000,
    'cb_threshold': 10,
    'cb_count_timeout_as_failure': False,
    'idempotency_reclaim_ttl_seconds': 90,
    'billing_sync_checkout': False,
    'checkout_bg_max_workers': 1,
    'use_activation_service': True,
    'deprecate_legacy_payments_create': True,
}


def _parse_flag_value(raw: Any) -> Any:
    if raw is None:
        return None
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float)):
        return raw
    if isinstance(raw, str):
        lower = raw.lower()
        if lower in ('true', 'false'):
            return lower == 'true'
        try:
            if '.' in raw:
                return float(raw)
            return int(raw)
        except ValueError:
            return raw
    return raw


def _load_flags_from_db() -> Dict[str, Any]:
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        result = db.table('billing_runtime_flags').select('flag_key, flag_value').execute()
        flags = dict(_DEFAULTS)
        for row in (result.data or []):
            key = row.get('flag_key')
            if key:
                flags[key] = _parse_flag_value(row.get('flag_value'))
        return flags
    except Exception as e:
        logger.warning(f"billing_flags_db_load_failed: {e} — using env/defaults")
        return _load_flags_from_env()


def _load_flags_from_env() -> Dict[str, Any]:
    flags = dict(_DEFAULTS)
    env_map = {
        'fix_domain_context': 'BILLING_FIX_DOMAIN_CONTEXT',
        'fix_webhook_lock_contention': 'BILLING_FIX_WEBHOOK_LOCK_CONTENTION',
        'fix_auth_check_revoked': 'BILLING_FIX_AUTH_CHECK_REVOKED',
        'fix_409_recovery': 'BILLING_FIX_409_RECOVERY',
        'fix_checkout_user_id': 'BILLING_FIX_CHECKOUT_USER_ID',
        'fix_server_idempotency': 'BILLING_FIX_SERVER_IDEMPOTENCY',
        'webhook_dlq_on_exhausted': 'BILLING_WEBHOOK_DLQ_ON_EXHAUSTED',
        'billing_behavior_pinning': 'BILLING_BEHAVIOR_PINNING',
    }
    for key, env_name in env_map.items():
        val = os.getenv(env_name)
        if val is not None:
            flags[key] = val.lower() == 'true'
    for int_key, env_name, default in (
        ('canary_percent', 'BILLING_CANARY_PERCENT', 0),
        ('billing_timeout_ms', 'BILLING_TIMEOUT_MS', 20000),
        ('cb_threshold', 'BILLING_CB_THRESHOLD', 10),
        ('idempotency_reclaim_ttl_seconds', 'BILLING_IDEMPOTENCY_RECLAIM_TTL_SECONDS', 90),
    ):
        val = os.getenv(env_name)
        if val is not None:
            try:
                flags[int_key] = int(val)
            except ValueError:
                flags[int_key] = default
    cb_timeout = os.getenv('BILLING_CB_COUNT_TIMEOUT_AS_FAILURE')
    if cb_timeout is not None:
        flags['cb_count_timeout_as_failure'] = cb_timeout.lower() == 'true'
    return flags


def get_all_flags(force_refresh: bool = False) -> Dict[str, Any]:
    global _cache, _cache_loaded_at
    now = time.time()
    if not force_refresh and _cache and (now - _cache_loaded_at) < _CACHE_TTL_SECONDS:
        return dict(_cache)
    _cache = _load_flags_from_db()
    _cache_loaded_at = now
    return dict(_cache)


def get_flag(key: str, default: Any = None) -> Any:
    flags = get_all_flags()
    if key in flags:
        return flags[key]
    return _DEFAULTS.get(key, default)


def get_bool_flag(key: str, default: bool = True) -> bool:
    val = get_flag(key, default)
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() == 'true'
    return bool(val)


def get_int_flag(key: str, default: int = 0) -> int:
    val = get_flag(key, default)
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def invalidate_cache() -> None:
    global _cache_loaded_at
    _cache_loaded_at = 0.0
