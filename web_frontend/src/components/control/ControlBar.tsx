import type { DataSourceInfo } from '../../api/types'

interface Props {
  sources: DataSourceInfo[]
  symbols: string[]
  timeframes: string[]
  source: string
  symbol: string
  timeframe: string
  barCount: number
  analyzing: boolean
  autoRefresh: boolean
  onSource: (v: string) => void
  onSymbol: (v: string) => void
  onTimeframe: (v: string) => void
  onBarCount: (v: number) => void
  onFetch: () => void
  onAnalyze: () => void
  onCancel: () => void
  onOpenSettings: () => void
  onAutoRefresh: (v: boolean) => void
  loading: boolean
}

export function ControlBar(p: Props) {
  return (
    <div className="control-bar">
      <label>
        数据源
        <select value={p.source} onChange={(e) => p.onSource(e.target.value)}>
          {p.sources.map((s) => (
            <option key={s.kind} value={s.kind}>
              {s.label}
              {s.primary ? ' · 主' : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        品种
        <input
          list="symbols"
          value={p.symbol}
          onChange={(e) => p.onSymbol(e.target.value)}
        />
        <datalist id="symbols">
          {p.symbols.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <label>
        周期
        <select value={p.timeframe} onChange={(e) => p.onTimeframe(e.target.value)}>
          {p.timeframes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        根数
        <input
          type="number"
          min={2}
          max={5000}
          value={p.barCount}
          onChange={(e) => p.onBarCount(Number(e.target.value))}
        />
      </label>
      <button onClick={p.onFetch} disabled={p.loading || p.analyzing}>
        {p.loading ? '加载中…' : '获取数据'}
      </button>
      <button className="primary" onClick={p.onAnalyze} disabled={p.analyzing}>
        {p.analyzing ? '分析中…' : '提交分析'}
      </button>
      {p.analyzing && <button onClick={p.onCancel}>取消</button>}
      <label className="toggle">
        <input
          type="checkbox"
          checked={p.autoRefresh}
          onChange={(e) => p.onAutoRefresh(e.target.checked)}
        />
        实时
      </label>
      <button className="ghost" onClick={p.onOpenSettings} title="设置">
        ⚙ 设置
      </button>
    </div>
  )
}
