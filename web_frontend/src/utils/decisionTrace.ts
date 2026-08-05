/** Pure helpers for the decision-flow viz — TS mirror of the string-only parts of
 * pa_agent/ai/decision_tree.py (no backend dependency). */
import type { GateTraceItem, Terminal, TraceItem } from '../api/types'

export type Phase = 'stage1' | 'stage2'

export interface MergedTraceItem extends TraceItem {
  phase: Phase
}

/** Merge stage-1 gate trace and stage-2 decision trace into one ordered list,
 * mirroring decision_tree.py:merge_traces (gate trace first). */
export function mergeTraces(
  gateTrace: GateTraceItem[] | undefined | null,
  decisionTrace: TraceItem[] | undefined | null,
): MergedTraceItem[] {
  const out: MergedTraceItem[] = []
  for (const it of gateTrace ?? []) out.push({ ...it, phase: 'stage1' })
  for (const it of decisionTrace ?? []) out.push({ ...it, phase: 'stage2' })
  return out
}

/** Map an answer to the branch arm it took: 是→yes, 否→no, else null. */
export function branchSide(answer?: string): 'yes' | 'no' | null {
  if (answer === '是') return 'yes'
  if (answer === '否') return 'no'
  return null
}

export function terminalOutcome(t: Terminal | undefined | null): string {
  return (t?.outcome ?? '').toString()
}

/** Hex per terminal outcome (light theme, matches Decision panel palette). */
export function terminalColor(outcome: string): string {
  switch (outcome) {
    case 'trade':
      return '#16a34a'
    case 'reject':
      return '#dc2626'
    case 'proceed':
      return '#2563eb'
    case 'wait':
    default:
      return '#6b7280'
  }
}

/** Hex per trace answer (light theme). */
export function answerColor(answer?: string): string {
  switch (answer) {
    case '是':
      return '#16a34a'
    case '否':
      return '#dc2626'
    case '中性':
      return '#6b7280'
    case '等待':
      return '#d97706'
    default:
      return '#9ca3af'
  }
}
