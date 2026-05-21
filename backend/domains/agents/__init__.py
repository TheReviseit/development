"""Voice agents domain.

This package hosts the FastAPI sidecar used by Retell custom LLM WebSockets.
It intentionally stays outside the Flask app so voice turns can use native
async WebSocket handling without changing the existing backend entrypoint.
"""

