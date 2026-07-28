import type { Stage2Record } from '../../api/types'

interface Props {
  stage2: Stage2Record | null
}

/** Degraded decision-tree view: a compact table of the decision_trace + terminal
 * (replaces the GUI's animated cyber flowchart; M5 may enhance). */
export function DecisionTree({ stage2 }: Props) {
  if (!stage2) return null
  const trace = stage2.decision_trace ?? []
  const t = stage2.terminal
  return (
    <div className="decision-tree">
      <div className="dt-title">
        决策路径{t?.outcome ? ` → ${t.outcome}` : ''}
      </div>
      {t?.label && <div className="terminal">{t.label}</div>}
      {trace.length === 0 ? (
        <div className="muted small">（无 trace，可能 gate 短路未走决策树）</div>
      ) : (
        <table className="trace">
          <thead>
            <tr>
              <th>#</th>
              <th>节点</th>
              <th>回答</th>
              <th>理由</th>
            </tr>
          </thead>
          <tbody>
            {trace.map((item, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{item.node_id ?? '—'}</td>
                <td>{item.answer ?? '—'}</td>
                <td>{item.reason ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
