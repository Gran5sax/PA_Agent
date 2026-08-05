import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
} from 'lightweight-charts'
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  MouseEventParams,
  UTCTimestamp,
} from 'lightweight-charts'
import type { Decision, KlineResponse, MoneyFlowItem } from '../../api/types'
import { api } from '../../api/client'
import { kdjFull } from '../../utils/indicators'

export type Indicator = 'none' | 'vol' | 'kdj' | 'flow'

interface Props {
  data: KlineResponse | null
  decision?: Decision | null
  indicator?: Indicator
  source?: string
}

const toTs = (ms: number): UTCTimestamp => Math.floor(ms / 1000) as UTCTimestamp
const DAILY_TFS = ['1d', '1w', '1mo']

function isAshareDaily(source?: string, symbol?: string, tf?: string): boolean {
  if (!source || !source.includes('eastmoney') || source.includes('futures')) return false
  if (!symbol || !/^\d{6}$/.test(symbol)) return false
  return DAILY_TFS.includes(tf ?? '')
}

function dateToTs(d: string): UTCTimestamp | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  if (!m) return null
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000) as UTCTimestamp
}

function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n
}

function fmtTime(ts: UTCTimestamp, tf?: string): string {
  const d = new Date(ts * 1000)
  const base = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  if (DAILY_TFS.includes(tf ?? '')) return base
  return `${base} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

function fmtVol(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (a >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return v.toFixed(0)
}

function applyPaneStretch(chart: IChartApi): void {
  const panes = chart.panes()
  if (panes.length >= 2) {
    panes[0].setStretchFactor(0.75)
    panes[1].setStretchFactor(0.25)
  }
}

export function KlineChart({ data, decision, indicator = 'none', source }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const emaRef = useRef<ISeriesApi<'Line'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const subSeriesRef = useRef<ISeriesApi<any>[]>([])
  const tooltipRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef(indicator)
  const [flowMsg, setFlowMsg] = useState<string | null>(null)

  useEffect(() => {
    indicatorRef.current = indicator
  }, [indicator])

  const closedCount = (data?.bars ?? []).filter((b) => b.closed).length

  // Create chart once.
  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#333',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", sans-serif',
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { labelVisible: true, color: '#94a3b8' },
        horzLine: { labelVisible: true, color: '#94a3b8' },
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      rightPriceScale: { borderColor: '#e5e7eb' },
      timeScale: { borderColor: '#e5e7eb', timeVisible: true, secondsVisible: false },
    })
    chartRef.current = chart
    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: '#16a34a',
      downColor: '#dc2626',
      borderVisible: false,
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
    })
    emaRef.current = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    })

    const onMove = (param: MouseEventParams) => {
      const tip = tooltipRef.current
      const wrap = wrapRef.current
      if (!tip || !wrap) return
      if (
        param.point === undefined ||
        param.time === undefined ||
        !candleRef.current
      ) {
        tip.style.display = 'none'
        return
      }
      const ohlc = param.seriesData.get(candleRef.current) as
        | { open: number; high: number; low: number; close: number }
        | undefined
      if (!ohlc) {
        tip.style.display = 'none'
        return
      }
      const up = ohlc.close >= ohlc.open
      const chg = ohlc.close - ohlc.open
      const chgPct = ohlc.open ? (chg / ohlc.open) * 100 : 0
      const tf = data?.timeframe
      let html = `<div class="tt-time">${fmtTime(param.time as UTCTimestamp, tf)}</div>`
      html += `<div class="tt-ohlc">O<b>${ohlc.open}</b> H<b>${ohlc.high}</b> L<b>${ohlc.low}</b> C<b>${ohlc.close}</b></div>`
      html += `<div class="tt-chg ${up ? 'up' : 'down'}">${up ? '+' : ''}${chg.toFixed(2)} (${up ? '+' : ''}${chgPct.toFixed(2)}%)</div>`
      const ind = indicatorRef.current
      const subs = subSeriesRef.current
        .map((s) => param.seriesData.get(s) as { value?: number } | undefined)
        .filter((x): x is { value: number } => !!x && Number.isFinite(x.value))
      if (subs.length) {
        if (ind === 'vol') {
          html += `<div class="tt-ind">量 ${fmtVol(subs[0].value)}</div>`
        } else if (ind === 'kdj') {
          const labels = ['K', 'D', 'J']
          html += `<div class="tt-ind">${subs
            .map((s, i) => `${labels[i] ?? ''} ${s.value.toFixed(2)}`)
            .join('  ')}</div>`
        } else if (ind === 'flow') {
          const v = subs[0].value
          html += `<div class="tt-ind">主力 ${v >= 0 ? '+' : ''}${fmtVol(v)}</div>`
        }
      }
      tip.innerHTML = html
      tip.style.display = 'block'
      const x = param.point.x
      const y = param.point.y
      const tipW = tip.offsetWidth
      const tipH = tip.offsetHeight
      let left = x + 16
      if (left + tipW > wrap.clientWidth) left = x - tipW - 16
      let top = y + 16
      if (top + tipH > wrap.clientHeight) top = y - tipH - 16
      tip.style.left = Math.max(4, left) + 'px'
      tip.style.top = Math.max(4, top) + 'px'
    }
    chart.subscribeCrosshairMove(onMove)

    return () => {
      chart.unsubscribeCrosshairMove(onMove)
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      emaRef.current = null
      subSeriesRef.current = []
      priceLinesRef.current = []
    }
  }, [])

  // Feed main data (candle + ema + forming bar).
  useEffect(() => {
    if (!data || !candleRef.current || !emaRef.current) return
    const closed = data.bars.filter((b) => b.closed)
    const asc = [...closed].reverse()
    candleRef.current.setData(
      asc.map((b) => ({
        time: toTs(b.ts_open),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    )
    const emaData = asc
      .map((b, i) => {
        const v = data.ema20[i]
        return Number.isFinite(v) ? { time: toTs(b.ts_open), value: v } : null
      })
      .filter((x): x is { time: UTCTimestamp; value: number } => x !== null)
    emaRef.current.setData(emaData)
    if (data.forming_bar) {
      const fb = data.forming_bar
      candleRef.current.update({
        time: toTs(fb.ts_open),
        open: fb.open,
        high: fb.high,
        low: fb.low,
        close: fb.close,
      })
    }
    chartRef.current?.timeScale().fitContent()
  }, [data])

  // Sub-chart: vol / kdj (synchronous). Depends on closed-bar count, not the
  // forming-bar ticks, so it doesn't rebuild every autoRefresh.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !data) return
    subSeriesRef.current.forEach((s) => {
      try {
        chart.removeSeries(s)
      } catch {
        /* already removed */
      }
    })
    subSeriesRef.current = []
    if (indicator === 'flow') return // handled by the async flow effect
    if (indicator === 'none') {
      try {
        if (chart.panes().length > 1) chart.removePane(1)
      } catch {
        /* noop */
      }
      return
    }
    const asc = [...data.bars.filter((b) => b.closed)].reverse()
    if (indicator === 'vol') {
      const s = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: 'volume' } },
        1,
      )
      s.setData(
        asc.map((b) => ({
          time: toTs(b.ts_open),
          value: b.volume,
          color: b.close >= b.open ? 'rgba(22,163,74,0.5)' : 'rgba(220,38,38,0.5)',
        })),
      )
      subSeriesRef.current.push(s)
      applyPaneStretch(chart)
    } else if (indicator === 'kdj') {
      const { k, d, j } = kdjFull(
        asc.map((b) => b.high),
        asc.map((b) => b.low),
        asc.map((b) => b.close),
      )
      const mapLine = (arr: number[], color: string) => {
        const s = chart.addSeries(
          LineSeries,
          { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
          1,
        )
        s.setData(
          asc
            .map((b, i) =>
              Number.isFinite(arr[i]) ? { time: toTs(b.ts_open), value: arr[i] } : null,
            )
            .filter((x): x is { time: UTCTimestamp; value: number } => x !== null),
        )
        subSeriesRef.current.push(s)
      }
      mapLine(k, '#2563eb')
      mapLine(d, '#f59e0b')
      mapLine(j, '#9333ea')
      applyPaneStretch(chart)
    }
  }, [indicator, closedCount, data])

  // Sub-chart: money flow (async, A-share daily only).
  useEffect(() => {
    if (indicator !== 'flow') {
      setFlowMsg(null)
      return
    }
    const chart = chartRef.current
    if (!chart || !data) return
    subSeriesRef.current.forEach((s) => {
      try {
        chart.removeSeries(s)
      } catch {
        /* already removed */
      }
    })
    subSeriesRef.current = []
    const symbol = data.symbol || ''
    if (!isAshareDaily(source, symbol, data.timeframe)) {
      setFlowMsg('主力资金仅支持 A 股个股日线')
      try {
        if (chart.panes().length > 1) chart.removePane(1)
      } catch {
        /* noop */
      }
      return
    }
    setFlowMsg('加载主力资金…')
    let cancelled = false
    api
      .moneyFlow(symbol, Math.max(closedCount, 60))
      .then((res) => {
        if (cancelled || !chartRef.current) return
        const items = (res.items ?? []).filter(
          (it): it is MoneyFlowItem => dateToTs(it.date) !== null,
        )
        if (!items.length) {
          setFlowMsg('无主力资金数据')
          return
        }
        setFlowMsg(null)
        const s = chartRef.current.addSeries(HistogramSeries, {}, 1)
        s.setData(
          items.map((it) => ({
            time: dateToTs(it.date) as UTCTimestamp,
            value: it.main_net,
            color: it.main_net >= 0 ? 'rgba(220,38,38,0.6)' : 'rgba(22,163,74,0.6)',
          })),
        )
        subSeriesRef.current.push(s)
        applyPaneStretch(chartRef.current)
      })
      .catch(() => {
        if (!cancelled) setFlowMsg('主力资金加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [indicator, data?.symbol, data?.timeframe, source, closedCount])

  // Draw Entry / TP1 / TP2 / SL price lines from the decision.
  useEffect(() => {
    if (!candleRef.current) return
    priceLinesRef.current.forEach((pl) => {
      try {
        candleRef.current?.removePriceLine(pl)
      } catch {
        /* already removed */
      }
    })
    priceLinesRef.current = []
    if (!decision || decision.order_type === '不下单') return
    const add = (price: number | null, color: string, title: string) => {
      if (price == null || !candleRef.current) return
      const pl = candleRef.current.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title,
      })
      priceLinesRef.current.push(pl)
    }
    add(decision.entry_price, '#0070f3', '入场')
    add(decision.stop_loss_price, '#dc2626', '止损')
    add(decision.take_profit_price, '#16a34a', 'TP1')
    add(decision.take_profit_price_2, '#86efac', 'TP2')
  }, [decision])

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <div className="chart-container" ref={containerRef} />
      <div className="chart-tooltip" ref={tooltipRef} style={{ display: 'none' }} />
      {flowMsg && <div className="subchart-msg">{flowMsg}</div>}
    </div>
  )
}
