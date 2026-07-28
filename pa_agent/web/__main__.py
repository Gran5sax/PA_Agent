"""Entry point: ``python -m pa_agent.web``

Starts the FastAPI server (uvicorn) bound to 127.0.0.1 and opens the default
browser. Coexists with the PyQt6 GUI entry point (``python -m pa_agent.main``).
"""
from __future__ import annotations

import argparse
import socket
import threading
import webbrowser


def _find_free_port(preferred: int, host: str = "127.0.0.1", tries: int = 20) -> int:
    port = preferred
    for _ in range(tries):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind((host, port))
                return port
        except OSError:
            port += 1
    return port


def main() -> int:
    parser = argparse.ArgumentParser(description="PA Agent web server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument(
        "--dev",
        action="store_true",
        help="allow CORS for the Vite dev server; do not require built SPA",
    )
    args = parser.parse_args()

    import uvicorn

    port = _find_free_port(args.port, args.host)
    url = f"http://{args.host}:{port}"

    if not args.no_browser:
        # Delay until uvicorn is likely listening.
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    uvicorn.run(
        "pa_agent.web.app:create_app",
        factory=True,
        host=args.host,
        port=port,
        reload=False,
        log_level="info",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
