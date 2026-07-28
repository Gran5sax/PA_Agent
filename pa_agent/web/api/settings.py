"""GET/PUT /api/settings — read/write config/settings.json.

GET never returns the plaintext API key (only ``has_api_key``). PUT accepts a
partial update; a non-empty ``provider.api_key`` replaces it, and changing
provider fields rebuilds the AI client in-place so the next analysis uses the
new config without restart.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from pa_agent.app_context import AppContext
from pa_agent.web.deps import get_ctx

router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/settings")
async def get_settings(ctx: AppContext = Depends(get_ctx)) -> dict:
    s = ctx.settings
    return {
        "provider": {
            "model": s.provider.model,
            "base_url": s.provider.base_url,
            "has_api_key": bool((s.provider.api_key or "").strip()),
            "thinking": s.provider.thinking,
            "reasoning_effort": s.provider.reasoning_effort,
            "context_window": s.provider.context_window,
        },
        "general": s.general.model_dump(),
        "prompt": s.prompt.model_dump(),
        "validation": s.validation.model_dump(),
    }


@router.put("/settings")
async def put_settings(payload: dict, request: Request) -> dict:
    ctx: AppContext = request.app.state.ctx
    s = ctx.settings
    rebuild_client = False

    if "provider" in payload and isinstance(payload["provider"], dict):
        p = payload["provider"]
        if "model" in p:
            s.provider.model = p["model"]
            rebuild_client = True
        if "base_url" in p:
            s.provider.base_url = p["base_url"]
            rebuild_client = True
        if "api_key" in p and p["api_key"]:
            s.provider.api_key = p["api_key"]
            rebuild_client = True
        if "thinking" in p:
            s.provider.thinking = p["thinking"]
            rebuild_client = True
        if "reasoning_effort" in p:
            s.provider.reasoning_effort = p["reasoning_effort"]
            rebuild_client = True

    for section in ("general", "prompt", "validation"):
        if section in payload and isinstance(payload[section], dict):
            target = getattr(s, section)
            for k, v in payload[section].items():
                if hasattr(target, k):
                    setattr(target, k, v)

    if rebuild_client:
        from pa_agent.ai.client_factory import create_ai_client

        ctx.client = create_ai_client(s.provider, logger_=ctx.logger)

    from pa_agent.config.paths import SETTINGS_JSON_PATH
    from pa_agent.config.settings import save_settings

    save_settings(s, SETTINGS_JSON_PATH)
    return {"ok": True}
