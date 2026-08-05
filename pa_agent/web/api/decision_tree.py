"""GET /api/decision-tree — static §0–§14 tree parsed from 二元决策.txt.

The tree is the single source of truth for the React decision-flow viz; it has
no per-run state, so the lru_cache in ``load_decision_tree`` makes this cheap.
"""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["decision-tree"])


@router.get("/api/decision-tree")
async def get_decision_tree() -> dict:
    from pa_agent.ai.decision_tree import load_decision_tree

    return load_decision_tree()
