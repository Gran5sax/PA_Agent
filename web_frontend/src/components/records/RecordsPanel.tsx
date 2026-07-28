import { useState } from 'react'
import { api } from '../../api/client'
import { useAnalysisStore } from '../../store/analysisStore'
import type { RecordSummary } from '../../api/types'

/** History list + decision replay. Loading a record pushes it into the store so
 * DecisionPanel / DecisionTree / DiagnosisSummary re-render with that record. */
export function RecordsPanel() {
  const [items, setItems] = useState<RecordSummary[]>([])
  const [open, setOpen] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const setRecord = useAnalysisStore((s) => s.setRecord)
  const setPhase = useAnalysisStore((s) => s.setPhase)

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
      const rec = await api.record(id)
      setRecord(rec)
      setPhase('done')
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
