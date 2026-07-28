"""Shared data-source state for the web server.

The data source is a single shared, stateful instance on ``AppContext``. Both the
REST kline endpoints and the analysis bridge switch it via these helpers so they
agree on the active source / subscription (single-user local server).
"""
from __future__ import annotations

import logging
import threading

from pa_agent.app_context import AppContext

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_state: dict[str, str | None] = {"kind": None, "symbol": None, "timeframe": None}


def current_kind() -> str | None:
    return _state["kind"]


def ensure_data_source(ctx: AppContext, kind: str) -> None:
    """Switch ``ctx.data_source`` to *kind* if different; (re)connects."""
    from pa_agent.data.factory import create_data_source, normalize_data_source_kind

    kind = normalize_data_source_kind(kind)
    with _lock:
        if _state["kind"] == kind and ctx.data_source is not None:
            return
        old = ctx.data_source
        try:
            if old is not None:
                old.disconnect()
        except Exception:  # noqa: BLE001
            pass
        ds = create_data_source(kind)
        try:
            ds.connect()
        except Exception as exc:  # noqa: BLE001
            logger.warning("data source %s connect failed: %s", kind, exc)
        ctx.data_source = ds
        _state["kind"] = kind
        _state["symbol"] = None
        _state["timeframe"] = None


def ensure_subscribed(ctx: AppContext, symbol: str, timeframe: str) -> None:
    """Subscribe the active data source to *symbol*/*timeframe* if changed."""
    with _lock:
        if _state["symbol"] == symbol and _state["timeframe"] == timeframe:
            return
        ds = ctx.data_source
        try:
            ds.unsubscribe()
        except Exception:  # noqa: BLE001
            pass
        ds.subscribe(symbol, timeframe)
        _state["symbol"] = symbol
        _state["timeframe"] = timeframe
