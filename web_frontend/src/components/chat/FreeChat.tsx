import { useState } from 'react'
import { useChatStream } from '../../hooks/useChatStream'

interface Props {
  enabled: boolean
}

export function FreeChat({ enabled }: Props) {
  const { turns, streaming, error, send, cancel } = useChatStream()
  const [text, setText] = useState('')

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
