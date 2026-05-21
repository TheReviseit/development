"""FastAPI app factory for the Retell voice sidecar."""

from __future__ import annotations

from ..application.turn_orchestrator import TurnOrchestrator, build_default_orchestrator
from .retell_ws import build_retell_websocket_handler
from .schemas import HealthResponse


def create_app(orchestrator: TurnOrchestrator | None = None):
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    orchestrator = orchestrator or build_default_orchestrator()
    app = FastAPI(
        title="Flowauxi Voice Agents",
        version="0.1.0",
        docs_url="/docs",
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(checks={"app": True})

    @app.get("/ready", response_model=HealthResponse)
    def ready() -> HealthResponse:
        return HealthResponse(status="ready", checks={"websocket": True, "tenant_metadata_required": True})

    retell_handler = build_retell_websocket_handler(orchestrator)
    app.websocket("/v1/retell/ws")(retell_handler)
    app.websocket("/v1/retell/ws/")(retell_handler)
    app.websocket("/v1/retell/ws/{call_id}")(retell_handler)
    app.websocket("/v1/retell/ws/{call_id}/")(retell_handler)
    return app
