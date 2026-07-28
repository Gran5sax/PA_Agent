"""Bridge: run the synchronous two-stage orchestrator on a worker thread and
forward its 8 streaming callbacks to a WebSocket via an asyncio.Queue.

The orchestrator (``orchestrator/two_stage.py:submit``) is synchronous and
blocking (OpenAI SDK stream iteration). It runs in a ``ThreadPoolExecutor``; each
callback (invoked on the worker thread) marshals a message onto the event-loop
thread's queue via ``loop.call_soon_threadsafe``, and the WS coroutine drains it.

Cancel is cooperative: each ``analysis_id`` gets a ``CancelToken``;
``POST /api/analyze/cancel`` sets it and ``submit()`` exits at the next chunk
boundary (``deepseek_client.py`` polls the token every chunk).
"""
from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable
from uuid import uuid4

from fastapi import WebSocketDisconnect

from pa_agent.app_context import AppContext
from pa_agent.web.sessions import SessionRegistry

logger = logging.getLogger(__name__)

# Mirror of gui/order_opportunity.has_order_opportunity — inlined here to keep the
# web backend free of the gui package (which imports PyQt6 at import time).
_ORDER_TYPES = ("限价单", "突破单", "市价单")
_WARMUP_BARS = 30


def _has_order_opportunity(decision: Any, threshold: int) -> bool:
    if not isinstance(decision, dict):
        return False
    if decision.get("order_type") not in _ORDER_TYPES:
        return False
    tc = decision.get("trade_confidence")
    try:
        tc = int(tc) if tc is not None else None
    except (TypeError, ValueError):
        tc = None
    if tc is None:
        return False
    return tc >= threshold


