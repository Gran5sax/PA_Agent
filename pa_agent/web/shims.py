"""Qt-free duck-type shims for the web server.

The GUI's ``EventBus`` (``util/event_bus.py``) and ``SessionTokenLedger``
(``ai/session_ledger.py``) are ``QObject`` subclasses that require a running
``QApplication``. The web server runs headless, so it injects these plain-Python
stand-ins into ``AppContext.bootstrap(event_bus=..., ledger=...)``.

Only the methods actually invoked by ``PendingWriter`` / the orchestrator need to
match — ``AppContext`` fields are typed ``Any``, so duck typing is enough.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pa_agent.ai.deepseek_client import AIUsage


class NullEventBus:
    """No-op stand-in for ``util.event_bus.EventBus``.

    ``PendingWriter`` only calls ``event_bus.emit("disk_error", {...})`` under an
    ``is not None`` guard (records/pending_writer.py:169) wrapped in try/except.
    The web server pushes real-time events through its own asyncio.Queue bridge,
    so the bus is unused here.
    """

    def emit(self, name: str, data: Any = None) -> None:
        pass


class WebTokenLedger:
    """Qt-free stand-in for ``ai.session_ledger.SessionTokenLedger``.

    Preserves the pull-mode interface (``add`` / ``breakdown`` / ``reset`` /
    ``context_used``) consumed by the orchestrator. The web bridge forwards
    breakdown snapshots over WebSocket instead of Qt signals.
    """

    def __init__(self, context_window: int = 1_000_000, warn_pct: float = 80.0) -> None:
        self._context_window = context_window
        self._warn_pct = warn_pct
        self.total_input = 0
        self.total_cached_input = 0
        self.total_output = 0

    @property
    def context_used(self) -> int:
        return self.total_input + self.total_output

    def add(self, usage: "AIUsage") -> None:
        self.total_input += getattr(usage, "prompt_tokens", 0) or 0
        self.total_cached_input += getattr(usage, "cached_prompt_tokens", 0) or 0
        self.total_output += getattr(usage, "completion_tokens", 0) or 0

    def reset(self) -> None:
        self.total_input = 0
        self.total_cached_input = 0
        self.total_output = 0

    def breakdown(self) -> dict:
        pct = self.context_used / self._context_window * 100.0 if self._context_window else 0.0
        return {
            "total_input": self.total_input,
            "total_cached_input": self.total_cached_input,
            "total_output": self.total_output,
            "context_used": self.context_used,
            "context_window": self._context_window,
            "context_pct": round(pct, 2),
        }
