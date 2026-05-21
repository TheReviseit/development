"""Retell custom LLM WebSocket contracts.

The payloads are intentionally permissive because Retell can add fields over
time. The normalizer extracts only the protocol surface this domain needs.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RetellInboundEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    interaction_type: str = "response_required"
    response_id: str | int | None = None
    call_id: str | None = None
    transcript: str = ""
    caller_phone: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    raw: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "RetellInboundEvent":
        call = payload.get("call") or payload.get("call_details") or {}
        metadata: dict[str, Any] = {}
        for key in ("metadata", "call_metadata", "retell_llm_dynamic_variables"):
            if isinstance(payload.get(key), dict):
                metadata.update(payload[key])
        if isinstance(call.get("metadata"), dict):
            metadata.update(call["metadata"])

        call_id = (
            payload.get("call_id")
            or payload.get("callId")
            or call.get("call_id")
            or call.get("callId")
            or payload.get("conversation_id")
        )
        response_id = payload.get("response_id") or payload.get("responseId")
        transcript = _extract_transcript(payload)
        caller_phone = (
            payload.get("from_number")
            or payload.get("caller_phone")
            or call.get("from_number")
            or call.get("fromNumber")
            or call.get("caller_phone")
            or metadata.get("caller_phone")
        )

        return cls(
            interaction_type=payload.get("interaction_type") or payload.get("event") or "response_required",
            response_id=response_id,
            call_id=str(call_id) if call_id else None,
            transcript=transcript,
            caller_phone=str(caller_phone) if caller_phone else None,
            metadata=metadata,
            raw=payload,
        )

    @property
    def needs_response(self) -> bool:
        return self.interaction_type in {"response_required", "reminder_required"}

    @property
    def is_update_only(self) -> bool:
        return self.interaction_type == "update_only"


class RetellOutboundResponse(BaseModel):
    response_type: str = "response"
    content: str
    response_id: str | int | None = None
    content_complete: bool = True
    end_call: bool = False

    def to_payload(self) -> dict[str, Any]:
        return self.model_dump(exclude_none=True)


def _extract_transcript(payload: dict[str, Any]) -> str:
    direct = payload.get("transcript") or payload.get("user_response") or payload.get("text")
    if isinstance(direct, str):
        return direct.strip()
    if isinstance(direct, list):
        return _latest_user_text(direct)

    transcript_object = payload.get("transcript_object") or payload.get("transcriptObject")
    if isinstance(transcript_object, list):
        return _latest_user_text(transcript_object)

    messages = payload.get("messages")
    if isinstance(messages, list):
        return _latest_user_text(messages)
    return ""


def _latest_user_text(items: list[Any]) -> str:
    for item in reversed(items):
        if not isinstance(item, dict):
            continue
        role = item.get("role") or item.get("speaker")
        if role and str(role).lower() not in {"user", "caller", "customer"}:
            continue
        content = item.get("content") or item.get("text") or item.get("transcript")
        if isinstance(content, str) and content.strip():
            return content.strip()
    return ""

