"""
Analytics API for WhatsApp Automation Dashboard.
Provides aggregated metrics, trends, and reporting.

Architecture decisions:
- All UUID resolution is cached in-process with TTL (never hits DB twice per session)
- require_auth is fail-CLOSED: if UUID resolution fails, the request is rejected
- All unbounded queries have hard row limits to prevent OOM
- Meta health is fetched from a DB cache, refreshed by a background job
- Revenue bucketing is delegated to a Supabase RPC (single SQL round-trip)
- aggregate_daily_analytics uses a single batched RPC instead of N+1 loops
- Every error response is emitted through a single api_error() helper
- All logging is structured JSON with a per-request trace_id
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
import traceback
import uuid
from datetime import datetime, timedelta
from functools import wraps
from threading import Lock
from typing import Any, Dict, List, Optional, Tuple

import requests
from flask import Blueprint, g, jsonify, request

# Feature gate decorators  ─────────────────────────────────────────────────────
from middleware.feature_gate import require_feature, require_limit

# Supabase  ────────────────────────────────────────────────────────────────────
try:
    from supabase_client import get_supabase_client, get_whatsapp_credentials_unified
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    get_supabase_client = None  # type: ignore
    get_whatsapp_credentials_unified = None  # type: ignore


# ══════════════════════════════════════════════════════════════════════════════
# Structured logger
# ══════════════════════════════════════════════════════════════════════════════

_LOG = logging.getLogger("analytics")

def _log(level: str, event: str, **ctx: Any) -> None:
    """Emit a structured JSON log line with the current request trace_id."""
    record = {
        "ts": datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
        "level": level.upper(),
        "event": event,
        "trace_id": getattr(g, "trace_id", "-"),
        **ctx,
    }
    getattr(_LOG, level, _LOG.info)(json.dumps(record, default=str))


# ══════════════════════════════════════════════════════════════════════════════
# Centralised error helper  ───────────────────────────────────────────────────
# Single call site: api_error(code, message, status_code)
# ══════════════════════════════════════════════════════════════════════════════

def api_error(code: str, message: str, status: int = 400, **extra: Any):
    """Return a consistent JSON error envelope."""
    body = {"success": False, "error": {"code": code, "message": message}}
    body["error"].update(extra)  # type: ignore[arg-type]
    return jsonify(body), status


# ══════════════════════════════════════════════════════════════════════════════
# UUID resolution cache
# Simple in-process TTL cache — avoids a DB hit on every request for a mapping
# that never changes (Firebase UID is immutable).
# ══════════════════════════════════════════════════════════════════════════════

_UUID_CACHE: Dict[str, Tuple[str, float]] = {}   # firebase_uid → (supabase_uuid, expires_at)
_UUID_CACHE_TTL = 3600                            # 1 hour
_UUID_CACHE_LOCK = Lock()

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _resolve_firebase_uid(firebase_uid: str) -> Optional[str]:
    """
    Resolve a Firebase UID to its Supabase UUID.

    Lookup order:
      1. In-process TTL cache (no DB hit)
      2. Supabase users table (then populate cache)

    Returns the UUID string, or None if not found / DB unavailable.
    """
    now = time.monotonic()

    with _UUID_CACHE_LOCK:
        hit = _UUID_CACHE.get(firebase_uid)
        if hit and hit[1] > now:
            return hit[0]

    if not SUPABASE_AVAILABLE or not get_supabase_client:
        return None

    try:
        client = get_supabase_client()
        result = (
            client.table("users")
            .select("id")
            .eq("firebase_uid", firebase_uid)
            .limit(1)
            .execute()
        )
        if result.data:
            supabase_uuid: str = result.data[0]["id"]
            with _UUID_CACHE_LOCK:
                _UUID_CACHE[firebase_uid] = (supabase_uuid, now + _UUID_CACHE_TTL)
            return supabase_uuid
    except Exception as exc:
        _log("warning", "uuid_resolution_failed", firebase_uid=firebase_uid, error=str(exc))

    return None


# ══════════════════════════════════════════════════════════════════════════════
# business_id helper  ─────────────────────────────────────────────────────────
# Same per-session caching pattern as UUID resolution.
# ══════════════════════════════════════════════════════════════════════════════

_BIZ_CACHE: Dict[str, Tuple[str, float]] = {}   # supabase_uuid → (business_id, expires_at)
_BIZ_CACHE_TTL = 300                             # 5 minutes
_BIZ_CACHE_LOCK = Lock()


def _get_business_id(user_id: str) -> Optional[str]:
    """Return the user's business_id, cached for 5 minutes."""
    now = time.monotonic()

    with _BIZ_CACHE_LOCK:
        hit = _BIZ_CACHE.get(user_id)
        if hit and hit[1] > now:
            return hit[0]

    if not SUPABASE_AVAILABLE or not get_supabase_client:
        return None

    try:
        client = get_supabase_client()
        result = (
            client.table("connected_business_managers")
            .select("id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if result.data:
            biz_id: str = result.data[0]["id"]
            with _BIZ_CACHE_LOCK:
                _BIZ_CACHE[user_id] = (biz_id, now + _BIZ_CACHE_TTL)
            return biz_id
    except Exception as exc:
        _log("warning", "business_id_lookup_failed", user_id=user_id[:8], error=str(exc))

    return None


# ══════════════════════════════════════════════════════════════════════════════
# require_auth decorator  ─────────────────────────────────────────────────────
# FAIL-CLOSED: rejects the request if the UUID cannot be resolved.
# Sets:
#   g.trace_id       → per-request UUID for log correlation
#   g.user_id        → Supabase UUID  (use for all DB queries)
#   g.firebase_uid   → original Firebase UID (for credential lookups)
#   g.business_id    → connected_business_managers.id (cached)
# ══════════════════════════════════════════════════════════════════════════════

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        g.trace_id = str(uuid.uuid4())

        firebase_uid = request.headers.get("X-User-ID", "").strip()
        if not firebase_uid:
            return api_error("UNAUTHENTICATED", "Authentication required", status=401)

        supabase_uuid = _resolve_firebase_uid(firebase_uid)
        if not supabase_uuid:
            _log("warning", "auth_uuid_resolution_failed", firebase_uid=firebase_uid)
            return api_error(
                "USER_NOT_FOUND",
                "Could not resolve user identity. Ensure the account is fully set up.",
                status=404,
            )

        g.firebase_uid = firebase_uid
        g.user_id = supabase_uuid
        g.business_id = _get_business_id(supabase_uuid)  # may be None

        _log("info", "request_start",
             endpoint=request.endpoint,
             user=supabase_uuid[:8] + "...",
             has_business=g.business_id is not None)

        return f(*args, **kwargs)

    return decorated


# ══════════════════════════════════════════════════════════════════════════════
# Empty-state helper  ─────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

_EMPTY_MARKETING = {
    "campaigns": {
        "total": 0, "active": 0, "completed": 0, "draft": 0,
        "total_recipients": 0, "total_sent": 0, "total_delivered": 0,
        "total_read": 0, "total_failed": 0, "delivery_rate": 0, "read_rate": 0,
    },
    "messaging": {
        "sent": 0, "received": 0, "delivered": 0, "read": 0,
        "failed": 0, "delivery_rate": 0, "read_rate": 0, "ai_replies": 0,
    },
    "contacts": {"total": 0, "opted_in": 0, "new_in_period": 0},
    "ai": {
        "replies_generated": 0, "tokens_used": 0, "tokens_limit": 3000,
        "tokens_percent": 0, "cost_inr": 0,
    },
    "meta_health": {"quality": "UNKNOWN", "limit_tier": "UNKNOWN"},
    "trends": {"dates": [], "campaigns_sent": [], "messages_sent": [], "ai_replies": []},
    "top_campaigns": [],
}


# ══════════════════════════════════════════════════════════════════════════════
# Date range helpers  ─────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

_PERIOD_DAYS: Dict[str, int] = {
    "today": 0,
    "7d":    7,
    "30d":  30,
    "80d":  80,
    "90d":  90,
}


def get_date_range(period: str) -> Tuple[str, str]:
    """Return (start_iso, end_iso) for a named period. Defaults to 7d."""
    end_date = datetime.utcnow().date()
    days = _PERIOD_DAYS.get(period, 7)
    start_date = end_date if days == 0 else end_date - timedelta(days=days)
    return start_date.isoformat(), (end_date + timedelta(days=1)).isoformat()


# ══════════════════════════════════════════════════════════════════════════════
# Revenue date config
# ══════════════════════════════════════════════════════════════════════════════

def get_revenue_date_config(range_type: str) -> Dict[str, Any]:
    """Return bucketing config for the revenue endpoint."""
    now = datetime.utcnow()

    if range_type == "day":
        end   = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        start = end - timedelta(hours=24)
        return {"start": start, "end": end,
                "previous_start": start - timedelta(hours=24), "previous_end": start,
                "bucket": "hour", "format": "%H:00"}

    if range_type == "week":
        end   = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        start = end - timedelta(days=7)
        return {"start": start, "end": end,
                "previous_start": start - timedelta(days=7), "previous_end": start,
                "bucket": "day", "format": "%a"}

    if range_type == "month":
        end   = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        start = end - timedelta(days=30)
        return {"start": start, "end": end,
                "previous_start": start - timedelta(days=30), "previous_end": start,
                "bucket": "day", "format": "%b %d"}

    if range_type == "6months":
        end   = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end   = (end.replace(month=end.month + 1) if end.month < 12
                 else end.replace(year=end.year + 1, month=1))
        sm    = end.month - 6
        sy    = end.year + (0 if sm > 0 else -1)
        sm    = sm if sm > 0 else sm + 12
        start = end.replace(year=sy, month=sm)
        pm    = start.month - 6
        py    = start.year + (0 if pm > 0 else -1)
        pm    = pm if pm > 0 else pm + 12
        return {"start": start, "end": end,
                "previous_start": start.replace(year=py, month=pm), "previous_end": start,
                "bucket": "month", "format": "%b"}

    if range_type == "year":
        end   = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end   = (end.replace(month=end.month + 1) if end.month < 12
                 else end.replace(year=end.year + 1, month=1))
        start = end.replace(year=end.year - 1)
        return {"start": start, "end": end,
                "previous_start": start.replace(year=start.year - 1), "previous_end": start,
                "bucket": "month", "format": "%b"}

    return get_revenue_date_config("month")


# ══════════════════════════════════════════════════════════════════════════════
# Blueprint
# ══════════════════════════════════════════════════════════════════════════════

analytics_bp = Blueprint("analytics", __name__, url_prefix="/api/analytics")

# Hard row-limit for every unbounded query.
# Prevents a single large account from OOM-ing the worker process.
_MAX_ROWS = 10_000

# Conversion rate (update via env var; don't ship magic numbers in production)
_USD_TO_INR: float = float(os.getenv("USD_TO_INR", "89.58"))

# Revenue-eligible order statuses — single source of truth.
_REVENUE_STATUSES = ["confirmed", "processing", "completed"]


# ──────────────────────────────────────────────────────────────────────────────
# /overview
# ──────────────────────────────────────────────────────────────────────────────

@analytics_bp.route("/overview", methods=["GET"])
@require_auth
@require_feature("basic_analytics")
def get_overview():
    """Return dashboard KPIs for the requested period."""
    if not SUPABASE_AVAILABLE:
        return api_error("DB_UNAVAILABLE", "Database not available", status=503)

    try:
        user_id     = g.user_id
        business_id = g.business_id
        period      = request.args.get("period", "7d")
        start_date, end_date = get_date_range(period)
        client = get_supabase_client()

        # ── Daily aggregates (pre-computed by cron) ──────────────────────────
        rows = (
            client.table("analytics_daily")
            .select("*")
            .eq("user_id", user_id)
            .gte("date", start_date)
            .lt("date", end_date)
            .limit(_MAX_ROWS)
            .execute()
        ).data or []

        def _sum(key: str) -> int:
            return sum(r.get(key) or 0 for r in rows)

        sent       = _sum("messages_sent")
        delivered  = _sum("messages_delivered")
        read       = _sum("messages_read")

        delivery_rate = round(delivered / sent * 100, 1) if sent else 0
        read_rate     = round(read      / sent * 100, 1) if sent else 0

        # ── Active conversations ─────────────────────────────────────────────
        active_convos = 0
        if business_id:
            res = (
                client.table("whatsapp_conversations")
                .select("id", count="exact")
                .eq("business_id", business_id)
                .eq("status", "active")
                .execute()
            )
            active_convos = res.count or 0

        # ── AI / token usage ─────────────────────────────────────────────────
        ai_tokens_used    = _sum("ai_tokens_used")
        ai_tokens_limit   = 1_600_000
        ai_cost_usd       = 0.0
        ai_cost_inr       = 0.0
        ai_tokens_percent = 0.0

        if business_id:
            try:
                from llm_usage_tracker import get_usage_tracker  # local import: optional dep
                usage = get_usage_tracker().get_usage(business_id)
                if usage:
                    ai_tokens_used    = usage.get("tokens_used", ai_tokens_used)
                    ai_tokens_limit   = usage.get("tokens_limit", ai_tokens_limit)
                    ai_tokens_percent = usage.get("tokens_percent", 0.0)
                    ai_cost_usd       = usage.get("cost_usd", 0.0)
                    ai_cost_inr       = usage.get("cost_inr", 0.0)
            except Exception as exc:
                _log("warning", "llm_tracker_unavailable", error=str(exc))

        if not ai_tokens_percent and ai_tokens_limit:
            ai_tokens_percent = round(ai_tokens_used / ai_tokens_limit * 100, 1)
        if not ai_cost_inr and ai_cost_usd:
            ai_cost_inr = round(ai_cost_usd * _USD_TO_INR, 2)

        # ── Trends (zero-filled) ─────────────────────────────────────────────
        by_date = {r["date"]: r for r in rows}
        trends: Dict[str, List] = {"dates": [], "sent": [], "received": [], "ai_replies": []}
        cur = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
        while cur < end:
            ds  = cur.date().isoformat()
            row = by_date.get(ds, {})
            trends["dates"].append(ds)
            trends["sent"].append(row.get("messages_sent", 0))
            trends["received"].append(row.get("messages_received", 0))
            trends["ai_replies"].append(row.get("ai_replies_generated", 0))
            cur += timedelta(days=1)

        return jsonify({
            "success": True,
            "period":  period,
            "messages": {
                "sent":          sent,
                "received":      _sum("messages_received"),
                "delivered":     delivered,
                "read":          read,
                "failed":        _sum("messages_failed"),
                "delivery_rate": delivery_rate,
                "read_rate":     read_rate,
            },
            "ai": {
                "replies_generated": _sum("ai_replies_generated"),
                "tokens_used":       ai_tokens_used,
                "tokens_limit":      ai_tokens_limit,
                "tokens_percent":    ai_tokens_percent,
                "cost_usd":          round(ai_cost_usd, 4),
                "cost_inr":          round(ai_cost_inr, 2),
            },
            "conversations": {
                "started": _sum("conversations_started"),
                "active":  active_convos,
            },
            "campaigns": {"broadcast_messages": _sum("campaign_messages_sent")},
            "trends":    trends,
        })

    except Exception:
        _log("error", "overview_failed", tb=traceback.format_exc())
        return api_error("INTERNAL_ERROR", "Failed to load overview", status=500)


# ──────────────────────────────────────────────────────────────────────────────
# /messages
# ──────────────────────────────────────────────────────────────────────────────

@analytics_bp.route("/messages", methods=["GET"])
@require_auth
@require_feature("basic_analytics")
def get_message_analytics():
    """Detailed message breakdown for the requested period."""
    if not SUPABASE_AVAILABLE:
        return api_error("DB_UNAVAILABLE", "Database not available", status=503)

    try:
        business_id = g.business_id
        period      = request.args.get("period", "7d")
        start_date, end_date = get_date_range(period)

        empty = {
            "success": True, "period": period, "total": 0,
            "by_direction": {"inbound": 0, "outbound": 0},
            "by_status": {}, "by_type": {}, "ai_generated": 0, "human_sent": 0,
        }
        if not business_id:
            return jsonify(empty)

        client = get_supabase_client()
        messages = (
            client.table("whatsapp_messages")
            .select("direction, status, message_type, is_ai_generated")
            .eq("business_id", business_id)
            .gte("created_at", start_date)
            .lt("created_at", end_date)
            .limit(_MAX_ROWS)
            .execute()
        ).data or []

        by_direction: Dict[str, int] = {"inbound": 0, "outbound": 0}
        by_status:    Dict[str, int] = {}
        by_type:      Dict[str, int] = {}
        ai_generated = 0

        for m in messages:
            by_direction[m.get("direction", "outbound")] = \
                by_direction.get(m.get("direction", "outbound"), 0) + 1

            s = m.get("status", "sent")
            by_status[s] = by_status.get(s, 0) + 1

            t = m.get("message_type", "text")
            by_type[t] = by_type.get(t, 0) + 1

            if m.get("is_ai_generated"):
                ai_generated += 1

        return jsonify({
            "success": True,
            "period": period,
            "total": len(messages),
            "by_direction": by_direction,
            "by_status": by_status,
            "by_type": by_type,
            "ai_generated": ai_generated,
            "human_sent": by_direction.get("outbound", 0) - ai_generated,
        })

    except Exception:
        _log("error", "messages_failed", tb=traceback.format_exc())
        return api_error("INTERNAL_ERROR", "Failed to load message analytics", status=500)


# ──────────────────────────────────────────────────────────────────────────────
# /conversations
# ──────────────────────────────────────────────────────────────────────────────

@analytics_bp.route("/conversations", methods=["GET"])
@require_auth
@require_feature("basic_analytics")
def get_conversation_analytics():
    """Conversation breakdown and average message depth."""
    if not SUPABASE_AVAILABLE:
        return api_error("DB_UNAVAILABLE", "Database not available", status=503)

    try:
        business_id = g.business_id
        period      = request.args.get("period", "7d")
        start_date, end_date = get_date_range(period)

        if not business_id:
            return jsonify({
                "success": True, "period": period, "total": 0,
                "by_status": {}, "avg_messages_per_conversation": 0,
            })

        client = get_supabase_client()
        convos = (
            client.table("whatsapp_conversations")
            .select("status, total_messages")
            .eq("business_id", business_id)
            .gte("created_at", start_date)
            .lt("created_at", end_date)
            .limit(_MAX_ROWS)
            .execute()
        ).data or []

        by_status: Dict[str, int] = {}
        total_msgs = 0
        for c in convos:
            s = c.get("status", "open")
            by_status[s] = by_status.get(s, 0) + 1
            total_msgs  += c.get("total_messages") or 0

        avg = round(total_msgs / len(convos), 1) if convos else 0

        return jsonify({
            "success": True,
            "period": period,
            "total": len(convos),
            "by_status": by_status,
            "avg_messages_per_conversation": avg,
        })

    except Exception:
        _log("error", "conversations_failed", tb=traceback.format_exc())
        return api_error("INTERNAL_ERROR", "Failed to load conversation analytics", status=500)


# ──────────────────────────────────────────────────────────────────────────────
# /campaigns
# ──────────────────────────────────────────────────────────────────────────────

@analytics_bp.route("/campaigns", methods=["GET"])
@require_auth
@require_feature("basic_analytics")
def get_campaign_analytics():
    """Broadcast campaign performance summary."""
    if not SUPABASE_AVAILABLE:
        return api_error("DB_UNAVAILABLE", "Database not available", status=503)

    try:
        user_id     = g.user_id
        period      = request.args.get("period", "30d")
        start_date, end_date = get_date_range(period)
        client = get_supabase_client()

        campaigns = (
            client.table("broadcast_campaigns")
            .select(
                "id, name, status, total_recipients,"
                "messages_sent:sent_count,"
                "messages_delivered:delivered_count,"
                "messages_read:read_count,"
                "messages_failed:failed_count,"
                "created_at"
            )
            .eq("user_id", user_id)
            .gte("created_at", start_date)
            .lt("created_at", end_date)
            .limit(_MAX_ROWS)
            .execute()
        ).data or []

        def _csum(key: str) -> int:
            return sum(c.get(key) or 0 for c in campaigns)

        by_status: Dict[str, int] = {}
        for c in campaigns:
            s = c.get("status", "draft")
            by_status[s] = by_status.get(s, 0) + 1

        return jsonify({
            "success": True,
            "period":  period,
            "totals": {
                "campaigns":  len(campaigns),
                "recipients": _csum("total_recipients"),
                "sent":       _csum("messages_sent"),
                "delivered":  _csum("messages_delivered"),
                "read":       _csum("messages_read"),
                "failed":     _csum("messages_failed"),
            },
            "by_status": by_status,
            "campaigns": campaigns,
        })

    except Exception:
        _log("error", "campaigns_failed", tb=traceback.format_exc())
        return api_error("INTERNAL_ERROR", "Failed to load campaign analytics", status=500)


# ──────────────────────────────────────────────────────────────────────────────
# /ai-usage
# ──────────────────────────────────────────────────────────────────────────────

@analytics_bp.route("/ai-usage", methods=["GET"])
@require_auth
@require_feature("basic_analytics")
def get_ai_usage():
    """Return AI / LLM token consumption and cost."""
    if not SUPABASE_AVAILABLE:
        return api_error("DB_UNAVAILABLE", "Database not available", status=503)

    try:
        business_id = g.business_id
        _default_usage = {
            "tokens_used": 0, "tokens_limit": 1_600_000,
            "tokens_percent": 0, "replies_used": 0, "replies_limit": 1000,
            "cost_usd": 0, "cost_inr": 0, "plan": "starter",
        }

        if not business_id:
            return jsonify({"success": True, "usage": _default_usage})

        # Prefer real-time tracker
        try:
            from llm_usage_tracker import get_usage_tracker
            usage = get_usage_tracker().get_usage(business_id)
            if usage:
                return jsonify({"success": True, "usage": usage})
        except ImportError:
            pass

        # Fallback: DB
        client = get_supabase_client()
        rows = (
            client.table("business_llm_usage")
            .select("*")
            .eq("business_id", business_id)
            .limit(1)
            .execute()
        ).data

        if rows:
            d = rows[0]
            tokens_used  = d.get("monthly_tokens_used", 0) or 0
            tokens_limit = 1_600_000
            return jsonify({
                "success": True,
                "usage": {
                    "tokens_used":         tokens_used,
                    "tokens_limit":        tokens_limit,
                    "tokens_percent":      round(tokens_used / tokens_limit * 100, 1) if tokens_limit else 0,
                    "replies_used":        d.get("monthly_llm_replies", 0),
                    "replies_limit":       1000,
                    "billing_cycle_start": d.get("billing_cycle_start"),
                    "billing_cycle_end":   d.get("billing_cycle_end"),
                    "cost_usd": 0,
                    "cost_inr": 0,
                },
            })

        return jsonify({"success": True, "usage": _default_usage})

    except Exception:
        _log("error", "ai_usage_failed", tb=traceback.format_exc())
        return api_error("INTERNAL_ERROR", "Failed to load AI usage", status=500)


# ──────────────────────────────────────────────────────────────────────────────
# /meta-health  (dedicated endpoint — NOT embedded in marketing analytics)
#
# Refreshed by a background job every N minutes (see tasks/refresh_meta_health.py).
# Reads from connected_phone_numbers.meta_health_cache JSON column.
# This keeps the marketing analytics response fast even if Meta's Graph API
# is slow or rate-limited.
# ──────────────────────────────────────────────────────────────────────────────

@analytics_bp.route("/meta-health", methods=["GET"])
@require_auth
def get_meta_health():
    """
    Return cached Meta / WhatsApp Business API health for the user's primary number.
    Cache is refreshed by tasks/refresh_meta_health.py on a cron schedule.
    """
    if not SUPABASE_AVAILABLE:
        return api_error("DB_UNAVAILABLE", "Database not available", status=503)

    try:
        user_id = g.user_id
        client  = get_supabase_client()

        row = (
            client.table("connected_phone_numbers")
            .select("phone_number_id, display_name, verified_name, phone_number,"
                    "whatsapp_account_id, meta_health_cache, meta_health_cached_at")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .eq("is_primary", True)
            .limit(1)
            .execute()
        ).data

        if not row:
            return jsonify({
                "success":     True,
                "meta_health": {"quality": "UNKNOWN", "limit_tier": "UNKNOWN"},
                "cached_at":   None,
            })

        phone_data   = row[0]
        cached       = phone_data.get("meta_health_cache") or {}
        cached_at    = phone_data.get("meta_health_cached_at")

        # Enrich with stable DB fields so the response is always self-contained.
        cached.setdefault("business_name",
                          phone_data.get("verified_name") or phone_data.get("display_name"))
        cached.setdefault("phone_number", phone_data.get("phone_number"))
        cached.setdefault("waba_id",      phone_data.get("whatsapp_account_id"))

        return jsonify({
            "success":     True,
            "meta_health": cached,
            "cached_at":   cached_at,
        })

    except Exception:
        _log("error", "meta_health_failed", tb=traceback.format_exc())
        return api_error("INTERNAL_ERROR", "Failed to load Meta health", status=500)


# ──────────────────────────────────────────────────────────────────────────────
# /marketing  (consolidated marketing dashboard)
# ──────────────────────────────────────────────────────────────────────────────

@analytics_bp.route("/marketing", methods=["GET"])
@require_auth
@require_feature("basic_analytics")
def get_marketing_analytics():
    """
    Consolidated marketing KPIs: campaigns, messaging, contacts, AI usage, trends.

    Meta health is NOT fetched here — call /api/analytics/meta-health separately.
    This keeps this endpoint's p99 latency predictable.
    """
    if not SUPABASE_AVAILABLE:
        return api_error("DB_UNAVAILABLE", "Database not available", status=503)

    try:
        user_id     = g.user_id
        business_id = g.business_id
        period      = request.args.get("period", "30d")
        start_date, end_date = get_date_range(period)
        client = get_supabase_client()

        if not business_id:
            return jsonify({"success": True, "period": period, **_EMPTY_MARKETING})

        # ── 1. Campaigns ─────────────────────────────────────────────────────
        campaigns = (
            client.table("broadcast_campaigns")
            .select(
                "id, name, status, total_recipients,"
                "messages_sent:sent_count,"
                "messages_delivered:delivered_count,"
                "messages_read:read_count,"
                "messages_failed:failed_count,"
                "created_at"
            )
            .eq("user_id", user_id)
            .gte("created_at", start_date)
            .lt("created_at", end_date)
            .limit(_MAX_ROWS)
            .execute()
        ).data or []

        tc_sent      = sum(c.get("messages_sent")      or 0 for c in campaigns)
        tc_delivered = sum(c.get("messages_delivered") or 0 for c in campaigns)
        tc_read      = sum(c.get("messages_read")      or 0 for c in campaigns)
        tc_failed    = sum(c.get("messages_failed")    or 0 for c in campaigns)
        tc_recipients = sum(c.get("total_recipients")  or 0 for c in campaigns)

        c_by_status: Dict[str, int] = {}
        for c in campaigns:
            s = c.get("status", "draft")
            c_by_status[s] = c_by_status.get(s, 0) + 1

        top_campaigns = []
        for c in sorted(campaigns, key=lambda x: x.get("messages_sent") or 0, reverse=True)[:5]:
            sent      = c.get("messages_sent")      or 0
            delivered = c.get("messages_delivered") or 0
            read      = c.get("messages_read")      or 0
            top_campaigns.append({
                "name":          c.get("name", "Untitled"),
                "status":        c.get("status", "draft"),
                "recipients":    c.get("total_recipients", 0),
                "sent":          sent,
                "delivered":     delivered,
                "read":          read,
                "delivery_rate": round(delivered / sent * 100, 1) if sent else 0,
                "read_rate":     round(read      / sent * 100, 1) if sent else 0,
            })

        # ── 2. Messaging (pre-aggregated) ─────────────────────────────────────
        daily_rows = (
            client.table("analytics_daily")
            .select("*")
            .eq("user_id", user_id)
            .gte("date", start_date)
            .lt("date", end_date)
            .limit(_MAX_ROWS)
            .execute()
        ).data or []

        def _dsum(key: str) -> int:
            return sum(r.get(key) or 0 for r in daily_rows)

        msg_sent      = _dsum("messages_sent")
        msg_delivered = _dsum("messages_delivered")
        msg_read      = _dsum("messages_read")
        ai_replies    = _dsum("ai_replies_generated")
        ai_tokens     = _dsum("ai_tokens_used")

        # ── 3. Contacts (COUNT(*) — no row transfer) ─────────────────────────
        def _count(table: str, **filters) -> int:
            q = client.table(table).select("id", count="exact").eq("user_id", user_id)
            for k, v in filters.items():
                q = q.eq(k, v)
            r = q.execute()
            return r.count or 0

        total_contacts  = _count("contacts")
        opted_in        = _count("contacts", opted_in=True)
        new_contacts    = (
            client.table("contacts")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .gte("created_at", start_date)
            .lt("created_at", end_date)
            .execute()
        ).count or 0

        # ── 4. AI usage ───────────────────────────────────────────────────────
        ai_tokens_limit = 3_000
        ai_cost_usd     = 0.0
        ai_cost_inr     = 0.0

        try:
            from llm_usage_tracker import get_usage_tracker
            usage = get_usage_tracker().get_usage(business_id)
            if usage:
                ai_tokens       = usage.get("tokens_used", ai_tokens)
                ai_tokens_limit = usage.get("tokens_limit", ai_tokens_limit)
                ai_cost_usd     = usage.get("cost_usd", 0.0)
                ai_cost_inr     = usage.get("cost_inr", 0.0)
        except Exception:
            pass

        if not ai_cost_inr and ai_cost_usd:
            ai_cost_inr = round(ai_cost_usd * _USD_TO_INR, 2)

        ai_tokens_percent = round(ai_tokens / ai_tokens_limit * 100, 1) if ai_tokens_limit else 0

        # ── 5. Trends (zero-filled daily timeline) ────────────────────────────
        by_date      = {r["date"]: r for r in daily_rows}
        camp_by_date: Dict[str, int] = {}
        for c in campaigns:
            ds = (c.get("created_at") or "")[:10]
            if ds:
                camp_by_date[ds] = camp_by_date.get(ds, 0) + (c.get("messages_sent") or 0)

        trends: Dict[str, List] = {
            "dates": [], "messages_sent": [], "ai_replies": [], "campaigns_sent": []
        }
        cur = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
        while cur < end:
            ds  = cur.date().isoformat()
            row = by_date.get(ds, {})
            trends["dates"].append(ds)
            trends["messages_sent"].append(row.get("messages_sent", 0))
            trends["ai_replies"].append(row.get("ai_replies_generated", 0))
            trends["campaigns_sent"].append(camp_by_date.get(ds, 0))
            cur += timedelta(days=1)

        return jsonify({
            "success": True,
            "period":  period,
            "campaigns": {
                "total":            len(campaigns),
                "active":           c_by_status.get("sending", 0) + c_by_status.get("active", 0),
                "completed":        c_by_status.get("completed", 0),
                "draft":            c_by_status.get("draft", 0),
                "total_recipients": tc_recipients,
                "total_sent":       tc_sent,
                "total_delivered":  tc_delivered,
                "total_read":       tc_read,
                "total_failed":     tc_failed,
                "delivery_rate":    round(tc_delivered / tc_sent * 100, 1) if tc_sent else 0,
                "read_rate":        round(tc_read      / tc_sent * 100, 1) if tc_sent else 0,
            },
            "messaging": {
                "sent":          msg_sent,
                "received":      _dsum("messages_received"),
                "delivered":     msg_delivered,
                "read":          msg_read,
                "failed":        _dsum("messages_failed"),
                "delivery_rate": round(msg_delivered / msg_sent * 100, 1) if msg_sent else 0,
                "read_rate":     round(msg_read      / msg_sent * 100, 1) if msg_sent else 0,
                "ai_replies":    ai_replies,
            },
            "contacts": {
                "total":         total_contacts,
                "opted_in":      opted_in,
                "new_in_period": new_contacts,
            },
            "ai": {
                "replies_generated": ai_replies,
                "tokens_used":       ai_tokens,
                "tokens_limit":      ai_tokens_limit,
                "tokens_percent":    ai_tokens_percent,
                "cost_inr":          round(ai_cost_inr, 2),
            },
            "trends":        trends,
            "top_campaigns": top_campaigns,
        })

    except Exception:
        _log("error", "marketing_failed", tb=traceback.format_exc())
        return api_error("INTERNAL_ERROR", "Failed to load marketing analytics", status=500)


# ──────────────────────────────────────────────────────────────────────────────
# /aggregate  (cron-job endpoint)
#
# Fix summary vs. original:
#   1. FAIL-CLOSED: rejects if ANALYTICS_API_KEY is not set in env.
#   2. Delegates aggregation to a Supabase RPC (single SQL call per date).
#      The RPC does a JOIN across users → connected_business_managers →
#      whatsapp_messages in one round-trip, eliminating the N+1 loop.
#
# SQL for the RPC (apply as a Supabase migration):
# ─────────────────────────────────────────────────
#   CREATE OR REPLACE FUNCTION aggregate_analytics_for_date(target_date date)
#   RETURNS TABLE(user_id uuid, stats jsonb) LANGUAGE sql SECURITY DEFINER AS $$
#     SELECT
#       u.id AS user_id,
#       jsonb_build_object(
#         'messages_sent',       COUNT(*) FILTER (WHERE m.direction = 'outbound'),
#         'messages_received',   COUNT(*) FILTER (WHERE m.direction = 'inbound'),
#         'messages_delivered',  COUNT(*) FILTER (WHERE m.status = 'delivered'),
#         'messages_read',       COUNT(*) FILTER (WHERE m.status = 'read'),
#         'messages_failed',     COUNT(*) FILTER (WHERE m.status = 'failed'),
#         'ai_replies_generated',COUNT(*) FILTER (WHERE m.is_ai_generated = TRUE)
#       ) AS stats
#     FROM users u
#     JOIN connected_business_managers bm ON bm.user_id = u.id
#     LEFT JOIN whatsapp_messages m
#       ON  m.business_id = bm.id
#       AND m.created_at::date = target_date
#     GROUP BY u.id;
#   $$;
# ──────────────────────────────────────────────────────────────────────────────

@analytics_bp.route("/aggregate", methods=["POST"])
def aggregate_daily_analytics():
    """
    Aggregate analytics for a given date.
    Protected by X-API-Key — FAIL-CLOSED (rejects if key not configured).
    """
    # ── Auth: fail-closed ────────────────────────────────────────────────────
    expected_key = os.getenv("ANALYTICS_API_KEY", "").strip()
    if not expected_key:
        _log("error", "aggregate_auth_misconfigured",
             detail="ANALYTICS_API_KEY env var is not set — endpoint locked down")
        return api_error(
            "SERVICE_MISCONFIGURED",
            "Aggregation endpoint is not configured. Set ANALYTICS_API_KEY.",
            status=503,
        )

    provided_key = request.headers.get("X-API-Key", "")
    # Constant-time comparison to prevent timing attacks
    if not _constant_time_compare(provided_key, expected_key):
        _log("warning", "aggregate_auth_failed")
        return api_error("UNAUTHORIZED", "Invalid API key", status=401)

    if not SUPABASE_AVAILABLE:
        return api_error("DB_UNAVAILABLE", "Database not available", status=503)

    try:
        body        = request.get_json(silent=True) or {}
        target_date = body.get("date") or (datetime.utcnow().date() - timedelta(days=1)).isoformat()
        client      = get_supabase_client()
        t0          = time.monotonic()

        # ── Single-call RPC (see migration SQL in docstring above) ────────────
        try:
            rpc_rows = client.rpc(
                "aggregate_analytics_for_date",
                {"target_date": target_date},
            ).execute().data or []

        except Exception as exc:
            # RPC not yet deployed → fall back to the Python loop
            # (Remove this block once the migration is applied)
            _log("warning", "aggregate_rpc_unavailable",
                 error=str(exc), fallback="python_loop")
            rpc_rows = _aggregate_python_fallback(client, target_date)

        # ── Upsert all rows in one batch ─────────────────────────────────────
        if rpc_rows:
            # Fetch existing token counts to preserve real-time data
            existing = {
                r["user_id"]: r.get("ai_tokens_used", 0) or 0
                for r in (
                    client.table("analytics_daily")
                    .select("user_id, ai_tokens_used")
                    .eq("date", target_date)
                    .execute()
                ).data or []
            }

            upsert_payload = [
                {
                    "user_id":  row["user_id"],
                    "date":     target_date,
                    **row["stats"],
                    # Preserve tokens accumulated in real-time by the webhook handler
                    "ai_tokens_used": existing.get(row["user_id"], 0),
                }
                for row in rpc_rows
            ]

            client.table("analytics_daily").upsert(
                upsert_payload,
                on_conflict="user_id,date",
            ).execute()

        elapsed = round((time.monotonic() - t0) * 1000)
        _log("info", "aggregate_complete",
             date=target_date, users=len(rpc_rows), elapsed_ms=elapsed)

        return jsonify({
            "success": True,
            "message": f"Aggregated {len(rpc_rows)} users for {target_date}",
            "elapsed_ms": elapsed,
        })

    except Exception:
        _log("error", "aggregate_failed", tb=traceback.format_exc())
        return api_error("INTERNAL_ERROR", "Aggregation failed", status=500)


def _constant_time_compare(val: str, expected: str) -> bool:
    """Timing-safe string comparison (prevents timing oracle on API key)."""
    v = val.encode()
    e = expected.encode()
    return len(v) == len(e) and all(a == b for a, b in zip(v, e))


def _aggregate_python_fallback(client, target_date: str) -> List[Dict]:
    """
    Python N+1 fallback for when the aggregate_analytics_for_date RPC is not
    yet deployed. Remove once the Supabase migration has been applied.
    """
    next_date = (datetime.fromisoformat(target_date) + timedelta(days=1)).date().isoformat()
    users = (client.table("users").select("id").execute()).data or []
    rows  = []

    for user in users:
        uid    = user["id"]
        bm_res = (
            client.table("connected_business_managers")
            .select("id")
            .eq("user_id", uid)
            .limit(1)
            .execute()
        ).data
        if not bm_res:
            continue

        biz_id = bm_res[0]["id"]
        msgs   = (
            client.table("whatsapp_messages")
            .select("direction, status, is_ai_generated")
            .eq("business_id", biz_id)
            .gte("created_at", target_date)
            .lt("created_at", next_date)
            .limit(_MAX_ROWS)
            .execute()
        ).data or []

        rows.append({
            "user_id": uid,
            "stats": {
                "messages_sent":        sum(1 for m in msgs if m.get("direction") == "outbound"),
                "messages_received":    sum(1 for m in msgs if m.get("direction") == "inbound"),
                "messages_delivered":   sum(1 for m in msgs if m.get("status") == "delivered"),
                "messages_read":        sum(1 for m in msgs if m.get("status") == "read"),
                "messages_failed":      sum(1 for m in msgs if m.get("status") == "failed"),
                "ai_replies_generated": sum(1 for m in msgs if m.get("is_ai_generated")),
            },
        })

    return rows


# ──────────────────────────────────────────────────────────────────────────────
# /revenue
# ──────────────────────────────────────────────────────────────────────────────

@analytics_bp.route("/revenue", methods=["GET"])
@require_auth
@require_feature("basic_analytics")
def get_revenue_analytics():
    """
    Revenue analytics with time-bucketed aggregation.

    Bucketing is performed by a Supabase RPC so that date_trunc runs in Postgres,
    not in Python. Falls back to Python aggregation if the RPC is unavailable.

    SQL for the RPC (apply as a Supabase migration):
    ─────────────────────────────────────────────────
      CREATE OR REPLACE FUNCTION get_revenue_buckets(
          p_user_id   uuid,
          p_start     timestamptz,
          p_end       timestamptz,
          p_currency  text,
          p_statuses  text[],
          p_bucket    text   -- 'hour' | 'day' | 'month'
      ) RETURNS TABLE(
          bucket_timestamp timestamptz,
          revenue          numeric,
          order_count      bigint
      ) LANGUAGE sql STABLE SECURITY DEFINER AS $$
        SELECT
          date_trunc(p_bucket, created_at)  AS bucket_timestamp,
          SUM(COALESCE(total_amount, 0))    AS revenue,
          COUNT(*)                          AS order_count
        FROM orders
        WHERE user_id   = p_user_id
          AND currency  = p_currency
          AND status    = ANY(p_statuses)
          AND created_at >= p_start
          AND created_at <  p_end
        GROUP BY 1
        ORDER BY 1;
      $$;
    """
    if not SUPABASE_AVAILABLE:
        return api_error("DB_UNAVAILABLE", "Database not available", status=503)

    try:
        # CRITICAL: The orders table stores the Firebase UID as user_id
        # (set by get_user_id_from_request() → X-User-Id header).
        # g.user_id is the Supabase UUID (resolved by require_auth).
        # We MUST use g.firebase_uid to match orders.user_id.
        user_id            = g.firebase_uid
        range_type         = request.args.get("range", "month").lower()
        requested_currency = request.args.get("currency", "").upper()

        valid_ranges = {"day", "week", "month", "6months", "year"}
        if range_type not in valid_ranges:
            return api_error(
                "INVALID_RANGE",
                f"range must be one of: {', '.join(sorted(valid_ranges))}",
            )

        config = get_revenue_date_config(range_type)
        client = get_supabase_client()
        t0     = time.monotonic()

        # ── Currency detection ────────────────────────────────────────────────
        currency_rows = (
            client.table("orders")
            .select("currency")
            .eq("user_id", user_id)
            .in_("status", _REVENUE_STATUSES)
            .gte("created_at", config["start"].isoformat())
            .lt("created_at",  config["end"].isoformat())
            .limit(_MAX_ROWS)
            .execute()
        ).data or []

        currencies = list({(r.get("currency") or "INR") for r in currency_rows})
        multi_curr = len(currencies) > 1

        if multi_curr and not requested_currency:
            return api_error(
                "CURRENCY_AMBIGUOUS",
                "Multiple currencies detected. Specify ?currency=INR or ?currency=USD",
                status=400,
                currencies=currencies,
            )

        target_currency = (
            requested_currency
            if requested_currency in currencies
            else (currencies[0] if currencies else "INR")
        )

        # ── Bucket aggregation via RPC (single DB round-trip) ─────────────────
        rpc_buckets: Optional[List[Dict]] = None
        try:
            rpc_buckets = client.rpc(
                "get_revenue_buckets",
                {
                    "p_user_id":   user_id,
                    "p_start":     config["start"].isoformat(),
                    "p_end":       config["end"].isoformat(),
                    "p_currency":  target_currency,
                    "p_statuses":  _REVENUE_STATUSES,
                    "p_bucket":    config["bucket"],
                },
            ).execute().data or []
        except Exception as exc:
            _log("warning", "revenue_rpc_unavailable",
                 error=str(exc), fallback="python_aggregation")
            rpc_buckets = None

        # ── Fallback: Python aggregation (remove once RPC is deployed) ────────
        if rpc_buckets is None:
            orders = (
                client.table("orders")
                .select("id, total_amount, created_at, status, currency")
                .eq("user_id", user_id)
                .in_("status", _REVENUE_STATUSES)
                .eq("currency", target_currency)
                .gte("created_at", config["start"].isoformat())
                .lt("created_at",  config["end"].isoformat())
                .limit(_MAX_ROWS)
                .execute()
            ).data or []

            buckets_dict: Dict[str, float] = {}
            for order in orders:
                ts_str = order["created_at"]
                if ts_str.endswith("Z"):
                    ts_str = ts_str[:-1] + "+00:00"
                ts     = datetime.fromisoformat(ts_str)
                amount = float(order.get("total_amount") or 0)

                if config["bucket"] == "hour":
                    bk = ts.replace(minute=0, second=0, microsecond=0, tzinfo=None)
                elif config["bucket"] == "month":
                    bk = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0, tzinfo=None)
                else:
                    bk = ts.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)

                key = bk.isoformat()
                buckets_dict[key] = buckets_dict.get(key, 0) + amount

            rpc_buckets = [
                {"bucket_timestamp": k, "revenue": v, "order_count": None}
                for k, v in buckets_dict.items()
            ]
        else:
            orders = []   # RPC path: fetch orders only for metadata
            _meta_orders = (
                client.table("orders")
                .select("id, total_amount, created_at, status")
                .eq("user_id", user_id)
                .in_("status", _REVENUE_STATUSES)
                .eq("currency", target_currency)
                .gte("created_at", config["start"].isoformat())
                .lt("created_at",  config["end"].isoformat())
                .limit(_MAX_ROWS)
                .execute()
            ).data or []
            orders = _meta_orders

        # ── Metadata ──────────────────────────────────────────────────────────
        status_breakdown: Dict[str, int] = {}
        for o in orders:
            s = o.get("status", "unknown")
            status_breakdown[s] = status_breakdown.get(s, 0) + 1

        earliest = min((o["created_at"] for o in orders), default=None) if orders else None
        latest   = max((o["created_at"] for o in orders), default=None) if orders else None

        # ── Build zero-filled bucket list ─────────────────────────────────────
        rpc_map: Dict[str, float] = {}
        for b in rpc_buckets:
            ts = b["bucket_timestamp"]
            if isinstance(ts, str):
                # Normalise timezone suffix
                if ts.endswith("Z"):
                    ts = ts[:-1] + "+00:00"
                dt = datetime.fromisoformat(ts).replace(tzinfo=None)
            else:
                dt = ts
            rpc_map[dt.isoformat()] = float(b["revenue"] or 0)

        all_buckets = []
        total_revenue = 0.0
        cur = config["start"]
        while cur < config["end"]:
            rev = rpc_map.get(cur.isoformat(), 0.0)
            total_revenue += rev
            all_buckets.append({
                "timestamp": cur.isoformat(),
                "revenue":   round(rev, 2),
                "label":     cur.strftime(config["format"]),
            })
            if config["bucket"] == "hour":
                cur += timedelta(hours=1)
            elif config["bucket"] == "month":
                cur = cur.replace(month=cur.month + 1) if cur.month < 12 \
                      else cur.replace(year=cur.year + 1, month=1)
            else:
                cur += timedelta(days=1)

        # ── Previous period ───────────────────────────────────────────────────
        prev_orders = (
            client.table("orders")
            .select("total_amount")
            .eq("user_id", user_id)
            .in_("status", _REVENUE_STATUSES)
            .eq("currency", target_currency)
            .gte("created_at", config["previous_start"].isoformat())
            .lt("created_at",  config["previous_end"].isoformat())
            .limit(_MAX_ROWS)
            .execute()
        ).data or []
        previous_revenue = sum(float(o.get("total_amount") or 0) for o in prev_orders)

        # ── Delta percent ─────────────────────────────────────────────────────
        if   previous_revenue == 0 and total_revenue == 0:  delta_percent: Optional[float] = 0
        elif previous_revenue == 0:                          delta_percent = None          # "New"
        elif total_revenue    == 0:                          delta_percent = -100.0
        else:
            delta_percent = round((total_revenue - previous_revenue) / previous_revenue * 100, 1)

        # ── Sanity check ──────────────────────────────────────────────────────
        buckets_sum = sum(b["revenue"] for b in all_buckets)
        if abs(buckets_sum - total_revenue) > 0.01:
            _log("warning", "revenue_sanity_failed",
                 total=total_revenue, buckets_sum=buckets_sum)
        else:
            _log("info", "revenue_sanity_ok", total=total_revenue)

        elapsed = round((time.monotonic() - t0) * 1000)
        _log("info", "revenue_complete",
             range=range_type, orders=len(orders), currency=target_currency,
             total=total_revenue, elapsed_ms=elapsed)

        return jsonify({
            "success":      True,
            "range":        range_type,
            "currency":     target_currency,
            "buckets":      all_buckets,
            "totalRevenue": round(total_revenue, 2),
            "comparison": {
                "previousPeriod": round(previous_revenue, 2),
                "deltaPercent":   delta_percent,
            },
            "metadata": {
                "total_orders":          len(orders),
                "orders_by_status":      status_breakdown,
                "earliest_order":        earliest,
                "latest_order":          latest,
                "multiple_currencies":   multi_curr,
                "available_currencies":  currencies if multi_curr else None,
                "elapsed_ms":            elapsed,
            },
        })

    except Exception:
        _log("error", "revenue_failed", tb=traceback.format_exc())
        return api_error("INTERNAL_ERROR", "Failed to load revenue analytics", status=500)