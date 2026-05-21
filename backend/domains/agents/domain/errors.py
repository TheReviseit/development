"""Domain errors for voice agents."""

from __future__ import annotations


class AgentsError(Exception):
    code = "agents_error"

    def __init__(self, message: str, *, code: str | None = None):
        super().__init__(message)
        if code:
            self.code = code
        self.message = message


class TenantResolutionError(AgentsError):
    code = "tenant_resolution_failed"


class RetellProtocolError(AgentsError):
    code = "retell_protocol_error"


class KnowledgeUnavailableError(AgentsError):
    code = "knowledge_unavailable"


class BookingGatewayError(AgentsError):
    code = "booking_gateway_error"

