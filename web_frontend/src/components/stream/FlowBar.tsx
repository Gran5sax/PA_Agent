import { useAnalysisStore } from '../../store/analysisStore'

const STEPS = ['数据', '快照', '诊断', '决策', '追问'] as const

export function FlowBar() {
  const { lifecycle, phase } = useAnalysisStore()
  const has = (e: string) => lifecycle.includes(e)

  let active = -1
  if (phase !== 'idle') active = 0
  if (has('Stage1Started')) active = 2
  if (has('Stage2Started')) active = 3
  if (has('Stage2Done') || has('RecordSaved')) active = 4

  return (
    <div className="flow-bar">
      {STEPS.map((s, i) => {
        const state = i < active ? 'done' : i === active ? 'active' : 'idle'
        return (
          <div key={s} className={`flow-step ${state}`}>
            <span className="dot" />
            {s}
          </div>
        )
      })}
    </div>
  )
}
