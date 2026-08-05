import { useState } from 'react'
import { api } from '../../api/client'
import { useAnalysisStore } from '../../store/analysisStore'
import { computeIndicators } from '../../utils/indicators'
import type { AnalysisRecord, KlineBar, RecordSummary } from '../../api/types'

/** History list + decision replay. Loading a record pushes it into the store so
 * DecisionPanel / DecisionTree / DiagnosisSummary re-render with that record. */
export function RecordsPanel() {
  const [items, setItems] = useState<RecordSummary[]>([])
  const [open, setOpen] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const loadRecord = useAnalysisStore((s) => s.loadRecord)
  const setReplayKline = useAnalysisStore((s) => s.setReplayKline)

  const refresh = () => {
    api
      .records()
      .then((r) => setItems(r))
      .catch(() => {})
    setOpen(true)
  }

  const load = async (id: string) => {
    setLoadingId(id)
    try {
      const rec = (await api.record(id)) as unknown as AnalysisRecord
      loadRecord(rec)
      // Replay the historical K-line: record keeps OHLCV only, so recompute
      // EMA20/ATR14 client-side (mirrors snapshot.py:compute_indicators).
      const bars = (rec.kline_data ?? []) as KlineBar[]
      if (bars.length > 0) {
        const { ema20, atr14 } = computeIndicators(bars)
        setReplayKline({
          symbol: String(rec.meta?.symbol ?? ''),
          timeframe: String(rec.meta?.timeframe ?? ''),
          bars,
          ema20,
          atr14,
          forming_bar: null,
          snapshot_ts_local_ms: Number(rec.meta?.timestamp_ms ?? 0),
        })
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="records-panel">
      <div className="rp-head" onClick={refresh}>
        📂 历史记录{items.length > 0 ? `（${items.length}）` : ''} {open ? '▾' : '▸'}
      </div>
      {open && (
        <div className="rp-list">
          {items.length === 0 ? (
            <div className="muted small">暂无记录（完成分析后产生）</div>
          ) : (
            items.map((r) => (
              <div
                key={r.id}
                className="rp-item"
                onClick={() => load(r.id)}
                title={r.filename}
              >
                <div>
                  {r.symbol} · {r.timeframe}
                  {!r.has_decision && <span className="muted"> · 无决策</span>}
                </div>
                <div className="muted small">{r.timestamp}</div>
                {loadingId === r.id && <div className="muted small">加载中…</div>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
