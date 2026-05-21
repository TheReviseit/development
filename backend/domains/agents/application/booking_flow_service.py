"""Conversational booking state machine for voice agents."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from ..domain.booking_entities import BookingDraft, RescheduleRequest
from ..domain.entities import AgentResponse, CallerIdentity, CallSession
from ..infrastructure.booking_repository import (
    BookingConflictError,
    BookingGatedError,
    BookingOwnershipError,
    BookingRepository,
)
from ..infrastructure.repositories import AgentsRepository
from ..validators.booking_validators import (
    extract_booking_reference,
    extract_name_and_phone,
    format_slot_choices,
    is_cancellation,
    is_confirmation,
    normalize_booking_phone,
    parse_booking_datetime,
    parse_booking_date,
    parse_booking_time,
    resolve_service,
    slot_matches,
    validate_customer_name,
)


BOOKING_FLOW_KEY = "booking_flow"


class BookingFlowService:
    def __init__(self, *, booking_repository: BookingRepository, availability_repository: AgentsRepository):
        self._bookings = booking_repository
        self._availability = availability_repository

    def has_active_flow(self, session: CallSession) -> bool:
        return bool(session.metadata.get(BOOKING_FLOW_KEY))

    def handle_turn(
        self,
        *,
        session: CallSession,
        transcript: str,
        business_data: dict[str, Any],
        tool_call_id: str,
    ) -> AgentResponse | None:
        transcript = (transcript or "").strip()
        state = session.metadata.get(BOOKING_FLOW_KEY) or {}

        if state:
            return self._continue_flow(session, transcript, business_data, tool_call_id, state)

        lowered = transcript.lower()
        if "reschedule" in lowered or "move booking" in lowered or "move my booking" in lowered:
            return self._start_reschedule(session, transcript, business_data, tool_call_id)
        if "cancel" in lowered and ("booking" in lowered or extract_booking_reference(transcript)):
            return self._cancel_existing(session, transcript, tool_call_id)
        if any(word in lowered for word in ("book", "appointment", "slot", "available", "availability")):
            if not self._bookings.writes_enabled and "available" not in lowered and "availability" not in lowered:
                return self._booking_disabled_response()
            return self._start_booking(session, transcript, business_data, tool_call_id)
        return None

    def _continue_flow(
        self,
        session: CallSession,
        transcript: str,
        business_data: dict[str, Any],
        tool_call_id: str,
        state: dict[str, Any],
    ) -> AgentResponse:
        status = state.get("status")
        if status in {"awaiting_customer", "awaiting_slot_choice"} and is_cancellation(transcript):
            session.metadata.pop(BOOKING_FLOW_KEY, None)
            return AgentResponse(
                text="No problem. I have not made any booking.",
                language=session.language,
                source="voice_booking_cancelled_before_write",
                confidence=0.95,
            )
        if status == "awaiting_slot_choice":
            return self._accept_slot_choice(session, transcript, state)
        if status == "awaiting_customer":
            return self._collect_customer(session, transcript, state, tool_call_id)
        if status == "awaiting_confirmation":
            return self._confirm_booking(session, transcript, state)
        if status == "awaiting_reschedule_confirmation":
            return self._confirm_reschedule(session, transcript, state)
        session.metadata.pop(BOOKING_FLOW_KEY, None)
        return self._start_booking(session, transcript, business_data, tool_call_id)

    def _start_booking(
        self,
        session: CallSession,
        transcript: str,
        business_data: dict[str, Any],
        tool_call_id: str,
    ) -> AgentResponse:
        service = resolve_service(transcript, business_data)
        parsed = parse_booking_datetime(transcript, reference=datetime.now(timezone.utc))
        if not parsed:
            date_only = parse_booking_date(transcript, reference=datetime.now(timezone.utc))
            if date_only and any(word in transcript.lower() for word in ("available", "availability", "slot")):
                slots = self._availability.get_available_slots(
                    session.tenant,
                    service_id=service.get("id"),
                    target_date=date_only,
                )
                choices = format_slot_choices(slots, limit=5)
                if choices:
                    return AgentResponse(
                        text=f"I have {choices} available for {service['name']} on {date_only.strftime('%d %b')}. Which time would you like?",
                        language=session.language,
                        source="voice_booking_availability",
                        confidence=0.9,
                    )
                return AgentResponse(
                    text=f"I do not see available slots for {service['name']} on {date_only.strftime('%d %b')}. Would you like another date?",
                    language=session.language,
                    source="voice_booking_no_availability",
                    confidence=0.9,
                )
            return AgentResponse(
                text="Sure. Which service, date, and time should I check for you?",
                language=session.language,
                source="voice_booking_collect_slot",
                confidence=0.85,
            )

        ends_at = parsed.starts_at + timedelta(minutes=int(service.get("duration") or 60))
        slots = self._availability.get_available_slots(
            session.tenant,
            service_id=service.get("id"),
            target_date=parsed.starts_at.date(),
        )
        if slots and not slot_matches(slots, parsed.starts_at.time()):
            choices = format_slot_choices(slots)
            session.metadata[BOOKING_FLOW_KEY] = {
                "status": "awaiting_slot_choice",
                "service": service,
                "date": parsed.starts_at.date().isoformat(),
                "timezone": business_data.get("timezone") or "Asia/Kolkata",
            }
            text = (
                f"{parsed.display_time} is not available. "
                f"I have {choices}. Which one works?"
                if choices
                else f"{parsed.display_time} is not available. Would you like a different time?"
            )
            return AgentResponse(text=text, language=session.language, source="voice_booking_slot_unavailable", confidence=0.9)

        session.metadata[BOOKING_FLOW_KEY] = {
            "status": "awaiting_customer",
            "service": service,
            "starts_at": parsed.starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
            "display_date": parsed.display_date,
            "display_time": parsed.display_time,
            "timezone": business_data.get("timezone") or "Asia/Kolkata",
        }
        return AgentResponse(
            text=(
                f"I can book {service['name']} on {parsed.display_date} at {parsed.display_time}. "
                "What name and phone number should I use?"
            ),
            language=session.language,
            source="voice_booking_collect_customer",
            confidence=0.92,
        )

    def _accept_slot_choice(self, session: CallSession, transcript: str, state: dict[str, Any]) -> AgentResponse:
        selected = parse_booking_time(transcript)
        if not selected:
            return AgentResponse(
                text="What time should I use for the appointment?",
                language=session.language,
                source="voice_booking_collect_slot",
                confidence=0.75,
            )
        service = state["service"]
        starts_at = datetime.fromisoformat(f"{state['date']}T{selected.strftime('%H:%M')}:00")
        ends_at = starts_at + timedelta(minutes=int(service.get("duration") or 60))
        session.metadata[BOOKING_FLOW_KEY] = {
            "status": "awaiting_customer",
            "service": service,
            "starts_at": starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
            "display_date": starts_at.strftime("%d %b %Y"),
            "display_time": starts_at.strftime("%I:%M %p").lstrip("0"),
            "timezone": state.get("timezone") or "Asia/Kolkata",
        }
        return AgentResponse(
            text=f"Great, {starts_at.strftime('%I:%M %p').lstrip('0')} works. What name and phone number should I use?",
            language=session.language,
            source="voice_booking_collect_customer",
            confidence=0.9,
        )

    def _collect_customer(
        self,
        session: CallSession,
        transcript: str,
        state: dict[str, Any],
        tool_call_id: str,
    ) -> AgentResponse:
        name, phone = extract_name_and_phone(transcript)
        phone = phone or session.caller.normalized_phone
        try:
            customer_name = validate_customer_name(name or session.caller.display_name)
            customer_phone = normalize_booking_phone(phone)
        except ValueError:
            return AgentResponse(
                text="Please share the customer name and phone number for the booking.",
                language=session.language,
                source="voice_booking_collect_customer",
                confidence=0.8,
            )

        service = state["service"]
        starts_at = datetime.fromisoformat(state["starts_at"])
        ends_at = datetime.fromisoformat(state["ends_at"])
        draft = BookingDraft(
            tenant=session.tenant,
            call_id=session.call_id,
            tool_call_id=tool_call_id,
            starts_at=starts_at,
            ends_at=ends_at,
            customer_name=customer_name,
            customer_phone=customer_phone,
            service_name=service["name"],
            service_id=service.get("id"),
            service_price=float(service.get("price") or 0),
            timezone=state.get("timezone") or "Asia/Kolkata",
        )
        session.metadata[BOOKING_FLOW_KEY] = {"status": "awaiting_confirmation", "draft": draft.to_state()}
        return AgentResponse(
            text=(
                f"{customer_name}, I have {draft.service_name} on {state['display_date']} at {state['display_time']}, "
                "pay at venue. Should I confirm it?"
            ),
            language=session.language,
            source="voice_booking_awaiting_confirmation",
            confidence=0.93,
        )

    def _confirm_booking(self, session: CallSession, transcript: str, state: dict[str, Any]) -> AgentResponse:
        if is_cancellation(transcript):
            session.metadata.pop(BOOKING_FLOW_KEY, None)
            return AgentResponse(
                text="No problem. I have not made any booking.",
                language=session.language,
                source="voice_booking_cancelled_before_write",
                confidence=0.95,
            )
        if not is_confirmation(transcript):
            return AgentResponse(
                text="Should I confirm this booking?",
                language=session.language,
                source="voice_booking_awaiting_confirmation",
                confidence=0.75,
            )
        try:
            confirmation = self._bookings.reserve_booking(BookingDraft.from_state(state["draft"]))
            session.metadata.pop(BOOKING_FLOW_KEY, None)
            display_time = confirmation.starts_at.strftime("%d %b at %I:%M %p").replace(" 0", " ")
            return AgentResponse(
                text=f"Done. Your booking is confirmed for {display_time}. Your reference is {confirmation.booking_id}.",
                language=session.language,
                source="voice_booking_confirmed",
                confidence=0.98,
                metadata={"appointment_id": confirmation.appointment_id, "booking_id": confirmation.booking_id},
            )
        except BookingConflictError:
            session.metadata.pop(BOOKING_FLOW_KEY, None)
            return AgentResponse(
                text="That slot was just taken. Please choose another time and I will check it.",
                language=session.language,
                source="voice_booking_conflict",
                confidence=0.9,
            )
        except BookingGatedError:
            return self._booking_disabled_response()

    def _cancel_existing(self, session: CallSession, transcript: str, tool_call_id: str) -> AgentResponse:
        if not self._bookings.writes_enabled:
            return self._booking_disabled_response()
        reference = extract_booking_reference(transcript)
        phone = session.caller.normalized_phone or extract_name_and_phone(transcript)[1]
        if not reference or not phone:
            return AgentResponse(
                text="Please share the booking reference and the phone number used for the booking.",
                language=session.language,
                source="voice_booking_cancel_collect_reference",
                confidence=0.8,
            )
        try:
            confirmation = self._bookings.cancel_booking(
                tenant=session.tenant,
                booking_reference=reference,
                caller_phone=normalize_booking_phone(phone),
                idempotency_key=f"voice-cancel:{session.call_id}:{tool_call_id}",
            )
            return AgentResponse(
                text=f"Your booking {confirmation.booking_id or reference} has been cancelled.",
                language=session.language,
                source="voice_booking_cancelled",
                confidence=0.96,
            )
        except BookingOwnershipError:
            return AgentResponse(
                text="I could not find that booking for this phone number.",
                language=session.language,
                source="voice_booking_cancel_rejected",
                confidence=0.9,
            )

    def _start_reschedule(
        self,
        session: CallSession,
        transcript: str,
        business_data: dict[str, Any],
        tool_call_id: str,
    ) -> AgentResponse:
        if not self._bookings.writes_enabled:
            return self._booking_disabled_response()
        reference = extract_booking_reference(transcript)
        parsed = parse_booking_datetime(transcript, reference=datetime.now(timezone.utc))
        phone = session.caller.normalized_phone or extract_name_and_phone(transcript)[1]
        if not reference or not parsed or not phone:
            return AgentResponse(
                text="Please share the booking reference, phone number, and the new date and time.",
                language=session.language,
                source="voice_booking_reschedule_collect",
                confidence=0.8,
            )
        service = resolve_service(transcript, business_data)
        draft = BookingDraft(
            tenant=session.tenant,
            call_id=session.call_id,
            tool_call_id=tool_call_id,
            starts_at=parsed.starts_at,
            ends_at=parsed.starts_at + timedelta(minutes=int(service.get("duration") or 60)),
            customer_name=session.caller.display_name or "Voice Customer",
            customer_phone=normalize_booking_phone(phone),
            service_name=service["name"],
            service_id=service.get("id"),
            service_price=float(service.get("price") or 0),
            timezone=business_data.get("timezone") or "Asia/Kolkata",
        )
        session.metadata[BOOKING_FLOW_KEY] = {
            "status": "awaiting_reschedule_confirmation",
            "old_booking_reference": reference,
            "caller_phone": draft.customer_phone,
            "draft": draft.to_state(),
            "idempotency_key": f"voice-reschedule:{session.call_id}:{tool_call_id}",
        }
        return AgentResponse(
            text=f"I can move booking {reference} to {parsed.display_date} at {parsed.display_time}. Should I confirm the change?",
            language=session.language,
            source="voice_booking_reschedule_awaiting_confirmation",
            confidence=0.9,
        )

    def _confirm_reschedule(self, session: CallSession, transcript: str, state: dict[str, Any]) -> AgentResponse:
        if is_cancellation(transcript):
            session.metadata.pop(BOOKING_FLOW_KEY, None)
            return AgentResponse(
                text="No problem. I have not changed the booking.",
                language=session.language,
                source="voice_booking_reschedule_cancelled",
                confidence=0.95,
            )
        if not is_confirmation(transcript):
            return AgentResponse(
                text="Should I confirm this reschedule?",
                language=session.language,
                source="voice_booking_reschedule_awaiting_confirmation",
                confidence=0.75,
            )
        draft = BookingDraft.from_state(state["draft"])
        request = RescheduleRequest(
            tenant=session.tenant,
            caller=CallerIdentity(
                phone_number=state.get("caller_phone"),
                normalized_phone=state.get("caller_phone"),
                display_name=session.caller.display_name,
            ),
            old_booking_reference=state["old_booking_reference"],
            new_draft=draft,
            idempotency_key=state["idempotency_key"],
        )
        try:
            confirmation = self._bookings.reschedule_booking(request)
            session.metadata.pop(BOOKING_FLOW_KEY, None)
            return AgentResponse(
                text=f"Done. Your booking has been moved. The new reference is {confirmation.booking_id}.",
                language=session.language,
                source="voice_booking_rescheduled",
                confidence=0.96,
            )
        except BookingOwnershipError:
            return AgentResponse(
                text="I could not find that booking for this phone number.",
                language=session.language,
                source="voice_booking_reschedule_rejected",
                confidence=0.9,
            )

    @staticmethod
    def _booking_disabled_response() -> AgentResponse:
        return AgentResponse(
            text=(
                "I can help with services, prices, and timings right now. "
                "Appointment booking on voice is being enabled carefully, so I cannot place it on this call yet."
            ),
            language="en",
            source="booking_disabled",
            confidence=0.95,
        )
