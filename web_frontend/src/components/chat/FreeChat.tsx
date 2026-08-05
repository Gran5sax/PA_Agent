import { useEffect, useState } from 'react'
import { useChatStream } from '../../hooks/useChatStream'
import { useAnalysisStore } from '../../store/analysisStore'

interface Props {
  enabled: boolean
  source: string
  symbol: string
  timeframe: string
}

export function FreeChat({ enabled, source, symbol, timeframe }: Props) {
  const { turns, streaming, error, send, cancel, reset } = useChatStream()
  const analysisId = useAnalysisStore((s) => s.analysisId)
  const [text, setText] = useState('')

  // Chat follows the current instrument + analysis session: clear history and
  // drop the WS whenever the stock / timeframe / analysisId changes, so stale
  // Q&A from a previous instrument doesn't linger; the next question re-binds
  // to the latest record on the backend.
  useEffect(() => {
    reset()
  }, [analysisId, source, symbol, timeframe, reset])

  if (!enabled) {
    return <div className="muted small">完成一次分析后可在此追问</div>
  }

  const submit = () => {
    if (!text.trim() || streaming) return
    void send(text)
    setText('')
  }

  return (
    <div className="free-chat">
      <div className="chat-title">自由追问</div>
      <div className="chat-turns">
        {turns.length === 0 && <div className="muted small">向 AI 追问任何关于本次分析的问题</div>}
        {turns.map((t, i) => (
          <div key={i} className="chat-turn">
            <div className="chat-user">你：{t.user}</div>
            {t.reasoning && (
              <details className="chat-reasoning">
                <summary>思考（{t.reasoning.length} 字）</summary>
                <pre>{t.reasoning}</pre>
              </details>
            )}
            {t.content && <pre className="chat-content">{t.content}</pre>}
          </div>
        ))}
      </div>
      {error && <div className="stream-error">⚠ {error}</div>}
      <div className="chat-input">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !streaming) submit()
          }}
          disabled={streaming}
          placeholder="追问…（回车发送）"
        />
        {streaming ? (
          <button onClick={cancel}>停止</button>
        ) : (
          <button className="primary" onClick={submit} disabled={!text.trim()}>
            发送
          </button>
        )}
      </div>
    </div>
  )
}
