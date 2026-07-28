"""WS /ws/chat — post-analysis free-chat (FreeChatSession bridge).

Client → server: ``{"type":"start","session_id"}`` then repeated
``{"type":"send","text"}`` / ``{"type":"cancel","session_id"}``.
Server replies per turn with ``reasoning_chunk`` / ``content_chunk`` /
``turn_done`` / ``error``. Requires a completed analysis first (the bridge
anchors the chat to the last AnalysisRecord).
"""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["chat"])


@router.websocket("/ws/chat")
async def ws_chat(websocket: WebSocket) -> None:
    await websocket.accept()
    bridge = websocket.app.state.bridge
    try:
        while True:
            msg = await websocket.receive_json()
            if isinstance(msg, dict) and msg.get("type") == "start":
                await bridge.run_chat(websocket, msg)
    except WebSocketDisconnect:
        pass
