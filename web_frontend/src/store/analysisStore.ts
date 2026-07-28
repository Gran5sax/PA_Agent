import { create } from 'zustand'

export type Stage = 'stage1' | 'stage2'
export type Phase = 'idle' | 'running' | 'done' | 'error' | 'cancelled'

interface StagePrompt {
  system: string
  user: string
}

interface AnalysisState {
  phase: Phase
  analysisId: string | null
  reasoning: Record<Stage, string>
  content: Record<Stage, string>
  stagePrompt: Record<Stage, StagePrompt | null>
  stage2Files: string[]
  lifecycle: string[]
  record: Record<string, unknown> | null
  orderAlert: Record<string, unknown> | null
  error: string | null

  reset: () => void
  start: (id: string) => void
  appendChunk: (stage: Stage, kind: 'reasoning' | 'content', text: string) => void
  setStagePrompt: (stage: Stage, p: StagePrompt) => void
  setStage2Files: (f: string[]) => void
  pushLifecycle: (event: string) => void
  setRecord: (r: Record<string, unknown>) => void
  setOrderAlert: (d: Record<string, unknown>) => void
  clearOrderAlert: () => void
  setError: (message: string) => void
  setPhase: (p: Phase) => void
}

const emptyStr = (): Record<Stage, string> => ({ stage1: '', stage2: '' })
const emptyPrompt = (): Record<Stage, StagePrompt | null> => ({ stage1: null, stage2: null })

const LIFECYCLE_TO_PHASE: Record<string, Phase> = {
  Stage1Started: 'running',
  Stage2Started: 'running',
  Stage1Done: 'running',
  Stage2Done: 'running',
  RecordSaved: 'done',
  Cancelled: 'cancelled',
  InsufficientData: 'error',
  Stage1Failed: 'error',
  Stage2Failed: 'error',
}

const fresh = () => ({
  reasoning: emptyStr(),
  content: emptyStr(),
  stagePrompt: emptyPrompt(),
  stage2Files: [] as string[],
  lifecycle: [] as string[],
  record: null,
  orderAlert: null,
  error: null,
})

export const useAnalysisStore = create<AnalysisState>((set) => ({
  phase: 'idle',
  analysisId: null,
  ...fresh(),

  reset: () => set({ phase: 'idle', analysisId: null, ...fresh() }),
  start: (id) => set({ phase: 'running', analysisId: id, ...fresh() }),
  appendChunk: (stage, kind, text) =>
    set((s) => {
      if (kind === 'reasoning') {
        return { reasoning: { ...s.reasoning, [stage]: s.reasoning[stage] + text } }
      }
      return { content: { ...s.content, [stage]: s.content[stage] + text } }
    }),
  setStagePrompt: (stage, p) =>
    set((s) => ({ stagePrompt: { ...s.stagePrompt, [stage]: p } })),
  setStage2Files: (f) => set({ stage2Files: f }),
  pushLifecycle: (event) =>
    set((s) => ({
      lifecycle: [...s.lifecycle, event],
      phase: LIFECYCLE_TO_PHASE[event] ?? s.phase,
    })),
  setRecord: (r) => set({ record: r }),
  setOrderAlert: (d) => set({ orderAlert: d }),
  clearOrderAlert: () => set({ orderAlert: null }),
  setError: (message) => set({ error: message, phase: 'error' }),
  setPhase: (p) => set({ phase: p }),
}))
