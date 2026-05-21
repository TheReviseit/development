"""Cost metering for voice agents."""

from __future__ import annotations

from ..domain.entities import CostEvent
from ..infrastructure.repositories import AgentsRepository


class CostMeteringService:
    def __init__(self, repository: AgentsRepository):
        self._repository = repository

    def record_local_turn(self, *, call_id: str, tenant_id: str, source: str, latency_ms: int) -> None:
        self._repository.record_cost_event(
            CostEvent(
                call_id=call_id,
                tenant_id=tenant_id,
                provider="flowauxi",
                metric="local_voice_turn",
                quantity=1,
                unit="turn",
                estimated_cost_usd=0.0,
                metadata={"source": source, "latency_ms": latency_ms, "llm_tokens": 0},
            )
        )

    def record_estimated_retell_minutes(self, *, call_id: str, tenant_id: str, minutes: float) -> None:
        estimated = round(minutes * 0.085, 6)
        self._repository.record_cost_event(
            CostEvent(
                call_id=call_id,
                tenant_id=tenant_id,
                provider="retell",
                metric="estimated_voice_minutes",
                quantity=minutes,
                unit="minute",
                estimated_cost_usd=estimated,
                metadata={"assumption": "retell_voice_stt_tts_telephony_payg"},
            )
        )

