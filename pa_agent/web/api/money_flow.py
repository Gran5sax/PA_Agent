"""GET /api/money-flow — East Money A-share main-force money-flow daily klines.

Thin async wrapper around ``eastmoney_extended.fetch_money_flow_klines`` (klt=
101, daily). That function issues its own HTTP (curl_cffi) and needs no
DataSource / AppContext, so this endpoint doesn't depend on ``ctx``. Returns an
empty ``items`` list when the symbol isn't an A-share or the upstream call fails
— the frontend then shows a "A-share daily only" placeholder.
"""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Query

router = APIRouter(tags=["money-flow"])


@router.get("/api/money-flow")
async def get_money_flow(
    symbol: str = Query(...),
    lmt: int = Query(120, ge=1, le=1000),
) -> dict[str, Any]:
    def _work() -> list[dict[str, Any]]:
        from pa_agent.data.eastmoney_extended import fetch_money_flow_klines

        return fetch_money_flow_klines(symbol, klt="101", lmt=lmt)

    items = await asyncio.to_thread(_work)
    return {"symbol": symbol, "items": items}
