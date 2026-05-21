"""Turn router for Retell custom LLM events."""

from __future__ import annotations

from typing import Any

from ..contracts.retell import RetellInboundEvent
from ..domain.entities import AgentResponse, CallSession, VoiceTurn
from ..infrastructure.observability import latency_timer, log_turn
from ..infrastructure.booking_repository import BookingRepository
from ..infrastructure.repositories import AgentsRepository
from ..infrastructure.session_store import create_session_store
from .booking_flow_service import BookingFlowService
from .booking_gateway import BookingGateway, create_booking_gateway_from_env
from .call_session_service import CallSessionService
from .cost_metering_service import CostMeteringService
from .faq_answer_service import FAQAnswerService
from .language_service import LanguageService


class TurnOrchestrator:
    def __init__(
        self,
        *,
        repository: AgentsRepository,
        sessions: CallSessionService,
        faq_answers: FAQAnswerService,
        language: LanguageService,
        costs: CostMeteringService,
        booking_gateway: BookingGateway,
        booking_flow: BookingFlowService | None = None,
    ):
        self._repository = repository
        self._sessions = sessions
        self._faq_answers = faq_answers
        self._language = language
        self._costs = costs
        self._booking_gateway = booking_gateway
        self._booking_flow = booking_flow or BookingFlowService(
            booking_repository=BookingRepository(),
            availability_repository=repository,
        )

    def handle_retell_event(self, event: RetellInboundEvent) -> AgentResponse | None:
        if event.is_update_only:
            return None
        if not event.needs_response:
            return None
        session = self._sessions.get_or_create(
            call_id=event.call_id or "unknown",
            metadata=event.metadata,
            caller_phone=event.caller_phone,
        )
        return self.handle_turn(session, event.transcript, response_id=event.response_id)

    def handle_turn(
        self,
        session: CallSession,
        transcript: str,
        *,
        response_id: str | int | None = None,
    ) -> AgentResponse:
        transcript = (transcript or "").strip()
        with latency_timer() as timer:
            language = self._language.detect(transcript)
            session.language = language.code
            turn = VoiceTurn(
                call_id=session.call_id,
                turn_id=session.next_turn_id(),
                tenant=session.tenant,
                transcript=transcript,
                language=language.code,
                response_id=response_id,
                caller=session.caller,
            )

            knowledge = self._repository.load_business_knowledge(session.tenant)
            tool_call_id = str(response_id or turn.turn_id)
            response = self._route_turn(transcript, session, knowledge.raw_data, tool_call_id=tool_call_id)

        latency_ms = timer["latency_ms"]
        self._repository.record_turn_event(
            turn,
            response_text=response.text,
            source=response.source,
            latency_ms=latency_ms,
            metadata={"response_id": response_id, **response.metadata},
        )
        self._costs.record_local_turn(
            call_id=session.call_id,
            tenant_id=session.tenant.tenant_id,
            source=response.source,
            latency_ms=latency_ms,
        )
        self._sessions.save(session)
        log_turn(session.call_id, session.tenant.tenant_id, transcript, response.source, latency_ms)
        return response

    def _route_turn(
        self,
        transcript: str,
        session: CallSession,
        business_data: dict[str, Any],
        *,
        tool_call_id: str,
    ) -> AgentResponse:
        if not transcript:
            name = business_data.get("business_name") or "Flowauxi"
            return AgentResponse(
                text=f"Hi, this is {name}. How can I help you today?",
                language=session.language,
                source="greeting",
                confidence=0.95,
            )

        if self._booking_flow.has_active_flow(session) or self._looks_like_booking_intent(transcript):
            booking_response = self._booking_flow.handle_turn(
                session=session,
                transcript=transcript,
                business_data=business_data,
                tool_call_id=tool_call_id,
            )
            if booking_response:
                return booking_response

        knowledge = self._faq_answers.answer(transcript, knowledge=_knowledge(session, business_data))
        if knowledge:
            return AgentResponse(
                text=knowledge.text,
                language=session.language,
                source=knowledge.source,
                confidence=knowledge.confidence,
                metadata=knowledge.metadata,
            )

        if business_data:
            business_name = business_data.get("business_name") or "the business"
            fallback = (
                f"I do not have that exact detail for {business_name} yet. "
                "I can help with timings, location, services, and prices from the details I have."
            )
        else:
            fallback = (
                "I do not have this business's voice knowledge loaded yet. "
                "Please add tenant metadata or a Retell agent mapping before taking live calls."
            )
        return AgentResponse(text=fallback, language=session.language, source="fallback", confidence=0.3)

    @staticmethod
    def _looks_like_booking_intent(message: str) -> bool:
        lowered = message.lower()
        return any(
            word in lowered
            for word in (
                "book",
                "appointment",
                "slot",
                "available",
                "availability",
                "reschedule",
                "move booking",
                "cancel booking",
            )
        )


def _knowledge(session: CallSession, raw_data: dict[str, Any]):
    from ..domain.entities import BusinessKnowledge

    return BusinessKnowledge(tenant=session.tenant, raw_data=raw_data)


def build_default_orchestrator() -> TurnOrchestrator:
    repository = AgentsRepository()
    sessions = CallSessionService(repository, create_session_store())
    costs = CostMeteringService(repository)
    booking_gateway = create_booking_gateway_from_env()
    return TurnOrchestrator(
        repository=repository,
        sessions=sessions,
        faq_answers=FAQAnswerService(),
        language=LanguageService(),
        costs=costs,
        booking_gateway=booking_gateway,
        booking_flow=BookingFlowService(
            booking_repository=BookingRepository(),
            availability_repository=repository,
        ),
    )
