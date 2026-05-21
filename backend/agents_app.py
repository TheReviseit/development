"""ASGI entrypoint for the Flowauxi voice agents sidecar.

Run from the backend directory with:
    uvicorn agents_app:app --host 0.0.0.0 --port 10001
"""

from domains.agents.api.app import create_app


app = create_app()

