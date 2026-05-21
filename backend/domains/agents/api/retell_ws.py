"""Retell custom LLM WebSocket endpoint."""

from __future__ import annotations

import asyncio

from fastapi import WebSocket

from ..application.turn_orchestrator import TurnOrchestrator
from ..contracts.retell import RetellOutboundResponse
from ..domain.errors import AgentsError
from ..validators.retell_event_validator import parse_retell_event


def build_retell_websocket_handler(orchestrator: TurnOrchestrator):
    async def retell_websocket(websocket: WebSocket, call_id: str | None = None) -> None:
        await websocket.accept()
        await websocket.send_json(
            {
                "response_type": "config",
                "config": {
                    "auto_reconnect": True,
                    "call_details": True,
                },
            }
        )
        await websocket.send_json(
            {
                "response_type": "response",
                "response_id": 0,
                "content": "Hi, this is Flowauxi. How can I help you today?",
                "content_complete": True,
                "end_call": False,
            }
        )
        while True:
            try:
                payload = await websocket.receive_json()
            except Exception:
                break

            try:
                if call_id and not payload.get("call_id"):
                    payload["call_id"] = call_id
                event = parse_retell_event(payload)
                response = await asyncio.to_thread(orchestrator.handle_retell_event, event)
                if response is None:
                    continue
                outbound = RetellOutboundResponse(
                    response_id=event.response_id,
                    content=response.text,
                    end_call=response.end_call,
                )
                await websocket.send_json(outbound.to_payload())
            except AgentsError as exc:
                await websocket.send_json(
                    {
                        "response_type": "response",
                        "content": "I am having trouble connecting this call to the right business. Please try again shortly.",
                        "content_complete": True,
                        "end_call": False,
                        "metadata": {"error_code": exc.code},
                    }
                )
            except Exception:
                await websocket.send_json(
                    {
                        "response_type": "response",
                        "content": "I hit a temporary issue. Please say that again in a moment.",
                        "content_complete": True,
                        "end_call": False,
                    }
                )

    return retell_websocket
