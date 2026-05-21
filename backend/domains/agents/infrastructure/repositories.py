"""Repository layer for voice call state, tenant lookup, and business knowledge."""

from __future__ import annotations

import copy
import uuid
from datetime import date
from typing import Any

from ..domain.entities import BusinessKnowledge, CallerIdentity, CallSession, CostEvent, TenantContext, VoiceTurn, utc_now
from ..domain.errors import TenantResolutionError
from ..validators.phone import normalize_phone


def _iso_now() -> str:
    return utc_now().isoformat()


class AgentsRepository:
    """Supabase-backed repository with in-memory fallback.

    The fallback mirrors the existing file_tools repository style so local tests
    and sandbox calls remain usable before migrations have been applied.
    """

    _memory_call_sessions: dict[str, dict[str, Any]] = {}
    _memory_turn_events: list[dict[str, Any]] = []
    _memory_cost_events: list[dict[str, Any]] = []

    def __init__(self, supabase_client: Any | None = None):
        if supabase_client is False:
            self._supabase = None
            return
        self._supabase = supabase_client
        if self._supabase is None:
            try:
                from supabase_client import get_supabase_client

                self._supabase = get_supabase_client()
            except Exception:
                self._supabase = None

    def resolve_tenant(self, metadata: dict[str, Any]) -> TenantContext:
        meta = self._flatten_metadata(metadata)
        retell_agent_id = _first(meta, "retell_agent_id", "agent_id", "retellAgentId")

        mapped: dict[str, Any] = {}
        if retell_agent_id:
            mapped = self._lookup_voice_agent_mapping(str(retell_agent_id)) or {}

        merged = {**mapped, **meta}
        tenant_id = _first(merged, "tenant_id", "tenantId")
        firebase_uid = _first(merged, "firebase_uid", "firebaseUid", "firebase_user_id")
        user_id = _first(merged, "user_id", "userId", "supabase_user_id")
        business_id = _first(merged, "business_id", "businessId")
        product_domain = _first(merged, "product_domain", "domain", "source") or "voice"

        if tenant_id:
            tenant_mapping = self._lookup_tenant_mapping(str(tenant_id)) or {}
            firebase_uid = firebase_uid or _first(tenant_mapping, "firebase_uid", "firebaseUid", "firebase_user_id")
            user_id = user_id or _first(tenant_mapping, "user_id", "userId", "supabase_user_id")
            business_id = business_id or _first(tenant_mapping, "business_id", "businessId")

        if not tenant_id and firebase_uid:
            tenant_id = f"firebase:{firebase_uid}"
        if not tenant_id and user_id:
            tenant_id = f"user:{user_id}"
        if not tenant_id and business_id:
            tenant_id = f"business:{business_id}"
        if not tenant_id:
            raise TenantResolutionError(
                "Retell metadata must include tenant_id, Firebase UID, Supabase user_id, "
                "business_id, or a mapped Retell agent id."
            )

        return TenantContext(
            tenant_id=str(tenant_id),
            firebase_uid=str(firebase_uid) if firebase_uid else None,
            user_id=str(user_id) if user_id else None,
            business_id=str(business_id) if business_id else None,
            product_domain=str(product_domain),
            source="retell",
        )

    def load_business_knowledge(self, tenant: TenantContext) -> BusinessKnowledge:
        if tenant.firebase_uid:
            data = self._load_business_via_existing_loader(tenant.firebase_uid)
            if data:
                return BusinessKnowledge(tenant=tenant, raw_data=data)

        data = self._load_business_direct(tenant)
        return BusinessKnowledge(tenant=tenant, raw_data=data or {})

    def find_caller_by_phone(self, tenant: TenantContext, phone_number: str | None) -> CallerIdentity:
        normalized = normalize_phone(phone_number)
        if not normalized:
            return CallerIdentity(phone_number=phone_number)

        if self._supabase is not None:
            for owner_id in [tenant.user_id, tenant.firebase_uid]:
                if not owner_id:
                    continue
                try:
                    result = (
                        self._supabase.table("contacts")
                        .select("name, phone_number, phone_normalized, email")
                        .eq("user_id", owner_id)
                        .eq("phone_normalized", normalized)
                        .limit(1)
                        .execute()
                    )
                    if result.data:
                        row = result.data[0]
                        return CallerIdentity(
                            phone_number=row.get("phone_number") or phone_number,
                            normalized_phone=normalized,
                            display_name=row.get("name"),
                        )
                except Exception:
                    continue

        return CallerIdentity(phone_number=phone_number, normalized_phone=normalized)

    def record_call_session(self, session: CallSession, *, status: str = "active") -> None:
        row = {
            "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{session.tenant.tenant_id}:{session.call_id}")),
            "tenant_id": session.tenant.tenant_id,
            "call_id": session.call_id,
            "retell_call_id": session.call_id,
            "user_id": session.tenant.user_id,
            "firebase_uid": session.tenant.firebase_uid,
            "business_id": session.tenant.business_id,
            "product_domain": session.tenant.product_domain,
            "caller_phone": session.caller.phone_number,
            "caller_phone_normalized": session.caller.normalized_phone,
            "language": session.language,
            "status": status,
            "metadata": session.metadata,
            "started_at": session.started_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
        }
        if self._upsert("voice_call_sessions", row, on_conflict="tenant_id,call_id"):
            return
        self._memory_call_sessions[self._session_key(session.tenant.tenant_id, session.call_id)] = copy.deepcopy(row)

    def record_turn_event(
        self,
        turn: VoiceTurn,
        *,
        response_text: str | None = None,
        source: str | None = None,
        latency_ms: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        row = {
            "id": str(uuid.uuid4()),
            "tenant_id": turn.tenant.tenant_id,
            "call_id": turn.call_id,
            "response_id": str(turn.response_id) if turn.response_id is not None else None,
            "turn_id": turn.turn_id,
            "speaker": "caller",
            "language": turn.language,
            "transcript": turn.transcript,
            "response_text": response_text,
            "source": source,
            "latency_ms": latency_ms,
            "metadata": metadata or {},
            "created_at": _iso_now(),
        }
        if not self._insert("voice_turn_events", row):
            self._memory_turn_events.append(copy.deepcopy(row))

    def record_cost_event(self, event: CostEvent) -> None:
        row = {"id": str(uuid.uuid4()), **event.to_row()}
        if not self._insert("voice_cost_events", row):
            self._memory_cost_events.append(copy.deepcopy(row))

    def get_available_slots(
        self,
        tenant: TenantContext,
        *,
        service_id: str | None,
        target_date: date,
        slot_granularity: int = 30,
    ) -> list[dict[str, Any]]:
        """Use the existing booking RPC for staff-aware availability."""
        user_id = tenant.firebase_uid or tenant.user_id or tenant.business_id
        if self._supabase is None or not user_id or not service_id:
            return []
        try:
            result = self._supabase.rpc(
                "get_available_slots",
                {
                    "p_user_id": user_id,
                    "p_service_id": service_id,
                    "p_date": target_date.isoformat(),
                    "p_slot_granularity": slot_granularity,
                },
            ).execute()
        except Exception:
            return []

        slots: list[dict[str, Any]] = []
        for row in result.data or []:
            raw_time = str(row.get("slot_time") or "")
            time_text = raw_time[:5] if len(raw_time) >= 5 else raw_time
            available_count = int(row.get("available_count") or 0)
            slots.append(
                {
                    "time": time_text,
                    "available": available_count > 0,
                    "capacity": available_count,
                    "totalStaff": int(row.get("total_staff") or 0),
                }
            )
        return slots

    def _load_business_via_existing_loader(self, firebase_uid: str) -> dict[str, Any] | None:
        try:
            from supabase_client import get_business_from_supabase

            return get_business_from_supabase(firebase_uid)
        except Exception:
            return None

    def _load_business_direct(self, tenant: TenantContext) -> dict[str, Any] | None:
        if self._supabase is None:
            return None

        selectors = []
        if tenant.firebase_uid:
            selectors.append(("user_id", tenant.firebase_uid))
        if tenant.user_id:
            selectors.append(("user_id", tenant.user_id))
        if tenant.business_id:
            selectors.append(("id", tenant.business_id))

        for field, value in selectors:
            try:
                result = self._supabase.table("businesses").select("*").eq(field, value).limit(1).execute()
                if result.data:
                    row = result.data[0]
                    try:
                        from supabase_client import convert_supabase_business_to_ai_format

                        return convert_supabase_business_to_ai_format(row)
                    except Exception:
                        return row
            except Exception:
                continue
        return None

    def _lookup_voice_agent_mapping(self, retell_agent_id: str) -> dict[str, Any] | None:
        if self._supabase is None:
            return None
        try:
            result = (
                self._supabase.table("voice_agent_tenant_mappings")
                .select("*")
                .eq("retell_agent_id", retell_agent_id)
                .eq("is_enabled", True)
                .limit(1)
                .execute()
            )
            return result.data[0] if result.data else None
        except Exception:
            return None

    def _lookup_tenant_mapping(self, tenant_id: str) -> dict[str, Any] | None:
        if self._supabase is None:
            return None
        try:
            result = self._supabase.table("tenant_mappings").select("*").eq("tenant_id", tenant_id).limit(1).execute()
            return result.data[0] if result.data else None
        except Exception:
            return None

    def _insert(self, table: str, row: dict[str, Any]) -> bool:
        if self._supabase is None:
            return False
        try:
            self._supabase.table(table).insert(row).execute()
            return True
        except Exception:
            return False

    def _upsert(self, table: str, row: dict[str, Any], *, on_conflict: str) -> bool:
        if self._supabase is None:
            return False
        try:
            self._supabase.table(table).upsert(row, on_conflict=on_conflict).execute()
            return True
        except Exception:
            return False

    @staticmethod
    def _session_key(tenant_id: str, call_id: str) -> str:
        return f"{tenant_id}:{call_id}"

    @staticmethod
    def _flatten_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
        metadata = metadata or {}
        flattened = copy.deepcopy(metadata)
        for nested_key in ("tenant", "business", "shop", "user"):
            nested = flattened.get(nested_key)
            if isinstance(nested, dict):
                flattened.update({k: v for k, v in nested.items() if v is not None})
        return flattened


def _first(payload: dict[str, Any], *keys: str) -> Any | None:
    for key in keys:
        value = payload.get(key)
        if value is not None and value != "":
            return value
    return None