class AnalysisBridge:
    """Drives TwoStageOrchestrator.submit() and streams its callbacks over WS."""

    def __init__(
        self,
        ctx: AppContext,
        executor: ThreadPoolExecutor,
        sessions: SessionRegistry,
        *,
        orchestrator_factory: Callable[[], Any] | None = None,
    ) -> None:
        self._ctx = ctx
        self._executor = executor
        self._sessions = sessions
        self._orch_factory = orchestrator_factory or self._default_orchestrator
        self._last_record: Any = None  # last completed AnalysisRecord (anchors free-chat)

    def cancel(self, analysis_id: str) -> bool:
        return self._sessions.cancel(analysis_id)

    async def run_chat(self, ws: Any, start_msg: dict) -> None:
        """Post-analysis free-chat: anchor a FreeChatSession to the last completed
        record, then loop over send/cancel turns, streaming each reply."""
        if self._last_record is None:
            await ws.send_json({"type": "error", "message": "请先完成一次两阶段分析再追问"})
            return
        from pa_agent.orchestrator.free_chat import FreeChatSession

        session = FreeChatSession(
            base_record=self._last_record,
            client=self._ctx.client,
            assembler=self._ctx.assembler,
            pending_writer=self._ctx.pending_writer,
            ledger=self._ctx.ledger,
            settings=self._ctx.settings,
        )
        session_id = start_msg.get("session_id") or uuid4().hex
        await ws.send_json({"type": "chat_ready", "session_id": session_id})

        loop = asyncio.get_running_loop()
        try:
            while True:
                incoming = await ws.receive_json()
                if not isinstance(incoming, dict):
                    continue
                if incoming.get("type") == "send":
                    await self._run_chat_turn(
                        ws, session, session_id, incoming.get("text", ""), loop
                    )
                elif incoming.get("type") == "cancel":
                    self._sessions.cancel(session_id)
        except WebSocketDisconnect:
            pass

    async def _run_chat_turn(
        self,
        ws: Any,
        session: Any,
        session_id: str,
        text: str,
        loop: asyncio.AbstractEventLoop,
    ) -> None:
        token = self._sessions.register(session_id)
        queue: asyncio.Queue = asyncio.Queue()
        closed = {"v": False}

        def _emit(msg: dict) -> None:
            if closed["v"]:
                return
            try:
                loop.call_soon_threadsafe(queue.put_nowait, msg)
            except RuntimeError:
                pass

        def _work() -> None:
            try:
                session.send(
                    text,
                    token,
                    on_reasoning_token=lambda c: _emit({"type": "reasoning_chunk", "text": c}),
                    on_content_token=lambda c: _emit({"type": "content_chunk", "text": c}),
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception("chat turn failed")
                _emit({"type": "error", "message": f"{type(exc).__name__}: {exc}"})
            finally:
                _emit({"type": "_done"})

        loop.run_in_executor(self._executor, _work)
        try:
            while True:
                msg = await queue.get()
                if msg.get("type") == "_done":
                    await ws.send_json({"type": "turn_done"})
                    break
                await ws.send_json(msg)
        finally:
            closed["v"] = True
            self._sessions.release(session_id)

    def _default_orchestrator(self) -> Any:
        from pa_agent.orchestrator.two_stage import TwoStageOrchestrator

        c = self._ctx
        required = ("client", "assembler", "router", "validator", "pending_writer", "exp_reader")
        if any(getattr(c, k, None) is None for k in required):
            return None
        return TwoStageOrchestrator(
            client=c.client,
            assembler=c.assembler,
            router=c.router,
            validator=c.validator,
            pending_writer=c.pending_writer,
            exp_reader=c.exp_reader,
            settings=c.settings,
        )

    def _build_frame(self, start_msg: dict) -> Any:
        from pa_agent.data.snapshot import build_analysis_frame
        from pa_agent.util.timefmt import now_local_ms
        from pa_agent.web import data_source as ds

        symbol = start_msg.get("symbol", "")
        timeframe = start_msg.get("timeframe", "")
        n = int(start_msg.get("bar_count", 100))
        source = start_msg.get("source", "eastmoney")
        ds.ensure_data_source(self._ctx, source)
        ds.ensure_subscribed(self._ctx, symbol, timeframe)
        bars = self._ctx.data_source.latest_snapshot(n + _WARMUP_BARS)
        return build_analysis_frame(bars, n, symbol, timeframe, now_ms=now_local_ms())

    async def run_analysis(self, ws: Any, start_msg: dict) -> None:
        analysis_id = start_msg.get("analysis_id") or uuid4().hex
        token = self._sessions.register(analysis_id)
        await ws.send_json({"type": "analysis_started", "analysis_id": analysis_id})

        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()
        closed = {"v": False}

        def _emit(msg: dict) -> None:
            if closed["v"]:
                return
            try:
                loop.call_soon_threadsafe(queue.put_nowait, msg)
            except RuntimeError:  # loop already closed
                pass

        def on_event(ev: Any) -> None:
            _emit({"type": "lifecycle", "event": getattr(ev, "name", str(ev))})

        def on_stage1_reasoning(c: str) -> None:
            _emit({"type": "reasoning_chunk", "stage": "stage1", "text": c})

        def on_stage1_content(c: str) -> None:
            _emit({"type": "content_chunk", "stage": "stage1", "text": c})

        def on_stage2_reasoning(c: str) -> None:
            _emit({"type": "reasoning_chunk", "stage": "stage2", "text": c})

        def on_stage2_content(c: str) -> None:
            _emit({"type": "content_chunk", "stage": "stage2", "text": c})

        def on_stage_prompt(stage: str, system: str, user: str) -> None:
            _emit({"type": "stage_prompt", "stage": stage, "system": system, "user": user})

        def on_stage2_files(files: Any) -> None:
            _emit({"type": "stage2_files", "files": list(files)})

        def _work() -> None:
            try:
                orch = self._orch_factory()
                if orch is None:
                    _emit({"type": "error", "message": "orchestrator unavailable (ctx incomplete)"})
                    return
                frame = self._build_frame(start_msg)
                if frame is None:
                    _emit({"type": "error", "message": "insufficient closed bars for requested n"})
                    return
                previous_record = None
                incremental_new_bar_count = None
                if start_msg.get("incremental"):
                    from pa_agent.records.analysis_history import (
                        compute_incremental_bar_delta,
                        find_latest_successful_record,
                        invalidate_latest_record_cache,
                    )

                    previous_record = find_latest_successful_record(
                        symbol=start_msg.get("symbol", ""),
                        timeframe=start_msg.get("timeframe", ""),
                    )
                    if previous_record is not None:
                        delta = compute_incremental_bar_delta(frame, previous_record)
                        incremental_new_bar_count = delta.new_count if delta else None
                        invalidate_latest_record_cache()
                rec = orch.submit(
                    frame,
                    token,
                    on_event,
                    on_stage1_reasoning=on_stage1_reasoning,
                    on_stage1_content=on_stage1_content,
                    on_stage2_reasoning=on_stage2_reasoning,
                    on_stage2_content=on_stage2_content,
                    on_stage_prompt=on_stage_prompt,
                    on_stage2_files=on_stage2_files,
                    previous_record=previous_record,
                    incremental_new_bar_count=incremental_new_bar_count,
                )
                self._last_record = rec
                _emit({"type": "record_ready", "record": rec.model_dump()})
                decision = (rec.stage2_decision or {}).get("decision", {})
                threshold = self._ctx.settings.general.decision_confidence_threshold
                if _has_order_opportunity(decision, threshold):
                    _emit({"type": "order_opportunity", "decision": decision})
            except Exception as exc:  # noqa: BLE001
                logger.exception("analysis run failed")
                _emit({"type": "error", "message": f"{type(exc).__name__}: {exc}"})
            finally:
                _emit({"type": "_done"})

        loop.run_in_executor(self._executor, _work)
        try:
            while True:
                msg = await queue.get()
                if msg.get("type") == "_done":
                    break
                await ws.send_json(msg)
        finally:
            closed["v"] = True
            self._sessions.release(analysis_id)
