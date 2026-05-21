"""Booking repository for voice agents.

Production writes go through Supabase RPCs. The in-memory path is only for
unit tests and local sandboxing when a Supabase client is explicitly disabled.
"""

from __future__ import annotations

import os
import threading
import uuid
from datetime import datetime
from typing import Any

from ..domain.booking_entities import BookingConfirmation, BookingDraft, RescheduleRequest
from ..domain.entities import TenantContext
from ..domain.errors import BookingGatewayError


class BookingGatedError(BookingGatewayError):
    code = "voice_booking_writes_disabled"


class BookingConflictError(BookingGatewayError):
    code = "voice_booking_slot_conflict"


class BookingOwnershipError(BookingGatewayError):
    code = "voice_booking_ownership_rejected"


class BookingRepository:
    _memory_lock = threading.RLock()
    _memory_appointments: dict[str, dict[str, Any]] = {}
    _memory_idempotency: dict[str, str] = {}
    _operation_log: list[str] = []

    def __init__(self, supabase_client: Any | None = None, *, writes_enabled: bool | None = None):
        self._writes_enabled = writes_enabled
        if supabase_client is False:
            self._supabase = None
            self._memory_only = True
            return
        self._memory_only = False
        self._supabase = supabase_client
        if self._supabase is None:
            try:
                from supabase_client import get_supabase_client

                self._supabase = get_supabase_client()
            except Exception:
                self._supabase = None
                self._memory_only = True

    @property
    def writes_enabled(self) -> bool:
        if self._writes_enabled is not None:
            return self._writes_enabled
        return os.getenv("VOICE_BOOKING_WRITES_ENABLED", "").lower() in {"1", "true", "yes"}

    @classmethod
    def reset_memory(cls) -> None:
        with cls._memory_lock:
            cls._memory_appointments.clear()
            cls._memory_idempotency.clear()
            cls._operation_log.clear()

    @classmethod
    def memory_count(cls) -> int:
        return len(cls._memory_appointments)

    @classmethod
    def operation_log(cls) -> list[str]:
        return list(cls._operation_log)

    @classmethod
    def memory_rows(cls) -> list[dict[str, Any]]:
        return [dict(row) for row in cls._memory_appointments.values()]

    def reserve_booking(self, draft: BookingDraft) -> BookingConfirmation:
        self._ensure_enabled()
        if self._memory_only or self._supabase is None:
            return self._reserve_memory(draft)
        return self._reserve_supabase(draft)

    def cancel_booking(
        self,
        *,
        tenant: TenantContext,
        booking_reference: str,
        caller_phone: str,
        idempotency_key: str | None = None,
    ) -> BookingConfirmation:
        self._ensure_enabled()
        if self._memory_only or self._supabase is None:
            return self._cancel_memory(tenant, booking_reference, caller_phone)
        params = {
            "p_user_id": tenant.firebase_uid or tenant.user_id or tenant.business_id,
            "p_booking_reference": booking_reference,
            "p_customer_phone": caller_phone,
            "p_cancel_idempotency_key": idempotency_key,
        }
        try:
            result = self._supabase.rpc("cancel_voice_booking", params).execute()
            appointment_id = str(result.data)
            return self._fetch_confirmation_by_id(appointment_id)
        except Exception as exc:
            raise BookingGatewayError(str(exc), code="voice_booking_cancel_failed") from exc

    def reschedule_booking(self, request: RescheduleRequest) -> BookingConfirmation:
        self._ensure_enabled()
        if self._memory_only or self._supabase is None:
            return self._reschedule_memory(request)
        params = {
            **request.new_draft.to_rpc_params(),
            "p_old_booking_reference": request.old_booking_reference,
            "p_old_customer_phone": request.caller.normalized_phone or request.caller.phone_number,
            "p_reschedule_idempotency_key": request.idempotency_key,
        }
        try:
            result = self._supabase.rpc("reschedule_voice_booking", params).execute()
            data = result.data or {}
            return self._fetch_confirmation_by_id(str(data.get("new_appointment_id") or data))
        except Exception as exc:
            raise BookingGatewayError(str(exc), code="voice_booking_reschedule_failed") from exc

    def _reserve_supabase(self, draft: BookingDraft) -> BookingConfirmation:
        try:
            result = self._supabase.rpc("reserve_booking_slot", draft.to_rpc_params()).execute()
            appointment_id = str(result.data)
            return self._fetch_confirmation_by_id(appointment_id)
        except Exception as exc:
            existing = self._fetch_by_idempotency(draft.idempotency_key)
            if existing:
                return existing
            message = str(exc)
            if "not available" in message.lower() or "locked" in message.lower():
                raise BookingConflictError(message) from exc
            raise BookingGatewayError(message, code="voice_booking_reserve_failed") from exc

    def _fetch_by_idempotency(self, idempotency_key: str) -> BookingConfirmation | None:
        if self._supabase is None:
            return None
        try:
            result = (
                self._supabase.table("appointments")
                .select("*")
                .eq("idempotency_key", idempotency_key)
                .limit(1)
                .execute()
            )
            if result.data:
                return _row_to_confirmation(result.data[0])
        except Exception:
            return None
        return None

    def _fetch_confirmation_by_id(self, appointment_id: str) -> BookingConfirmation:
        result = self._supabase.table("appointments").select("*").eq("id", appointment_id).limit(1).execute()
        if not result.data:
            raise BookingGatewayError("Booking was reserved but could not be loaded.", code="voice_booking_load_failed")
        return _row_to_confirmation(result.data[0])

    def _reserve_memory(self, draft: BookingDraft) -> BookingConfirmation:
        with self._memory_lock:
            existing_id = self._memory_idempotency.get(draft.idempotency_key)
            if existing_id:
                return _row_to_confirmation(self._memory_appointments[existing_id])
            for row in self._memory_appointments.values():
                if _conflicts(row, draft):
                    raise BookingConflictError("Time slot not available")
            row = _draft_to_memory_row(draft)
            self._memory_appointments[row["id"]] = row
            self._memory_idempotency[draft.idempotency_key] = row["id"]
            self._operation_log.append(f"reserve:{row['booking_id']}")
            return _row_to_confirmation(row)

    def _cancel_memory(self, tenant: TenantContext, booking_reference: str, caller_phone: str) -> BookingConfirmation:
        with self._memory_lock:
            row = self._find_memory_booking(tenant, booking_reference)
            if not row or row.get("customer_phone") != caller_phone:
                raise BookingOwnershipError("Booking reference was not found for this caller.")
            row["status"] = "cancelled"
            row["booking_status"] = "cancelled"
            self._operation_log.append(f"cancel:{row['booking_id']}")
            return _row_to_confirmation(row)

    def _reschedule_memory(self, request: RescheduleRequest) -> BookingConfirmation:
        with self._memory_lock:
            old = self._find_memory_booking(request.tenant, request.old_booking_reference)
            caller_phone = request.caller.normalized_phone or request.caller.phone_number
            if not old or old.get("customer_phone") != caller_phone:
                raise BookingOwnershipError("Booking reference was not found for this caller.")
            new_confirmation = self._reserve_memory(request.new_draft)
            self._operation_log.append("reserve_new_before_cancel_old")
            old["status"] = "cancelled"
            old["booking_status"] = "cancelled"
            self._operation_log.append(f"cancel_old:{old['booking_id']}")
            return new_confirmation

    def _find_memory_booking(self, tenant: TenantContext, booking_reference: str) -> dict[str, Any] | None:
        user_id = tenant.firebase_uid or tenant.user_id or tenant.business_id
        for row in self._memory_appointments.values():
            if row.get("user_id") != user_id:
                continue
            if row.get("booking_id") == booking_reference or row.get("id") == booking_reference:
                return row
        return None

    def _ensure_enabled(self) -> None:
        if not self.writes_enabled:
            raise BookingGatedError("Voice booking writes are disabled.")


