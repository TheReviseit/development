"""Canonical booking gateway for voice.

Voice booking writes are disabled unless explicitly enabled by environment.
The domain should call the existing booking API rather than duplicate booking
rules inside the agents service.
"""

from __future__ import annotations

import os
from typing import Protocol

from ..contracts.booking import BookingAvailabilityRequest, BookingCreateRequest, BookingResult


class BookingGateway(Protocol):
    @property
    def is_enabled(self) -> bool:
        ...

    def check_availability(self, request: BookingAvailabilityRequest) -> BookingResult:
        ...

    def create_booking(self, request: BookingCreateRequest) -> BookingResult:
        ...


class NullBookingGateway:
    @property
    def is_enabled(self) -> bool:
        return False

    def check_availability(self, request: BookingAvailabilityRequest) -> BookingResult:
        return BookingResult(
            success=False,
            status="disabled",
            error_code="voice_booking_disabled",
            message="Voice booking is not enabled for this tenant yet.",
        )

    def create_booking(self, request: BookingCreateRequest) -> BookingResult:
        return BookingResult(
            success=False,
            status="disabled",
            error_code="voice_booking_disabled",
            message="Voice booking is not enabled for this tenant yet.",
        )


class HttpBookingGateway:
    def __init__(self, base_url: str, internal_api_key: str | None = None, *, enabled: bool = False):
        self._base_url = base_url.rstrip("/")
        self._internal_api_key = internal_api_key
        self._enabled = enabled

    @property
    def is_enabled(self) -> bool:
        return self._enabled

    def check_availability(self, request: BookingAvailabilityRequest) -> BookingResult:
        if not self._enabled:
            return NullBookingGateway().check_availability(request)
        if not request.booking_slug:
            return BookingResult(False, "missing_slug", error_code="booking_slug_required")
        try:
            import httpx

            response = httpx.get(
                f"{self._base_url}/api/booking/{request.booking_slug}",
                timeout=3.0,
                headers=self._headers(),
            )
            return BookingResult(
                success=response.is_success,
                status="ok" if response.is_success else "failed",
                payload=response.json() if response.content else {},
                error_code=None if response.is_success else "booking_api_error",
            )
        except Exception as exc:
            return BookingResult(False, "failed", error_code="booking_api_error", message=str(exc))

    def create_booking(self, request: BookingCreateRequest) -> BookingResult:
        if not self._enabled:
            return NullBookingGateway().create_booking(request)
        if not request.booking_slug:
            return BookingResult(False, "missing_slug", error_code="booking_slug_required")
        payload = {
            "service_id": request.service_id,
            "staff_id": request.provider_id,
            "starts_at": request.starts_at.isoformat(),
            "ends_at": request.ends_at.isoformat(),
            "customer_name": request.customer_name or request.caller.display_name,
            "customer_phone": request.caller.normalized_phone or request.caller.phone_number,
            "notes": request.notes,
            "idempotency_key": request.idempotency_key,
            "source": "voice",
            "metadata": request.metadata,
        }
        try:
            import httpx

            response = httpx.post(
                f"{self._base_url}/api/booking/{request.booking_slug}/book",
                json=payload,
                timeout=5.0,
                headers=self._headers(),
            )
            data = response.json() if response.content else {}
            return BookingResult(
                success=response.is_success,
                status=data.get("status") or ("ok" if response.is_success else "failed"),
                appointment_id=data.get("appointment_id") or data.get("appointmentId"),
                payload=data,
                error_code=None if response.is_success else data.get("error") or "booking_api_error",
                message=data.get("message"),
            )
        except Exception as exc:
            return BookingResult(False, "failed", error_code="booking_api_error", message=str(exc))

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._internal_api_key:
            headers["x-internal-api-key"] = self._internal_api_key
        return headers


def create_booking_gateway_from_env() -> BookingGateway:
    base_url = os.getenv("VOICE_BOOKING_API_BASE_URL") or os.getenv("FRONTEND_INTERNAL_BASE_URL")
    enabled = os.getenv("VOICE_BOOKING_WRITES_ENABLED", "").lower() in {"1", "true", "yes"}
    if not base_url:
        return NullBookingGateway()
    return HttpBookingGateway(
        base_url=base_url,
        internal_api_key=os.getenv("INTERNAL_API_KEY"),
        enabled=enabled,
    )

