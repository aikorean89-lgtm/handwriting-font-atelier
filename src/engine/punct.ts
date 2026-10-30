// 직접 쓰지 않은 기본 문장부호를 사용자의 펜 굵기와 글씨 크기에 맞춰 그린다
import { type Bitmap, distanceTo, inkBox } from './bitmap'

export const AUTO_PUNCT = ['.', ',', '!', '?', '\'', '"', '-', '~', '(', ')', ':', ';', '/']

export interface Metrics { pen: number; top: number; base: number; N: number }

/** 잉크 화소에서 배경까지의 평균 거리 × 4 ≈ 획 굵기 */
export function penWidth(cells: Bitmap[]): number {
  const ws: number[] = []
  for (const bm of cells.slice(0, 24)) {
    const bg = new Uint8Array(bm.w * bm.h)
    let ink = 0
    for (let i = 0; i < bg.length; i++) { bg[i] = bm.data[i] ? 0 : 1; ink += bm.data[i] }
    if (ink < 30) continue
    const d = distanceTo(bg, bm.w, bm.h)
    let s = 0
    for (let i = 0; i < d.length; i++) if (bm.data[i]) s += d[i]
    ws.push((4 * s) / ink)
  }
  ws.sort((a, b) => a - b)
  return ws.length ? ws[Math.floor(ws.length / 2)] : 6
}

/** 기호를 놓을 세로 기준: 숫자가 있으면 숫자의 위·아래, 없으면 한글의 위·아래 */
export function textMetrics(digits: Bitmap[], hangul: Bitmap[]): { top: number; base: number; N: number } {
  const src = digits.length >= 3 ? digits : hangul
  const N = src[0]?.w ?? 160
  const tops: number[] = [], bases: number[] = []
  for (const bm of src) {
    const b = inkBox(bm)
    if (!b) continue
    tops.push(b.y / bm.w); bases.push((b.y + b.h) / bm.w)
  }
  const med = (a: number[], d: number) => { if (!a.length) return d; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
  return { top: med(tops, 0.2) * N, base: med(bases, 0.8) * N, N }
}

type Draw = (c: CanvasRenderingContext2D, m: Metrics) => void

const dot = (c: CanvasRenderingContext2D, x: number, y: number, r: number) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill() }

const SHAPES: Record<string, Draw> = {
  '.': (c, m) => dot(c, m.N / 2, m.base - m.pen * 0.7, m.pen * 0.75),
  ',': (c, m) => {
    const x = m.N / 2, y = m.base - m.pen * 0.7
    dot(c, x, y, m.pen * 0.7)
    c.beginPath(); c.moveTo(x + m.pen * 0.4, y); c.quadraticCurveTo(x + m.pen * 0.5, y + m.pen * 2.2, x - m.pen * 0.9, y + m.pen * 3); c.stroke()
  },
  '!': (c, m) => {
    const x = m.N / 2, h = m.base - m.top
    c.beginPath(); c.moveTo(x + m.pen * 0.2, m.top + m.pen * 0.5); c.lineTo(x, m.top + h * 0.68); c.stroke()
    dot(c, x, m.base - m.pen * 0.7, m.pen * 0.7)
  },
  '?': (c, m) => {
    const x = m.N / 2, h = m.base - m.top, r = h * 0.24
    c.beginPath(); c.arc(x, m.top + r + m.pen * 0.5, r, Math.PI * 1.1, Math.PI * 0.45); c.quadraticCurveTo(x, m.top + h * 0.55, x, m.top + h * 0.68); c.stroke()
    dot(c, x, m.base - m.pen * 0.7, m.pen * 0.7)
  },
  '\'': (c, m) => { const x = m.N / 2; c.beginPath(); c.moveTo(x + m.pen * 0.2, m.top); c.lineTo(x - m.pen * 0.2, m.top + (m.base - m.top) * 0.28); c.stroke() },
  '"': (c, m) => {
    const g = m.pen * 1.6, x = m.N / 2, l = (m.base - m.top) * 0.28
    for (const dx of [-g, g]) { c.beginPath(); c.moveTo(x + dx + m.pen * 0.2, m.top); c.lineTo(x + dx - m.pen * 0.2, m.top + l); c.stroke() }
  },
  '-': (c, m) => { const y = (m.top + m.base) / 2 + m.pen * 0.3, w = (m.base - m.top) * 0.28; c.beginPath(); c.moveTo(m.N / 2 - w, y); c.lineTo(m.N / 2 + w, y - m.pen * 0.2); c.stroke() },
  '~': (c, m) => {
    const y = (m.top + m.base) / 2, w = (m.base - m.top) * 0.36, a = m.pen * 1.3
    c.beginPath(); c.moveTo(m.N / 2 - w, y + a * 0.3); c.bezierCurveTo(m.N / 2 - w * 0.4, y - a * 1.6, m.N / 2 + w * 0.2, y + a * 1.6, m.N / 2 + w, y - a * 0.4); c.stroke()
  },
  '(': (c, m) => { const h = m.base - m.top; c.beginPath(); c.moveTo(m.N / 2 + h * 0.12, m.top - h * 0.05); c.quadraticCurveTo(m.N / 2 - h * 0.22, (m.top + m.base) / 2 + h * 0.05, m.N / 2 + h * 0.12, m.base + h * 0.12); c.stroke() },
  ')': (c, m) => { const h = m.base - m.top; c.beginPath(); c.moveTo(m.N / 2 - h * 0.12, m.top - h * 0.05); c.quadraticCurveTo(m.N / 2 + h * 0.22, (m.top + m.base) / 2 + h * 0.05, m.N / 2 - h * 0.12, m.base + h * 0.12); c.stroke() },
  ':': (c, m) => { const x = m.N / 2, h = m.base - m.top; dot(c, x, m.top + h * 0.35, m.pen * 0.7); dot(c, x, m.base - m.pen * 0.7, m.pen * 0.7) },
  ';': (c, m) => {
    const x = m.N / 2, h = m.base - m.top
    dot(c, x, m.top + h * 0.35, m.pen * 0.7)
    SHAPES[','](c, m)
  },
  '/': (c, m) => { const h = m.base - m.top; c.beginPath(); c.moveTo(m.N / 2 + h * 0.22, m.top - h * 0.04); c.lineTo(m.N / 2 - h * 0.22, m.base + h * 0.06); c.stroke() },
}

/** 기호 하나를 칸 크기 비트맵으로 */
export function drawPunct(ch: string, m: Metrics): Bitmap | null {
  const f = SHAPES[ch]
  if (!f) return null
  const c = document.createElement('canvas')
  c.width = m.N; c.height = m.N
  const x = c.getContext('2d', { willReadFrequently: true })!
  x.fillStyle = '#fff'; x.fillRect(0, 0, m.N, m.N)
  x.fillStyle = '#000'; x.strokeStyle = '#000'
  x.lineWidth = m.pen; x.lineCap = 'round'; x.lineJoin = 'round'
  f(x, m)
  const d = x.getImageData(0, 0, m.N, m.N).data
  const data = new Uint8Array(m.N * m.N)
  for (let i = 0; i < data.length; i++) data[i] = d[i * 4] < 128 ? 1 : 0
  return { w: m.N, h: m.N, data }
}
