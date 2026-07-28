"""Pydantic request/response models for the web API (thin wrappers).

Authoritative data shapes live in ``pa_agent.data.base`` (KlineBar / KlineFrame),
``pa_agent.records.schema`` (AnalysisRecord) and ``pa_agent.config.settings``
(Settings). These models mirror them for JSON serialization.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class KlineBarOut(BaseModel):
    seq: int
    ts_open: float
    open: float
    high: float
    low: float
    close: float
    volume: float
    amount: float = 0.0
    pct_chg: Optional[float] = None
    closed: bool = True


class KlineResponse(BaseModel):
    symbol: str
    timeframe: str
    bars: list[KlineBarOut]
    ema20: list[float]
    atr14: list[float]
    forming_bar: Optional[KlineBarOut] = None
    snapshot_ts_local_ms: int


class SymbolsResponse(BaseModel):
    symbols: list[str]


class TimeframesResponse(BaseModel):
    timeframes: list[str]


class HealthResponse(BaseModel):
    status: str
    provider_configured: bool
    data_source: str
    symbol: str
    timeframe: str


class DataSourceInfo(BaseModel):
    kind: str
    label: str
    symbol: str  # default symbol for this kind
    primary: bool  # main/recommended sources shown first


class DataSourcesResponse(BaseModel):
    sources: list[DataSourceInfo]
    current: str | None
