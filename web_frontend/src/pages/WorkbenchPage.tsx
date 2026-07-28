import { useEffect, useState } from 'react'
import { ControlBar } from '../components/control/ControlBar'
import { KlineChart } from '../components/chart/KlineChart'
import { StreamPanel } from '../components/stream/StreamPanel'
import { FlowBar } from '../components/stream/FlowBar'
import { DecisionPanel } from '../components/decision/DecisionPanel'
import { DiagnosisSummary } from '../components/decision/DiagnosisSummary'
import { DecisionTree } from '../components/decision/DecisionTree'
import { OrderAlert } from '../components/decision/OrderAlert'
import { FreeChat } from '../components/chat/FreeChat'
import { RecordsPanel } from '../components/records/RecordsPanel'
import { SettingsDialog } from '../components/settings/SettingsDialog'
import { useKline } from '../hooks/useKline'
import { useAnalysisStream } from '../hooks/useAnalysisStream'
import { useAnalysisStore } from '../store/analysisStore'
import { api } from '../api/client'
import type { AnalysisRecord, DataSourceInfo } from '../api/types'

const FALLBACK_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d']

export function WorkbenchPage() {
  const [sources, setSources] = useState<DataSourceInfo[]>([])
  const [source, setSource] = useState('eastmoney')
  const [symbol, setSymbol] = useState('000001')
  const [timeframe, setTimeframe] = useState('1d')
  const [barCount, setBarCount] = useState(100)
  const [symbols, setSymbols] = useState<string[]>([])
  const [timeframes, setTimeframes] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { data, loading, error, fetchKline, autoRefresh, setAutoRefresh } = useKline()
  const { submit, cancel } = useAnalysisStream()
  const phase = useAnalysisStore((s) => s.phase)
  const record = useAnalysisStore((s) => s.record) as AnalysisRecord | null

  const stage2 = record?.stage2_decision
  const decision = stage2?.decision ?? null
  const summary = stage2?.diagnosis_summary ?? null

  useEffect(() => {
    api
      .dataSources()
      .then((r) => {
        setSources(r.sources)
        const primary = r.sources.find((s) => s.primary) ?? r.sources[0]
        if (primary) {
          setSource(primary.kind)
          setSymbol(primary.symbol)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const info = sources.find((s) => s.kind === source)
    if (info) setSymbol(info.symbol)
    api.symbols(source).then(setSymbols).catch(() => {})
    api.timeframes(source).then(setTimeframes).catch(() => {})
  }, [source, sources])

  return (
    <div className="workbench">
      <ControlBar
        sources={sources}
        symbols={symbols}
        timeframes={timeframes.length ? timeframes : FALLBACK_TIMEFRAMES}
        source={source}
        symbol={symbol}
        timeframe={timeframe}
        barCount={barCount}
        onSource={setSource}
        onSymbol={setSymbol}
        onTimeframe={setTimeframe}
        onBarCount={setBarCount}
        onFetch={() => fetchKline(source, symbol, timeframe, barCount)}
        onAnalyze={() => submit({ source, symbol, timeframe, barCount })}
        onCancel={cancel}
        onOpenSettings={() => setSettingsOpen(true)}
        onAutoRefresh={setAutoRefresh}
        autoRefresh={autoRefresh}
        analyzing={phase === 'running'}
        loading={loading}
      />
      {error && <div className="error-banner">数据获取失败：{error}</div>}
      <div className="main-area">
        <div className="chart-pane">
          <KlineChart data={data} decision={decision} />
        </div>
        <aside className="side-pane">
          <FlowBar />
          <DiagnosisSummary summary={summary} />
          <DecisionPanel decision={decision} />
          <DecisionTree stage2={stage2 ?? null} />
          <StreamPanel />
          <FreeChat enabled={!!record} />
          <RecordsPanel />
          {data && (
            <div className="meta">
              {data.symbol} · {data.timeframe} · {data.bars.length} 根已收盘
              {data.forming_bar ? ' · 含形成中 K 线' : ''}
            </div>
          )}
        </aside>
      </div>
      <OrderAlert />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
