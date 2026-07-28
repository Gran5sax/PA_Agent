import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
} from 'lightweight-charts'
import type { IChartApi, IPriceLine, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { Decision, KlineResponse } from '../../api/types'

interface Props {
  data: KlineResponse | null
  decision?: Decision | null
}

const toTs = (ms: number): UTCTimestamp => Math.floor(ms / 1000) as UTCTimestamp

export function KlineChart({ data, decision }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const emaRef = useRef<ISeriesApi<'Line'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])

  // Create the chart once.
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
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      rightPriceScale: { borderColor: '#e5e7eb' },
      timeScale: {
        borderColor: '#e5e7eb',
        timeVisible: true,
        secondsVisible: false,
      },
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
    return () => {
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      emaRef.current = null
      priceLinesRef.current = []
    }
  }, [])

  // Feed data when it changes.
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
        lineStyle: 2, // dashed
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

  return <div className="chart-container" ref={containerRef} />
}
