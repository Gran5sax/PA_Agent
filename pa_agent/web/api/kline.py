"""GET /api/kline, /api/symbols, /api/timeframes, /api/data-sources.

The data source is a single shared, stateful instance held by AppContext.
``source`` switches it at runtime (see web/data_source.py) so the web UI can pick
EastMoney / AkShare / TradingView / MT5 / ... from a dropdown. All synchronous
data-source calls run in a worker thread (``asyncio.to_thread``) so they never
block the event loop.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Query

from pa_agent.app_context import AppContext
from pa_agent.data.base import DataSourceError, KlineBar, KlineFrame
from pa_agent.web import data_source as ds
from pa_agent.web.deps import get_ctx
from pa_agent.web.schemas import (
    DataSourceInfo,
    DataSourcesResponse,
    KlineBarOut,
    KlineResponse,
    SymbolsResponse,
    TimeframesResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["kline"])

# Source order for the dropdown. Primary (recommended) sources first — the user
# asked for 东方财富 + AkShare as the main data sources; the rest are selectable.
_SOURCE_ORDER: list[tuple[str, bool]] = [
    ("eastmoney", True),
    ("akshare", True),
    ("tradingview", False),
    ("mt5", False),
    ("eastmoney_futures", False),
    ("tushare", False),
    ("yfinance", False),
]

# Extra closed bars fetched before the visible window so EMA20/ATR14 warm up.
_WARMUP_BARS = 30


@router.get("/data-sources", response_model=DataSourcesResponse)
async def list_data_sources(ctx: AppContext = Depends(get_ctx)) -> DataSourcesResponse:
    from pa_agent.data.factory import data_source_label, default_symbol_for_kind

    sources = [
        DataSourceInfo(
            kind=kind,
            label=data_source_label(kind),
            symbol=default_symbol_for_kind(kind),
            primary=primary,
        )
        for kind, primary in _SOURCE_ORDER
    ]
    return DataSourcesResponse(sources=sources, current=ds.current_kind())


@router.get("/kline", response_model=KlineResponse)
async def get_kline(
    symbol: str = Query(...),
    timeframe: str = Query(...),
    n: int = Query(100, ge=2, le=5000),
    source: str = Query("eastmoney"),
    ctx: AppContext = Depends(get_ctx),
) -> KlineResponse:
    def _work() -> tuple[KlineFrame, list[KlineBar]]:
        ds.ensure_data_source(ctx, source)
        ds.ensure_subscribed(ctx, symbol, timeframe)
        from pa_agent.data.snapshot import build_display_frame

        raw = ctx.data_source.latest_snapshot(n + _WARMUP_BARS)
        frame = build_display_frame(raw, n, symbol, timeframe)
        if frame is None:
            raise ValueError("insufficient closed bars for requested n")
        return frame, raw

    try:
        frame, raw = await asyncio.to_thread(_work)
    except DataSourceError as exc:
        raise HTTPException(status_code=502, detail=f"data source error: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    bars = [KlineBarOut(**asdict(b)) for b in frame.bars]
    forming: KlineBarOut | None = None
    if raw and not raw[0].closed:
        forming = KlineBarOut(**asdict(raw[0]))

    return KlineResponse(
        symbol=frame.symbol,
        timeframe=frame.timeframe,
        bars=bars,
        ema20=list(frame.indicators.ema20),
        atr14=list(frame.indicators.atr14),
        forming_bar=forming,
        snapshot_ts_local_ms=frame.snapshot_ts_local_ms,
    )


@router.get("/symbols", response_model=SymbolsResponse)
async def get_symbols(
    source: str = Query("eastmoney"),
    ctx: AppContext = Depends(get_ctx),
) -> SymbolsResponse:
    def _work() -> list[str]:
        ds.ensure_data_source(ctx, source)
        return list(ctx.data_source.list_symbols())

    try:
        symbols = await asyncio.to_thread(_work)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return SymbolsResponse(symbols=symbols)


@router.get("/timeframes", response_model=TimeframesResponse)
async def get_timeframes(
    source: str = Query("eastmoney"),
    ctx: AppContext = Depends(get_ctx),
) -> TimeframesResponse:
    def _work() -> list[str]:
        ds.ensure_data_source(ctx, source)
        return list(ctx.data_source.supported_timeframes())

    try:
        tfs = await asyncio.to_thread(_work)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return TimeframesResponse(timeframes=tfs)
