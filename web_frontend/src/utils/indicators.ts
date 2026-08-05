/** Client-side EMA20 / ATR14 — mirror of pa_agent/indicators/{ema,atr}.py.
 * Inputs are OLDEST-FIRST (asc); warm-up slots are NaN. */

export function emaFull(values: number[], period: number): number[] {
  const n = values.length
  const result = new Array<number>(n).fill(NaN)
  if (n < period) return result
  const alpha = 2 / (period + 1)
  let prev = 0
  for (let i = 0; i < period; i++) prev += values[i]
  prev /= period
  result[period - 1] = prev
  for (let i = period; i < n; i++) {
    prev = values[i] * alpha + prev * (1 - alpha)
    result[i] = prev
  }
  return result
}

function trueRange(high: number, low: number, prevClose: number): number {
  const hl = Math.abs(high - low)
  if (Number.isNaN(prevClose)) return hl
  return Math.max(hl, Math.abs(high - prevClose), Math.abs(low - prevClose))
}

export function atrFull(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number,
): number[] {
  const n = highs.length
  const result = new Array<number>(n).fill(NaN)
  if (n < period) return result
  const trs: number[] = []
  for (let i = 0; i < n; i++) {
    const prevC = i > 0 ? closes[i - 1] : NaN
    trs.push(trueRange(highs[i], lows[i], prevC))
  }
  let prev = 0
  for (let i = 0; i < period; i++) prev += trs[i]
  prev /= period
  result[period - 1] = prev
  for (let i = period; i < n; i++) {
    prev = (prev * (period - 1) + trs[i]) / period
    result[i] = prev
  }
  return result
}

/** Compute ema20/atr14 aligned to a NEWEST-FIRST bar list (mirrors
 * pa_agent/data/snapshot.py:compute_indicators — reverse, compute, reverse back). */
export function computeIndicators(
  bars: { high: number; low: number; close: number }[],
): { ema20: number[]; atr14: number[] } {
  const asc = [...bars].reverse() // newest-first → oldest-first
  const closes = asc.map((b) => b.close)
  const highs = asc.map((b) => b.high)
  const lows = asc.map((b) => b.low)
  const ema20Asc = emaFull(closes, 20)
  const atr14Asc = atrFull(highs, lows, closes, 14)
  return { ema20: ema20Asc.reverse(), atr14: atr14Asc.reverse() }
}

/** KDJ (9,3,3) — mirror of the classic A-share formula. Inputs OLDEST-FIRST;
 *  the first n-1 slots are NaN. K/D seed at 50. */
export function kdjFull(
  highs: number[],
  lows: number[],
  closes: number[],
  n = 9,
  m1 = 3,
  m2 = 3,
): { k: number[]; d: number[]; j: number[] } {
  const len = closes.length
  const k = new Array<number>(len).fill(NaN)
  const d = new Array<number>(len).fill(NaN)
  const j = new Array<number>(len).fill(NaN)
  if (len < n) return { k, d, j }
  let prevK = 50
  let prevD = 50
  for (let i = n - 1; i < len; i++) {
    let hh = -Infinity
    let ll = Infinity
    for (let t = i - n + 1; t <= i; t++) {
      if (highs[t] > hh) hh = highs[t]
      if (lows[t] < ll) ll = lows[t]
    }
    const rsv = hh === ll ? 0 : ((closes[i] - ll) / (hh - ll)) * 100
    const kv = (prevK * (m1 - 1) + rsv) / m1
    const dv = (prevD * (m2 - 1) + kv) / m2
    k[i] = kv
    d[i] = dv
    j[i] = 3 * kv - 2 * dv
    prevK = kv
    prevD = dv
  }
  return { k, d, j }
}

/** Compute KDJ aligned to a NEWEST-FIRST bar list (reverse, compute, reverse). */
export function computeKDJ(bars: { high: number; low: number; close: number }[]) {
  const asc = [...bars].reverse()
  const r = kdjFull(
    asc.map((b) => b.high),
    asc.map((b) => b.low),
    asc.map((b) => b.close),
  )
  return { k: r.k.reverse(), d: r.d.reverse(), j: r.j.reverse() }
}
