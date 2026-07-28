import { useRef, useState } from 'react'
import { openAnalyzeWs } from '../api/ws'
import { useAnalysisStore } from '../store/analysisStore'

export interface AnalysisParams {
  source: string
  symbol: string
  timeframe: string
  barCount: number
}

/**
 * Drives /ws/analyze: opens the socket on submit, sends `start`, and dispatches
 * inbound messages into the analysis store. Cancel hits POST /api/analyze/cancel.
 */
export function useAnalysisStream() {
  const wsRef = useRef<WebSocket | null>(null)
  const store = useAnalysisStore()
  const [connected, setConnected] = useState(false)

  const submit = (params: AnalysisParams) => {
    store.reset()
    const ws = openAnalyzeWs(
      (m) => {
        switch (m.type as string) {
          case 'analysis_started':
            store.start(m.analysis_id as string)
            break
          case 'lifecycle':
            store.pushLifecycle(m.event as string)
            break
          case 'reasoning_chunk':
            store.appendChunk(m.stage as 'stage1' | 'stage2', 'reasoning', m.text as string)
            break
          case 'content_chunk':
            store.appendChunk(m.stage as 'stage1' | 'stage2', 'content', m.text as string)
            break
          case 'stage_prompt':
            store.setStagePrompt(m.stage as 'stage1' | 'stage2', {
              system: m.system as string,
              user: m.user as string,
            })
            break
          case 'stage2_files':
            store.setStage2Files(m.files as string[])
            break
          case 'record_ready':
            store.setRecord(m.record as Record<string, unknown>)
            store.setPhase('done')
            break
          case 'order_opportunity':
            store.setOrderAlert(m.decision as Record<string, unknown>)
            break
          case 'error':
            store.setError(m.message as string)
            break
        }
      },
      () => setConnected(false),
    )
    ws.onopen = () => {
      setConnected(true)
      ws.send(
        JSON.stringify({
          type: 'start',
          source: params.source,
          symbol: params.symbol,
          timeframe: params.timeframe,
          bar_count: params.barCount,
          incremental: true,
        }),
      )
    }
    wsRef.current = ws
  }

  const cancel = () => {
    const id = useAnalysisStore.getState().analysisId
    if (!id) return
    void fetch('/api/analyze/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis_id: id }),
    })
  }

  return { submit, cancel, connected }
}
