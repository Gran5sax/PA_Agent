"""GET /api/health — liveness + quick config probe."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from pa_agent.app_context import AppContext
from pa_agent.web.deps import get_ctx
from pa_agent.web.schemas import HealthResponse

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(ctx: AppContext = Depends(get_ctx)) -> HealthResponse:
    from pa_agent.config.settings import provider_api_key_configured

    return HealthResponse(
        status="ok",
        provider_configured=provider_api_key_configured(ctx.settings),
        data_source=getattr(ctx.settings.general, "last_data_source", "mt5"),
        symbol=getattr(ctx.settings.general, "last_symbol", ""),
        timeframe=getattr(ctx.settings.general, "last_timeframe", ""),
    )
