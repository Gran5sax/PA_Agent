// WebSocket helpers. In production same-origin; in dev Vite proxies /ws.

export type WsMessage = Record<string, unknown>

function openWs(
  path: string,
  onMessage: (m: WsMessage) => void,
  onClose?: () => void,
  onError?: (e: unknown) => void,
): WebSocket {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${window.location.host}${path}`)
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data) as WsMessage)
    } catch {
      /* ignore non-JSON frames */
    }
  }
  if (onClose) ws.onclose = () => onClose()
  if (onError) ws.onerror = (e) => onError(e)
  return ws
}

export const openAnalyzeWs = (
  onMessage: (m: WsMessage) => void,
  onClose?: () => void,
  onError?: (e: unknown) => void,
) => openWs('/ws/analyze', onMessage, onClose, onError)

export const openChatWs = (
  onMessage: (m: WsMessage) => void,
  onClose?: () => void,
  onError?: (e: unknown) => void,
) => openWs('/ws/chat', onMessage, onClose, onError)
