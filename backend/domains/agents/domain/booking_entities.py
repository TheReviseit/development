"""Booking value objects for voice agents."""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .entities import CallerIdentity, TenantContext


BOOKING_SOURCE_VOICE = "voice"
BOOKING_STATUS_CONFIRMED = "confirmed"
PAYMENT_STATUS_PAY_AT_VENUE = "pay_at_venue"


@dataclass(frozen=True)
class BookingDraft:
    tenant: TenantContext
    call_id: str
    tool_call_id: str
    starts_at: datetime
    ends_at: datetime
    customer_name: str
    customer_phone: str
    service_name: str = "Appointment"
    service_id: str | None = None
    provider_id: str | None = None
    provider_name: str | None = None
    staff_id: str | None = None
    service_price: float = 0.0
    timezone: str = "Asia/Kolkata"
    notes: str | None = None
    cancel_token: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def duration_minutes(self) -> int:
        seconds = (self.ends_at - self.starts_at).total_seconds()
        return max(1, int(seconds // 60))

    @property
    def idempotency_key(self) -> str:
        raw = f"{self.call_id}:{self.tool_call_id}"
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
        return f"voice:{digest}"

    @property
    def fingerprint(self) -> str:
        raw = f"{self.tenant.user_id or self.tenant.firebase_uid}:{self.customer_phone}:{self.starts_at.isoformat()}:{self.service_id or self.service_name}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]

    def to_rpc_params(self) -> dict[str, Any]:
        user_id = self.tenant.firebase_uid or self.tenant.user_id or self.tenant.business_id
        return {
            "p_user_id": user_id,
            "p_provider_id": self.provider_id,
            "p_starts_at": self.starts_at.isoformat(),
            "p_ends_at": self.ends_at.isoformat(),
            "p_idempotency_key": self.idempotency_key,
            "p_customer_name": self.customer_name,
            "p_customer_phone": self.customer_phone,
            "p_service": self.service_name,
            "p_source": BOOKING_SOURCE_VOICE,
            "p_timezone": self.timezone,
            "p_service_id": _uuid_or_none(self.service_id),
            "p_staff_id": _uuid_or_none(self.staff_id),
            "p_provider_name": self.provider_name,
            "p_service_price": self.service_price,
            "p_notes": self.notes,
            "p_fingerprint": self.fingerprint,
            "p_cancel_token": self.cancel_token,
            "p_booking_status": BOOKING_STATUS_CONFIRMED,
            "p_payment_status": PAYMENT_STATUS_PAY_AT_VENUE,
        }

    def to_state(self) -> dict[str, Any]:
        return {
            "tenant": self.tenant.to_dict(),
            "call_id": self.call_id,
            "tool_call_id": self.tool_call_id,
            "starts_at": self.starts_at.isoformat(),
            "ends_at": self.ends_at.isoformat(),
            "customer_name": self.customer_name,
            "customer_phone": self.customer_phone,
            "service_name": self.service_name,
            "service_id": self.service_id,
            "provider_id": self.provider_id,
            "provider_name": self.provider_name,
            "staff_id": self.staff_id,
            "service_price": self.service_price,
            "timezone": self.timezone,
            "notes": self.notes,
            "cancel_token": self.cancel_token,
            "metadata": self.metadata,
        }

    @classmethod
    def from_state(cls, payload: dict[str, Any]) -> "BookingDraft":
        return cls(
            tenant=TenantContext.from_dict(payload["tenant"]),
            call_id=payload["call_id"],
            tool_call_id=payload["tool_call_id"],
            starts_at=datetime.fromisoformat(payload["starts_at"]),
            ends_at=datetime.fromisoformat(payload["ends_at"]),
            customer_name=payload["customer_name"],
            customer_phone=payload["customer_phone"],
            service_name=payload.get("service_name") or "Appointment",
            service_id=payload.get("service_id"),
            provider_id=payload.get("provider_id"),
            provider_name=payload.get("provider_name"),
            staff_id=payload.get("staff_id"),
            service_price=float(payload.get("service_price") or 0),
            timezone=payload.get("timezone") or "Asia/Kolkata",
            notes=payload.get("notes"),
            cancel_token=payload.get("cancel_token"),
            metadata=payload.get("metadata") or {},
        )


@dataclass(frozen=True)
class BookingConfirmation:
    appointment_id: str
    booking_id: str | None
    customer_name: str
    customer_phone: str
    service_name: str
    starts_at: datetime
    ends_at: datetime
    source: str = BOOKING_SOURCE_VOICE
    idempotency_key: str | None = None
    status: str = BOOKING_STATUS_CONFIRMED


@dataclass(frozen=True)
class RescheduleRequest:
    tenant: TenantContext
    caller: CallerIdentity
    old_booking_reference: str
    new_draft: BookingDraft
    idempotency_key: str


def _uuid_or_none(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (TypeError, ValueError):
        return None
