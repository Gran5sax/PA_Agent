import type { DiagnosisSummary } from '../../api/types'

interface Props {
  summary: DiagnosisSummary | null
}

export function DiagnosisSummary({ summary }: Props) {
  if (!summary) return null
  const dirClass =
    summary.direction === 'bullish'
      ? 'up'
      : summary.direction === 'bearish'
        ? 'down'
        : 'idle'
  return (
    <div className="diag-summary">
      <span className="chip">周期：{summary.cycle_position}</span>
      <span className={`chip ${dirClass}`}>{summary.direction}</span>
      {summary.key_signals.slice(0, 4).map((s, i) => (
        <span key={i} className="chip muted">
          {s}
        </span>
      ))}
    </div>
  )
}
