// TypeScript mirrors of the backend Pydantic models (pa_agent/web/schemas.py and
// records/schema.py). Single source of truth is the backend; update both together.

export interface KlineBar {
  seq: number
  ts_open: number // ms UTC
  open: number
  high: number
  low: number
  close: number
  volume: number
  amount: number
  pct_chg: number | null
  closed: boolean
}

export interface KlineResponse {
  symbol: string
  timeframe: string
  bars: KlineBar[] // newest-first; bars[0] = K1 (newest closed)
  ema20: number[] // aligned to bars (NaN during warm-up)
  atr14: number[]
  forming_bar: KlineBar | null
  snapshot_ts_local_ms: number
}

export interface SymbolsResponse {
  symbols: string[]
}
export interface TimeframesResponse {
  timeframes: string[]
}
export interface DataSourceInfo {
  kind: string
  label: string
  symbol: string // default symbol for this kind
  primary: boolean
}

export interface RecordSummary {
  id: string
  filename: string
  symbol: string
  timeframe: string
  timestamp: string
  has_decision: boolean
}
export interface DataSourcesResponse {
  sources: DataSourceInfo[]
  current: string | null
}

// ── Analysis result types (mirror ai/prompts/schemas.py) ──

export interface Decision {
  order_type: string // 限价单 | 突破单 | 市价单 | 不下单
  order_direction: string | null // 做多 | 做空 | null
  entry_price: number | null
  take_profit_price: number | null
  take_profit_price_2: number | null
  stop_loss_price: number | null
  reasoning: string
  diagnosis_confidence: number
  diagnosis_confidence_reasoning: string
  trade_confidence: number
  trade_confidence_reasoning: string
  estimated_win_rate: number | null
  estimated_win_rate_reasoning: string | null
  watch_points: string[]
  key_factors: string[]
  risk_assessment: string
  invalidation_condition: string | null
}

export interface DiagnosisSummary {
  cycle_position: string
  direction: string
  key_signals: string[]
}

export interface TraceItem {
  node_id?: string
  question?: string
  answer?: string
  reason?: string
  bar_range?: string
  section?: string
}

export interface Terminal {
  node_id?: string
  outcome?: string
  label?: string
}

export interface Stage2Record {
  decision: Decision
  diagnosis_summary: DiagnosisSummary
  decision_trace: TraceItem[]
  terminal: Terminal
  gate_shortcircuited?: boolean
  next_bar_prediction?: Record<string, unknown> | null
  next_cycle_prediction?: Record<string, unknown> | null
}

export interface AnalysisRecord {
  meta: Record<string, unknown>
  stage1_diagnosis?: Record<string, unknown>
  stage2_decision?: Stage2Record
  strategy_files_used?: string[]
}
export interface HealthResponse {
  status: string
  provider_configured: boolean
  data_source: string
  symbol: string
  timeframe: string
}
