"""FastAPI dependency providers."""
from __future__ import annotations

from fastapi import Request

from pa_agent.app_context import AppContext


def get_ctx(request: Request) -> AppContext:
    """Return the ``AppContext`` attached to the running app (set in lifespan)."""
    return request.app.state.ctx
