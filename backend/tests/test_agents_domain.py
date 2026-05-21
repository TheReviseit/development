import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from domains.agents.application.booking_gateway import NullBookingGateway
from domains.agents.application.call_session_service import CallSessionService
from domains.agents.application.cost_metering_service import CostMeteringService
from domains.agents.application.faq_answer_service import FAQAnswerService
from domains.agents.application.language_service import LanguageService
from domains.agents.application.turn_orchestrator import TurnOrchestrator
from domains.agents.contracts.booking import BookingCreateRequest
from domains.agents.contracts.retell import RetellInboundEvent
from domains.agents.domain.entities import BusinessKnowledge, CallerIdentity, TenantContext
from domains.agents.domain.errors import TenantResolutionError
from domains.agents.domain.policies import TenantIsolationPolicy
from domains.agents.infrastructure.repositories import AgentsRepository
from domains.agents.infrastructure.session_store import InMemorySessionStore
from domains.agents.validators.phone import normalize_phone
from domains.agents.validators.retell_event_validator import parse_retell_event


def test_resolve_tenant_rejects_phone_only_metadata():
    repo = AgentsRepository(supabase_client=False)

    with pytest.raises(TenantResolutionError):
        repo.resolve_tenant({"caller_phone": "+919876543210"})


def test_session_creation_uses_tenant_metadata_and_normalized_phone():
    repo = AgentsRepository(supabase_client=False)
    store = InMemorySessionStore()
    service = CallSessionService(repo, store)

    session = service.get_or_create(
        call_id="call-123",
        metadata={"tenant_id": "tenant one", "firebase_uid": "firebase-1"},
        caller_phone="9876543210",
    )

    assert session.tenant.tenant_id == "tenant one"
    assert session.tenant.firebase_uid == "firebase-1"
    assert session.caller.normalized_phone == "+919876543210"
    assert store.get("tenant one", "call-123") is not None


def test_tenant_scoped_redis_key_sanitizes_segments():
    assert TenantIsolationPolicy.redis_key("tenant/one", "call", "abc:123") == "agents:tenant_one:call:abc_123"


def test_phone_normalization_defaults_to_india_for_local_numbers():
    assert normalize_phone("98765 43210") == "+919876543210"
    assert normalize_phone("+1 (415) 555-0101") == "+14155550101"


def test_faq_service_answers_from_business_faqs_without_llm():
    tenant = TenantContext(tenant_id="tenant-1")
    knowledge = BusinessKnowledge(
        tenant=tenant,
        raw_data={
            "business_name": "Demo Salon",
            "faqs": [{"question": "Do you have parking?", "answer": "Yes, parking is available near the entrance."}],
            "products_services": [{"name": "Haircut", "price": 500}],
        },
    )

    answer = FAQAnswerService().answer("Is parking available?", knowledge)

    assert answer is not None
    assert answer.source == "faq_match"
    assert "parking is available" in answer.text.lower()


def test_retell_event_normalizes_transcript_metadata_and_caller():
    event = RetellInboundEvent.from_payload(
        {
            "interaction_type": "response_required",
            "response_id": 7,
            "call": {"call_id": "call-1", "from_number": "+919876543210", "metadata": {"tenant_id": "tenant-1"}},
            "transcript_object": [
                {"role": "agent", "content": "Hi"},
                {"role": "user", "content": "What time do you open?"},
            ],
        }
    )

    assert event.needs_response
    assert event.call_id == "call-1"
    assert event.response_id == 7
    assert event.metadata["tenant_id"] == "tenant-1"
    assert event.caller_phone == "+919876543210"
    assert event.transcript == "What time do you open?"


def test_retell_response_event_requires_call_id():
    with pytest.raises(Exception):
        parse_retell_event({"interaction_type": "response_required", "metadata": {"tenant_id": "tenant-1"}})


def test_booking_gateway_is_disabled_by_default():
    tenant = TenantContext(tenant_id="tenant-1")
    caller = CallerIdentity(phone_number="9876543210", normalized_phone="+919876543210")
    result = NullBookingGateway().create_booking(
        BookingCreateRequest(
            tenant=tenant,
            caller=caller,
            service_id="svc-1",
            starts_at=datetime(2026, 5, 21, 10, 0, tzinfo=timezone.utc),
            ends_at=datetime(2026, 5, 21, 10, 30, tzinfo=timezone.utc),
        )
    )

    assert not result.success
    assert result.error_code == "voice_booking_disabled"


class StaticKnowledgeRepository(AgentsRepository):
    def __init__(self):
        super().__init__(supabase_client=False)

    def load_business_knowledge(self, tenant):
        return BusinessKnowledge(
            tenant=tenant,
            raw_data={
                "business_name": "Demo Salon",
                "faqs": [],
                "products_services": [{"name": "Haircut", "price": 500}],
            },
        )


def test_orchestrator_blocks_booking_writes_until_gateway_enabled():
    repo = StaticKnowledgeRepository()
    store = InMemorySessionStore()
    orchestrator = TurnOrchestrator(
        repository=repo,
        sessions=CallSessionService(repo, store),
        faq_answers=FAQAnswerService(),
        language=LanguageService(),
        costs=CostMeteringService(repo),
        booking_gateway=NullBookingGateway(),
    )
    event = RetellInboundEvent.from_payload(
        {
            "interaction_type": "response_required",
            "call_id": "call-1",
            "response_id": "r1",
            "metadata": {"tenant_id": "tenant-1"},
            "transcript": "Can I book an appointment tomorrow?",
        }
    )

    response = orchestrator.handle_retell_event(event)

    assert response is not None
    assert response.source == "booking_disabled"
    assert "services, prices, and timings" in response.text

