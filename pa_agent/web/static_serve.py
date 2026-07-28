"""Serve the built React SPA and fall back to index.html for client-side routing.

In production, ``web_frontend/`` is built (``npm run build``) into
``pa_agent/web/static_dist/``. In dev mode the dist is absent — the Vite dev
server (5173) serves the frontend and proxies ``/api`` + ``/ws`` back here.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

STATIC_DIST_DIR = Path(__file__).resolve().parent / "static_dist"


def mount_spa(app: FastAPI) -> bool:
    """Mount SPA static assets if the build output exists.

    Returns True when mounted. Must be called AFTER all ``/api`` and ``/ws``
    routes are registered, since it installs a catch-all fallback.
    """
    index_html = STATIC_DIST_DIR / "index.html"
    if not index_html.exists():
        return False

    assets_dir = STATIC_DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="spa-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        # API / WS / docs paths are never part of the SPA — 404 them cleanly.
        if full_path.startswith(("api/", "ws/", "docs", "openapi", "redoc")):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = STATIC_DIST_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index_html)

    return True
