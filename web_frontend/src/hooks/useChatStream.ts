import { useCallback, useRef, useState } from 'react'
import { openChatWs } from '../api/ws'

export interface ChatTurn {
  user: string
  reasoning: string
  content: string
  done: boolean
}

/** Drives /ws/chat: opens on first send, streams reasoning/content per turn. */
export function useChatStream() {
  const wsRef = useRef<WebSocket | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patchLast = useCallback(
    (patch: (t: ChatTurn) => ChatTurn) =>
      setTurns((ts) => {
        if (ts.length === 0) return ts
        const cp = [...ts]
        cp[cp.length - 1] = patch(cp[cp.length - 1])
        return cp
      }),
    [],
  )

  const ensureOpen = useCallback(async () => {
    if (wsRef.current && sessionIdRef.current) return
    await new Promise<void>((resolve) => {
      const ws = openChatWs((m) => {
        if (m.type === 'chat_ready') {
          sessionIdRef.current = m.session_id as string
          resolve()
        } else if (m.type === 'reasoning_chunk') {
          patchLast((t) => ({ ...t, reasoning: t.reasoning + (m.text as string) }))
        } else if (m.type === 'content_chunk') {
          patchLast((t) => ({ ...t, content: t.content + (m.text as string) }))
        } else if (m.type === 'turn_done') {
          patchLast((t) => ({ ...t, done: true }))
          setStreaming(false)
        } else if (m.type === 'error') {
          setError(m.message as string)
          setStreaming(false)
        }
      })
      ws.onopen = () => ws.send(JSON.stringify({ type: 'start' }))
      wsRef.current = ws
    })
  }, [patchLast])

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return
      await ensureOpen()
      setTurns((ts) => [...ts, { user: text, reasoning: '', content: '', done: false }])
      setStreaming(true)
      setError(null)
      wsRef.current?.send(JSON.stringify({ type: 'send', text }))
    },
    [ensureOpen, streaming],
  )

  const cancel = useCallback(() => {
    if (sessionIdRef.current) {
      wsRef.current?.send(
        JSON.stringify({ type: 'cancel', session_id: sessionIdRef.current }),
      )
    }
  }, [])

  const reset = useCallback(() => {
    setTurns([])
    setError(null)
    setStreaming(false)
    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch {
        /* noop */
      }
    }
    wsRef.current = null
    sessionIdRef.current = null
  }, [])

  return { turns, streaming, error, send, cancel, reset }
}
