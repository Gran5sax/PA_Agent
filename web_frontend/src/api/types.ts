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
  branch?: string
  skipped?: boolean
  bar_from?: number
  bar_to?: number
  next_node?: string
  overridden_by_ai?: boolean
  program_answer?: string
  program_branch?: string
  override_reason?: string
}

/** Stage-1 gate trace item (same shape as TraceItem; kept separate for clarity). */
export type GateTraceItem = TraceItem

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

export interface StageResponse {
  id?: string
  model?: string
  content?: string
  reasoning_content?: string
  usage?: Record<string, unknown>
  latency_ms?: number
}

export interface ChatMessage {
  role: string
  content: string
}

export interface Stage1Diagnosis {
  gate_trace?: GateTraceItem[]
  gate_result?: string
  [k: string]: unknown
}

export interface AnalysisRecord {
  meta: Record<string, unknown>
  kline_data?: KlineBar[]
  htf_text?: string
  stage1_messages?: ChatMessage[]
  stage1_response?: StageResponse
  stage1_diagnosis?: Stage1Diagnosis
  stage2_messages?: ChatMessage[]
  stage2_response?: StageResponse
  stage2_decision?: Stage2Record
  strategy_files_used?: string[]
  experience_loaded?: Record<string, unknown>[]
  usage_total?: Record<string, unknown>
  exception?: Record<string, unknown> | null
}
export interface HealthResponse {
  status: string
  provider_configured: boolean
  data_source: string
  symbol: string
  timeframe: string
}

// ── Static decision tree (mirror ai/decision_tree.py:load_decision_tree) ──

export interface DecisionTreeNode {
  id: string
  question: string
  section_id?: string
  section_title?: string
  branch_yes?: string
  branch_no?: string
}

export interface DecisionTreeSection {
  id: string
  title: string
  nodes: { id: string; question: string }[]
}

export interface DecisionTreeStatic {
  version: number
  source: string
  sections: DecisionTreeSection[]
  node_index: Record<string, DecisionTreeNode>
}

// ── Money flow (mirror eastmoney_extended._FFLOW_DAILY_NAMES) ──

export interface MoneyFlowItem {
  date: string // YYYY-MM-DD
  main_net: number // 主力净流入（元）
  main_net_pct?: number
  super_large_net?: number
  large_net?: number
  medium_net?: number
  small_net?: number
}

export interface MoneyFlowResponse {
  symbol: string
  items: MoneyFlowItem[]
}
