"""Booking gateway contracts for the agents domain."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from ..domain.entities import CallerIdentity, TenantContext


@dataclass(frozen=True)
class BookingAvailabilityRequest:
    tenant: TenantContext
    service_id: str | None = None
    provider_id: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    booking_slug: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class BookingCreateRequest:
    tenant: TenantContext
    caller: CallerIdentity
    service_id: str | None
    starts_at: datetime
    ends_at: datetime
    booking_slug: str | None = None
    provider_id: str | None = None
    customer_name: str | None = None
    notes: str | None = None
    idempotency_key: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class BookingResult:
    success: bool
    status: str
    appointment_id: str | None = None
    message: str | None = None
    error_code: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)