def _draft_to_memory_row(draft: BookingDraft) -> dict[str, Any]:
    appointment_id = str(uuid.uuid4())
    return {
        "id": appointment_id,
        "booking_id": f"FLX-{appointment_id[:6].upper()}",
        "user_id": draft.tenant.firebase_uid or draft.tenant.user_id or draft.tenant.business_id,
        "customer_name": draft.customer_name,
        "customer_phone": draft.customer_phone,
        "date": draft.starts_at.date().isoformat(),
        "time": draft.starts_at.strftime("%H:%M"),
        "duration": draft.duration_minutes,
        "status": "confirmed",
        "source": "voice",
        "starts_at": draft.starts_at,
        "ends_at": draft.ends_at,
        "timezone": draft.timezone,
        "provider_id": draft.provider_id,
        "staff_id": draft.staff_id,
        "provider_name": draft.provider_name,
        "service": draft.service_name,
        "service_id": draft.service_id,
        "service_price": draft.service_price,
        "booking_status": "confirmed",
        "payment_status": "pay_at_venue",
        "reserved_until": None,
        "notes": draft.notes,
        "idempotency_key": draft.idempotency_key,
        "fingerprint": draft.fingerprint,
        "cancel_token": draft.cancel_token,
    }


def _row_to_confirmation(row: dict[str, Any]) -> BookingConfirmation:
    starts_at = row.get("starts_at")
    ends_at = row.get("ends_at")
    if isinstance(starts_at, str):
        starts_at = datetime.fromisoformat(starts_at.replace("Z", "+00:00"))
    if isinstance(ends_at, str):
        ends_at = datetime.fromisoformat(ends_at.replace("Z", "+00:00"))
    return BookingConfirmation(
        appointment_id=str(row["id"]),
        booking_id=row.get("booking_id"),
        customer_name=row.get("customer_name") or "",
        customer_phone=row.get("customer_phone") or "",
        service_name=row.get("service") or "Appointment",
        starts_at=starts_at,
        ends_at=ends_at,
        source=row.get("source") or "voice",
        idempotency_key=row.get("idempotency_key"),
        status=row.get("status") or "confirmed",
    )


def _conflicts(row: dict[str, Any], draft: BookingDraft) -> bool:
    if row.get("status") == "cancelled":
        return False
    if row.get("user_id") != (draft.tenant.firebase_uid or draft.tenant.user_id or draft.tenant.business_id):
        return False
    existing_start = row["starts_at"]
    existing_end = row["ends_at"]
    overlaps = draft.starts_at < existing_end and draft.ends_at > existing_start
    if not overlaps:
        return False
    existing_staff = row.get("staff_id")
    if not draft.staff_id or not existing_staff:
        return True
    return existing_staff == draft.staff_id
