"""In-memory registry of active analysis/chat sessions → CancelToken."""
from __future__ import annotations

import threading

from pa_agent.util.threading import CancelToken


class SessionRegistry:
    """Maps a session/analysis id → CancelToken so cancel requests target a run.

    Each analysis/chat run registers a fresh token; the WebSocket bridge polls
    it (cooperative cancel) and releases it when the run finishes.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tokens: dict[str, CancelToken] = {}

    def register(self, sid: str) -> CancelToken:
        token = CancelToken()
        with self._lock:
            self._tokens[sid] = token
        return token

    def cancel(self, sid: str) -> bool:
        with self._lock:
            token = self._tokens.get(sid)
        if token is None:
            return False
        token.set()
        return True

    def release(self, sid: str) -> None:
        with self._lock:
            self._tokens.pop(sid, None)
