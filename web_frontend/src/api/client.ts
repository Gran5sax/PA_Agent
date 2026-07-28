import type {
  DataSourcesResponse,
  HealthResponse,
  KlineResponse,
  RecordSummary,
  SymbolsResponse,
  TimeframesResponse,
} from './types'

// Same-origin in production (FastAPI serves the SPA). In dev, Vite proxies /api.
const API_BASE = ''

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`${res.status} ${detail}`)
  }
  return (await res.json()) as T
}

export const api = {
  health: () => getJson<HealthResponse>('/api/health'),
  dataSources: () => getJson<DataSourcesResponse>('/api/data-sources'),
  kline: (source: string, symbol: string, timeframe: string, n: number) =>
    getJson<KlineResponse>(
      `/api/kline?source=${encodeURIComponent(source)}&symbol=${encodeURIComponent(
        symbol,
      )}&timeframe=${encodeURIComponent(timeframe)}&n=${n}`,
    ),
  symbols: (source: string) =>
    getJson<SymbolsResponse>(
      `/api/symbols?source=${encodeURIComponent(source)}`,
    ).then((r) => r.symbols),
  timeframes: (source: string) =>
    getJson<TimeframesResponse>(
      `/api/timeframes?source=${encodeURIComponent(source)}`,
    ).then((r) => r.timeframes),
  getSettings: () => getJson<Record<string, unknown>>('/api/settings'),
  putSettings: (payload: Record<string, unknown>) =>
    fetch(`${API_BASE}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => {
      if (!r.ok) return r.text().then((t) => Promise.reject(new Error(`${r.status} ${t}`)))
      return r.json()
    }),
  records: () =>
    getJson<{ records: RecordSummary[] }>('/api/records').then((r) => r.records),
  record: (id: string) =>
    getJson<Record<string, unknown>>(`/api/records/${encodeURIComponent(id)}`),
}
