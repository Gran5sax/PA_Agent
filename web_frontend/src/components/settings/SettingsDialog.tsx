import { useEffect, useState } from 'react'
import { api } from '../../api/client'

interface Props {
  open: boolean
  onClose: () => void
}

interface ProviderView {
  base_url: string
  model: string
  has_api_key: boolean
  thinking: boolean
  reasoning_effort: string
}

export function SettingsDialog({ open, onClose }: Props) {
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [thinking, setThinking] = useState(true)
  const [effort, setEffort] = useState('high')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    api.getSettings().then((s) => {
      const p = s.provider as ProviderView
      setBaseUrl(p.base_url)
      setModel(p.model)
      setHasKey(p.has_api_key)
      setThinking(p.thinking)
      setEffort(p.reasoning_effort)
      setApiKey('')
      setMsg(null)
    })
  }, [open])

  if (!open) return null

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      await api.putSettings({
        provider: {
          base_url: baseUrl,
          model,
          thinking,
          reasoning_effort: effort,
          ...(apiKey ? { api_key: apiKey } : {}),
        },
      })
      setMsg('已保存，下次分析立即生效')
      setApiKey('')
      setHasKey(true)
    } catch (e) {
      setMsg('保存失败：' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">设置 · AI 提供商</div>
        <label>
          Base URL
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </label>
        <label>
          模型
          <input value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
        <label>
          API Key{' '}
          {hasKey && <span className="muted small">（已配置，留空则不变）</span>}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasKey ? '••••••（留空不变）' : 'sk-...'}
          />
        </label>
        <label>
          思考
          <select
            value={thinking ? 'on' : 'off'}
            onChange={(e) => setThinking(e.target.value === 'on')}
          >
            <option value="on">开启</option>
            <option value="off">关闭</option>
          </select>
        </label>
        <label>
          推理深度
          <select value={effort} onChange={(e) => setEffort(e.target.value)}>
            {['low', 'medium', 'high', 'max'].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        {msg && <div className="dialog-msg">{msg}</div>}
        <div className="dialog-actions">
          <button onClick={onClose}>关闭</button>
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
