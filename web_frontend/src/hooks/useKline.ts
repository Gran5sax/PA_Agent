import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { KlineResponse } from '../api/types'

interface Params {
  source: string
  symbol: string
  timeframe: string
  n: number
}

/** K-line fetch + optional silent auto-refresh (live forming bar). */
export function useKline(intervalMs = 5000) {
  const [data, setData] = useState<KlineResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const paramsRef = useRef<Params | null>(null)

  const fetchKline = useCallback(
    async (source: string, symbol: string, timeframe: string, n: number) => {
      paramsRef.current = { source, symbol, timeframe, n }
      setLoading(true)
      setError(null)
      try {
        setData(await api.kline(source, symbol, timeframe, n))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setData(null)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  // Silent background refresh — keeps the forming bar live without flicker.
  const refresh = useCallback(async () => {
    const p = paramsRef.current
    if (!p) return
    try {
      setData(await api.kline(p.source, p.symbol, p.timeframe, p.n))
    } catch {
      /* ignore transient refresh errors */
    }
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
  }, [autoRefresh, refresh, intervalMs])

  return { data, loading, error, fetchKline, autoRefresh, setAutoRefresh }
}
