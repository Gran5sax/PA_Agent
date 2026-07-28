"""GET /api/records, /api/records/{id} — history list + detail replay."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["records"])


@router.get("/api/records")
async def list_records() -> dict:
    from pa_agent.records.analysis_history import list_record_paths, load_record

    items = []
    for path in list_record_paths():
        rec = load_record(path)
        if rec is None:
            continue
        items.append(
            {
                "id": path.stem,
                "filename": path.name,
                "symbol": rec.meta.symbol,
                "timeframe": rec.meta.timeframe,
                "timestamp": rec.meta.timestamp_local_iso,
                "has_decision": bool(rec.stage2_decision),
            }
        )
    return {"records": items}


@router.get("/api/records/{record_id}")
async def get_record(record_id: str) -> dict:
    from pa_agent.records.analysis_history import list_record_paths, load_record

    for path in list_record_paths():
        if path.stem == record_id:
            rec = load_record(path)
            if rec is None:
                raise HTTPException(status_code=422, detail="record unreadable")
            return rec.model_dump()
    raise HTTPException(status_code=404, detail="record not found")
