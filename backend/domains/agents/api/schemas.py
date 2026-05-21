"""API schemas for the voice agents sidecar."""

from __future__ import annotations

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    success: bool = True
    service: str = "voice_agents"
    status: str = "ok"
    checks: dict[str, bool] = Field(default_factory=dict)

