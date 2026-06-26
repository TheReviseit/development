"""
AI Settings Save — Performance tracing and Server-Timing headers.

Phase 0 instrumentation: measure every blocking phase in POST /api/shop/business/update
without changing business logic. Reuses billing correlation + OTel span helpers.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

logger = logging.getLogger("reviseit.settings.perf")

try:
    from services.billing_tracing import (
        CORRELATION_ID_HEADER,
        get_or_create_correlation_id,
        span_context,
    )
except ImportError:
    CORRELATION_ID_HEADER = "X-Correlation-ID"

    def get_or_create_correlation_id(headers=None):
        import uuid

        if headers:
            cid = headers.get(CORRELATION_ID_HEADER) or headers.get("X-Request-ID")
            if cid:
                return cid
        return str(uuid.uuid4())

    from contextlib import contextmanager

    @contextmanager
    def span_context(name, kind=None, attributes=None):
        yield None


# Performance budgets (ms) — log warning when exceeded
PERF_BUDGETS_MS = {
    "auth": 15,
    "parse": 5,
    "feature_gate": 30,
    "db_read_slug": 40,
    "db_read_duplicate": 40,
    "db_read_jsonb": 40,
    "db_upsert": 50,
    "domain_reconcile": 30,
    "total": 200,
}


class SettingsSaveTimer:
    """Collect per-phase wall times for a single business settings save."""

    __slots__ = (
        "correlation_id",
        "started_at",
        "phases",
        "attributes",
    )

    def __init__(self, correlation_id: str):
        self.correlation_id = correlation_id
        self.started_at = time.perf_counter()
        self.phases: Dict[str, float] = {}
        self.attributes: Dict[str, Any] = {}

    def record(self, phase: str, started_at: float) -> None:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        self.phases[phase] = round(elapsed_ms, 2)

    def set_attr(self, key: str, value: Any) -> None:
        self.attributes[key] = value

    def total_ms(self) -> float:
        return round((time.perf_counter() - self.started_at) * 1000, 2)

    def budget_violations(self) -> Dict[str, float]:
        violations = {}
        for phase, budget in PERF_BUDGETS_MS.items():
            if phase == "total":
                actual = self.total_ms()
            else:
                actual = self.phases.get(phase, 0)
            if actual > budget:
                violations[phase] = actual
        if self.total_ms() > PERF_BUDGETS_MS["total"]:
            violations["total"] = self.total_ms()
        return violations


def start_timer_from_request_headers(headers) -> SettingsSaveTimer:
    cid = get_or_create_correlation_id(dict(headers) if headers else None)
    return SettingsSaveTimer(cid)


def build_server_timing_header(timer: SettingsSaveTimer) -> str:
    parts = []
    for name, ms in timer.phases.items():
        parts.append(f"{name};dur={ms}")
    parts.append(f"total;dur={timer.total_ms()}")
    return ", ".join(parts)


def inject_settings_response_headers(response, timer: SettingsSaveTimer) -> None:
    response.headers[CORRELATION_ID_HEADER] = timer.correlation_id
    response.headers["Server-Timing"] = build_server_timing_header(timer)
    response.headers["X-Response-Time"] = f"{timer.total_ms():.2f}ms"
    response.headers["X-Correlation-ID"] = timer.correlation_id


def log_settings_save_timing(timer: SettingsSaveTimer) -> None:
    payload = {
        "event": "ai_settings_save_timing",
        "correlation_id": timer.correlation_id,
        "total_ms": timer.total_ms(),
        "phases_ms": timer.phases,
        "attributes": timer.attributes,
    }
    violations = timer.budget_violations()
    if violations:
        payload["budget_violations"] = violations
        logger.warning("Slow AI settings save: %s", payload)
    else:
        logger.info("AI settings save timing: %s", payload)


def register_shop_business_tracing(blueprint) -> None:
    """Attach after_request hook to inject Server-Timing on update_business."""

    @blueprint.after_request
    def _settings_save_after_request(response):
        from flask import g, request

        if request.endpoint != "shop_business.update_business":
            return response

        timer = getattr(g, "settings_save_timer", None)
        if not timer:
            return response

        inject_settings_response_headers(response, timer)
        log_settings_save_timing(timer)
        return response
