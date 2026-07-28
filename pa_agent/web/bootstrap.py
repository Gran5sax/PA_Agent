"""Web-server bootstrap: ``AppContext`` assembled with Qt-free shims."""
from __future__ import annotations

from pa_agent.app_context import AppContext
from pa_agent.web.shims import NullEventBus, WebTokenLedger


def web_bootstrap() -> AppContext:
    """Bootstrap an ``AppContext`` without PyQt6.

    Injects Qt-free shims for ``EventBus`` and ``SessionTokenLedger`` so the web
    server runs headless. Everything else (settings, data source, AI client,
    prompt assembler, router, validator, pending writer, experience reader) is
    reused verbatim from ``AppContext.bootstrap()``.
    """
    # Pre-read settings only to size the ledger (context window / warn threshold).
    # AppContext.bootstrap() reloads settings itself; the duplicate read is cheap.
    from pa_agent.config.paths import SETTINGS_JSON_PATH
    from pa_agent.config.settings import load_settings

    settings = load_settings(SETTINGS_JSON_PATH)

    return AppContext.bootstrap(
        event_bus=NullEventBus(),
        ledger=WebTokenLedger(
            context_window=settings.provider.context_window,
            warn_pct=settings.general.context_warning_threshold_pct,
        ),
    )
