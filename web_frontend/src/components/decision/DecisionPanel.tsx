import type { Decision } from '../../api/types'

interface Props {
  decision: Decision | null
}

function dirClass(d: Decision): string {
  if (d.order_type === '不下单') return 'idle'
  return d.order_direction === '做多' ? 'up' : d.order_direction === '做空' ? 'down' : 'idle'
}

export function DecisionPanel({ decision }: Props) {
  if (!decision) {
    return <div className="muted placeholder">提交分析后显示交易决策</div>
  }
  const noOrder = decision.order_type === '不下单'
  const rr =
    decision.entry_price != null &&
    decision.stop_loss_price != null &&
    decision.take_profit_price != null
      ? (
          Math.abs(decision.take_profit_price - decision.entry_price) /
          Math.abs(decision.entry_price - decision.stop_loss_price)
        ).toFixed(2)
      : null

  return (
    <div className="decision-panel">
      <div className="decision-head">
        <span className={`badge ${dirClass(decision)}`}>
          {decision.order_type}
          {!noOrder && decision.order_direction ? ` · ${decision.order_direction}` : ''}
        </span>
        <span className="conf">交易置信度 {decision.trade_confidence}</span>
        <span className="conf">诊断置信度 {decision.diagnosis_confidence}</span>
      </div>
      {!noOrder && (
        <table className="prices">
          <tbody>
            <tr>
              <th>入场</th>
              <td>{decision.entry_price}</td>
              <th>止损</th>
              <td className="down">{decision.stop_loss_price}</td>
            </tr>
            <tr>
              <th>止盈1</th>
              <td className="up">{decision.take_profit_price}</td>
              <th>止盈2</th>
              <td className="up">{decision.take_profit_price_2 ?? '—'}</td>
            </tr>
            <tr>
              <th>盈亏比</th>
              <td>{rr ?? '—'}</td>
              <th>预估胜率</th>
              <td>{decision.estimated_win_rate != null ? `${decision.estimated_win_rate}%` : '—'}</td>
            </tr>
          </tbody>
        </table>
      )}
      <div className="reasoning">{decision.reasoning}</div>
      {decision.watch_points.length > 0 && (
        <div className="watch">观察点：{decision.watch_points.join('；')}</div>
      )}
      {decision.invalidation_condition && (
        <div className="watch">失效条件：{decision.invalidation_condition}</div>
      )}
    </div>
  )
}
