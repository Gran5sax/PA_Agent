"""FastAPI app factory + lifespan.

The lifespan bootstraps an ``AppContext`` (Qt-free), an ``AnalysisBridge`` (runs
the synchronous orchestrator on a thread pool) and a ``SessionRegistry`` (cancel
tokens). Route handlers read these via ``request.app.state`` / ``get_ctx``.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pa_agent.web.api import analysis, chat, decision_tree, health, kline, records, settings as settings_api
from pa_agent.web.bootstrap import web_bootstrap
from pa_agent.web.bridge import AnalysisBridge
from pa_agent.web.sessions import SessionRegistry
from pa_agent.web.static_serve import mount_spa

logger = logging.getLogger("pa_agent.web")


def create_app(*, dev: bool = False) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        ctx = web_bootstrap()
        app.state.ctx = ctx
        app.state.sessions = SessionRegistry()
        executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="pa-analysis")
        app.state.bridge = AnalysisBridge(ctx, executor, app.state.sessions)
        logger.info(
            "Web AppContext ready (data_source=%s)",
            type(ctx.data_source).__name__ if ctx.data_source is not None else "none",
        )
        yield
        executor.shutdown(wait=False, cancel_futures=True)
        try:
            if ctx.data_source is not None:
                ctx.data_source.disconnect()
        except Exception:  # noqa: BLE001
            pass

    app = FastAPI(title="PA Agent Web", lifespan=lifespan)

    if dev:
        # Allow the Vite dev server (5173) to call the API directly during dev.
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(health.router)
    app.include_router(kline.router)
    app.include_router(analysis.router)
    app.include_router(chat.router)
    app.include_router(settings_api.router)
    app.include_router(records.router)
    app.include_router(decision_tree.router)

    # SPA catch-all must be mounted last (after /api and /ws routes).
    mount_spa(app)

    return app
