import { useAnalysisStore } from '../../store/analysisStore'
import type { Decision } from '../../api/types'

/** Non-blocking order-opportunity toast (driven by store.orderAlert). */
export function OrderAlert() {
  const orderAlert = useAnalysisStore((s) => s.orderAlert)
  const clear = useAnalysisStore((s) => s.clearOrderAlert)
  if (!orderAlert) return null
  const d = orderAlert as unknown as Decision
  return (
    <div className="order-alert-overlay" onClick={clear}>
      <div className="order-alert" onClick={(e) => e.stopPropagation()}>
        <div className="oa-title">🔔 下单机会</div>
        <div className="oa-row">
          {d.order_type} · {d.order_direction}
        </div>
        <div className="oa-row">
          入场 <b>{d.entry_price}</b> / 止损 <b className="down">{d.stop_loss_price}</b> / 止盈{' '}
          <b className="up">{d.take_profit_price}</b>
        </div>
        <div className="oa-conf">交易置信度 {d.trade_confidence}</div>
        <button onClick={clear}>知道了</button>
      </div>
    </div>
  )
}
