"""Domain entities for Retell-backed voice agents."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _parse_dt(value: str | None) -> datetime:
    if not value:
        return utc_now()
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@dataclass(frozen=True)
class TenantContext:
    tenant_id: str
    firebase_uid: str | None = None
    user_id: str | None = None
    business_id: str | None = None
    product_domain: str = "voice"
    source: str = "retell"

    def to_dict(self) -> dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "firebase_uid": self.firebase_uid,
            "user_id": self.user_id,
            "business_id": self.business_id,
            "product_domain": self.product_domain,
            "source": self.source,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "TenantContext":
        return cls(
            tenant_id=str(payload["tenant_id"]),
            firebase_uid=payload.get("firebase_uid"),
            user_id=payload.get("user_id"),
            business_id=payload.get("business_id"),
            product_domain=payload.get("product_domain") or "voice",
            source=payload.get("source") or "retell",
        )


@dataclass(frozen=True)
class CallerIdentity:
    phone_number: str | None = None
    normalized_phone: str | None = None
    display_name: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "phone_number": self.phone_number,
            "normalized_phone": self.normalized_phone,
            "display_name": self.display_name,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any] | None) -> "CallerIdentity":
        payload = payload or {}
        return cls(
            phone_number=payload.get("phone_number"),
            normalized_phone=payload.get("normalized_phone"),
            display_name=payload.get("display_name"),
        )


@dataclass(frozen=True)
class BusinessKnowledge:
    tenant: TenantContext
    raw_data: dict[str, Any]
    loaded_at: datetime = field(default_factory=utc_now)

    @property
    def business_name(self) -> str:
        return self.raw_data.get("business_name") or "our business"

    @property
    def has_data(self) -> bool:
        return bool(self.raw_data)


@dataclass
class VoiceTurn:
    call_id: str
    turn_id: str
    tenant: TenantContext
    transcript: str
    language: str
    response_id: str | int | None = None
    caller: CallerIdentity | None = None
    created_at: datetime = field(default_factory=utc_now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "call_id": self.call_id,
            "turn_id": self.turn_id,
            "tenant": self.tenant.to_dict(),
            "transcript": self.transcript,
            "language": self.language,
            "response_id": self.response_id,
            "caller": self.caller.to_dict() if self.caller else None,
            "created_at": _iso(self.created_at),
        }


@dataclass(frozen=True)
class AgentAction:
    name: str
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AgentResponse:
    text: str
    language: str = "en"
    source: str = "fallback"
    confidence: float = 0.0
    actions: list[AgentAction] = field(default_factory=list)
    end_call: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_retell_payload(self, response_id: str | int | None = None) -> dict[str, Any]:
        payload = {
            "response_type": "response",
            "content": self.text,
            "content_complete": True,
            "end_call": self.end_call,
        }
        if response_id is not None:
            payload["response_id"] = response_id
        return payload


@dataclass(frozen=True)
class CostEvent:
    call_id: str
    tenant_id: str
    provider: str
    metric: str
    quantity: float
    unit: str
    estimated_cost_usd: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=utc_now)

    def to_row(self) -> dict[str, Any]:
        return {
            "call_id": self.call_id,
            "tenant_id": self.tenant_id,
            "provider": self.provider,
            "metric": self.metric,
            "quantity": self.quantity,
            "unit": self.unit,
            "estimated_cost_usd": self.estimated_cost_usd,
            "metadata": self.metadata,
            "created_at": _iso(self.created_at),
        }


@dataclass
class CallSession:
    call_id: str
    tenant: TenantContext
    caller: CallerIdentity = field(default_factory=CallerIdentity)
    language: str = "en"
    metadata: dict[str, Any] = field(default_factory=dict)
    turn_count: int = 0
    started_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)

    def next_turn_id(self) -> str:
        self.turn_count += 1
        self.updated_at = utc_now()
        return f"{self.call_id}:{self.turn_count}"

    def to_dict(self) -> dict[str, Any]:
        return {
            "call_id": self.call_id,
            "tenant": self.tenant.to_dict(),
            "caller": self.caller.to_dict(),
            "language": self.language,
            "metadata": self.metadata,
            "turn_count": self.turn_count,
            "started_at": _iso(self.started_at),
            "updated_at": _iso(self.updated_at),
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "CallSession":
        return cls(
            call_id=str(payload["call_id"]),
            tenant=TenantContext.from_dict(payload["tenant"]),
            caller=CallerIdentity.from_dict(payload.get("caller")),
            language=payload.get("language") or "en",
            metadata=payload.get("metadata") or {},
            turn_count=int(payload.get("turn_count") or 0),
            started_at=_parse_dt(payload.get("started_at")),
            updated_at=_parse_dt(payload.get("updated_at")),
        )

