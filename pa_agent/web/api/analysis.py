"""WS /ws/analyze (two-stage streaming) + POST /api/analyze/cancel.

Client → server: ``{"type":"start","analysis_id","source","symbol","timeframe",
"bar_count","incremental"}``. Server streams lifecycle / stage_prompt /
reasoning_chunk / content_chunk / stage2_files / record_ready /
order_opportunity / error, then returns to wait for the next start.

Cancel is out-of-band: ``POST /api/analyze/cancel {"analysis_id"}`` sets the
run's CancelToken; submit() exits at the next chunk boundary.
"""
from __future__ import annotations

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

router = APIRouter(tags=["analysis"])


@router.websocket("/ws/analyze")
async def ws_analyze(websocket: WebSocket) -> None:
    await websocket.accept()
    bridge = websocket.app.state.bridge
    try:
        while True:
            msg = await websocket.receive_json()
            if isinstance(msg, dict) and msg.get("type") == "start":
                await bridge.run_analysis(websocket, msg)
    except WebSocketDisconnect:
        pass


class CancelRequest(BaseModel):
    analysis_id: str


@router.post("/api/analyze/cancel")
async def cancel_analysis(payload: CancelRequest, request: Request) -> dict:
    bridge = request.app.state.bridge
    ok = bridge.cancel(payload.analysis_id)
    return {"ok": ok, "analysis_id": payload.analysis_id}
