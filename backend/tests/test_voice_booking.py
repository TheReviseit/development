import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from domains.agents.domain.booking_entities import BookingDraft, RescheduleRequest
from domains.agents.application.booking_flow_service import BookingFlowService
from domains.agents.domain.entities import CallerIdentity, CallSession, TenantContext
from domains.agents.infrastructure.booking_repository import (
    BookingConflictError,
    BookingGatedError,
    BookingOwnershipError,
    BookingRepository,
)


@pytest.fixture(autouse=True)
def reset_booking_memory():
    BookingRepository.reset_memory()
    yield
    BookingRepository.reset_memory()


def tenant() -> TenantContext:
    return TenantContext(tenant_id="tenant-1", firebase_uid="firebase-1")


def draft(
    *,
    starts_at: datetime | None = None,
    call_id: str = "call-1",
    tool_call_id: str = "tool-1",
    phone: str = "+919876543210",
    staff_id: str | None = None,
) -> BookingDraft:
    starts_at = starts_at or datetime(2026, 5, 22, 10, 0)
    return BookingDraft(
        tenant=tenant(),
        call_id=call_id,
        tool_call_id=tool_call_id,
        starts_at=starts_at,
        ends_at=starts_at + timedelta(minutes=60),
        customer_name="Raja",
        customer_phone=phone,
        service_name="Haircut",
        service_id="11111111-1111-1111-1111-111111111111",
        staff_id=staff_id,
        service_price=500,
    )


def test_two_simultaneous_calls_same_slot_only_one_succeeds():
    repo = BookingRepository(supabase_client=False, writes_enabled=True)

    def reserve(index: int):
        try:
            return repo.reserve_booking(draft(call_id=f"call-{index}", tool_call_id=f"tool-{index}"))
        except BookingConflictError:
            return "conflict"

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(reserve, [1, 2]))

    assert sum(result != "conflict" for result in results) == 1
    assert results.count("conflict") == 1
    assert BookingRepository.memory_count() == 1


def test_booking_confirm_twice_same_idempotency_inserts_one_row():
    repo = BookingRepository(supabase_client=False, writes_enabled=True)
    first = repo.reserve_booking(draft(call_id="call-1", tool_call_id="confirm-1"))
    second = repo.reserve_booking(draft(call_id="call-1", tool_call_id="confirm-1"))

    assert first.appointment_id == second.appointment_id
    assert first.idempotency_key == second.idempotency_key
    assert BookingRepository.memory_count() == 1


def test_reschedule_reserves_new_slot_before_releasing_old():
    repo = BookingRepository(supabase_client=False, writes_enabled=True)
    old = repo.reserve_booking(draft(call_id="old-call", tool_call_id="old-tool"))
    new_start = datetime(2026, 5, 22, 12, 0)
    request = RescheduleRequest(
        tenant=tenant(),
        caller=CallerIdentity(phone_number="+919876543210", normalized_phone="+919876543210"),
        old_booking_reference=old.booking_id,
        new_draft=draft(starts_at=new_start, call_id="new-call", tool_call_id="new-tool"),
        idempotency_key="voice-reschedule:call:new-tool",
    )

    new = repo.reschedule_booking(request)
    rows = BookingRepository.memory_rows()
    old_row = next(row for row in rows if row["booking_id"] == old.booking_id)
    new_row = next(row for row in rows if row["booking_id"] == new.booking_id)
    log = BookingRepository.operation_log()

    assert old_row["status"] == "cancelled"
    assert new_row["status"] == "confirmed"
    assert log.index("reserve_new_before_cancel_old") < next(
        index for index, item in enumerate(log) if item.startswith("cancel_old:")
    )


def test_cancel_wrong_caller_phone_is_rejected():
    repo = BookingRepository(supabase_client=False, writes_enabled=True)
    confirmation = repo.reserve_booking(draft())

    with pytest.raises(BookingOwnershipError):
        repo.cancel_booking(
            tenant=tenant(),
            booking_reference=confirmation.booking_id,
            caller_phone="+918888888888",
        )

    row = BookingRepository.memory_rows()[0]
    assert row["status"] == "confirmed"


def test_booking_write_gated_false_raises_and_does_not_write():
    repo = BookingRepository(supabase_client=False, writes_enabled=False)

    with pytest.raises(BookingGatedError):
        repo.reserve_booking(draft())

    assert BookingRepository.memory_count() == 0


class StaticAvailability:
    def get_available_slots(self, tenant, *, service_id, target_date, slot_granularity=30):
        return [{"time": "10:00", "available": True, "capacity": 1, "totalStaff": 1}]


def test_happy_path_booking_conversation_completes_in_three_customer_turns_and_can_cancel():
    repo = BookingRepository(supabase_client=False, writes_enabled=True)
    service = BookingFlowService(booking_repository=repo, availability_repository=StaticAvailability())
    session = CallSession(call_id="call-flow", tenant=tenant(), caller=CallerIdentity())
    business_data = {
        "timezone": "Asia/Kolkata",
        "products_services": [
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "name": "Haircut",
                "duration": 60,
                "price": 500,
            }
        ],
    }

    first = service.handle_turn(
        session=session,
        transcript="Book a haircut tomorrow at 10",
        business_data=business_data,
        tool_call_id="turn-1",
    )
    second = service.handle_turn(
        session=session,
        transcript="Raja, 9876543210",
        business_data=business_data,
        tool_call_id="turn-2",
    )
    third = service.handle_turn(
        session=session,
        transcript="yes",
        business_data=business_data,
        tool_call_id="turn-3",
    )

    assert first.source == "voice_booking_collect_customer"
    assert second.source == "voice_booking_awaiting_confirmation"
    assert third.source == "voice_booking_confirmed"
    assert BookingRepository.memory_count() == 1

    booking_id = BookingRepository.memory_rows()[0]["booking_id"]
    session.caller = CallerIdentity(phone_number="+919876543210", normalized_phone="+919876543210")
    cancelled = service.handle_turn(
        session=session,
        transcript=f"cancel booking {booking_id}",
        business_data=business_data,
        tool_call_id="turn-4",
    )

    assert cancelled.source == "voice_booking_cancelled"
    assert BookingRepository.memory_rows()[0]["status"] == "cancelled"


def test_availability_question_lists_slots_without_writing():
    repo = BookingRepository(supabase_client=False, writes_enabled=True)
    service = BookingFlowService(booking_repository=repo, availability_repository=StaticAvailability())
    session = CallSession(call_id="call-availability", tenant=tenant(), caller=CallerIdentity())

    response = service.handle_turn(
        session=session,
        transcript="What slots are available for haircut tomorrow?",
        business_data={
            "products_services": [
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "name": "Haircut",
                    "duration": 60,
                    "price": 500,
                }
            ]
        },
        tool_call_id="turn-1",
    )

    assert response.source == "voice_booking_availability"
    assert "10:00 AM" in response.text
    assert BookingRepository.memory_count() == 0
