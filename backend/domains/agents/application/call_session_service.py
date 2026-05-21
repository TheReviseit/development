"""Call session orchestration for Retell voice calls."""

from __future__ import annotations

from ..domain.entities import CallSession
from ..infrastructure.repositories import AgentsRepository
from ..infrastructure.session_store import SessionStore


class CallSessionService:
    def __init__(self, repository: AgentsRepository, store: SessionStore):
        self._repository = repository
        self._store = store

    def get_or_create(
        self,
        *,
        call_id: str,
        metadata: dict,
        caller_phone: str | None = None,
    ) -> CallSession:
        tenant = self._repository.resolve_tenant(metadata)
        existing = self._store.get(tenant.tenant_id, call_id)
        if existing:
            return existing

        caller = self._repository.find_caller_by_phone(tenant, caller_phone)
        session = CallSession(
            call_id=call_id,
            tenant=tenant,
            caller=caller,
            metadata=metadata or {},
        )
        self._store.save(session)
        self._repository.record_call_session(session)
        return session

    def save(self, session: CallSession) -> None:
        self._store.save(session)
        self._repository.record_call_session(session)

