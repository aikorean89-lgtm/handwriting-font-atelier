// 비트맵 → 매끄러운 윤곽 (TrueType 2차 B-스플라인 점열)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Bitmap } from './bitmap'

export interface VPoint { x: number; y: number; on: boolean } // 칸 기준 정규화 좌표 (0–1, y 아래로 증가)
export interface VContour { pts: VPoint[]; hole: boolean }

/** weight: 굵기 조절 (확대 영상 기준 화소, −3 가늘게 … +4 굵게) */
export function vectorize(cv: any, bm: Bitmap, mask?: Uint8Array, want?: number, smooth = 1, weight = 0): VContour[] {
  const { w, h } = bm
  const pad = 4
  const W = w + pad * 2, H = h + pad * 2
  const buf = new Uint8Array(W * H)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    const on = mask ? mask[i] === want : bm.data[i] === 1
    if (on) buf[(y + pad) * W + x + pad] = 255
  }
  const src = cv.matFromArray(H, W, cv.CV_8UC1, buf)
  const up = new cv.Mat()
  const S = 3
  cv.resize(src, up, new cv.Size(W * S, H * S), 0, 0, cv.INTER_LINEAR)
  if (weight !== 0) {
    const r = Math.abs(weight)
    const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(2 * r + 1, 2 * r + 1))
    cv.threshold(up, up, 127, 255, cv.THRESH_BINARY)
    if (weight > 0) cv.dilate(up, up, k); else cv.erode(up, up, k)
    k.delete()
  }
  const k = Math.max(3, Math.round(3 * smooth) | 1)
  cv.GaussianBlur(up, up, new cv.Size(k, k), 1.1 * smooth)
  cv.threshold(up, up, 127, 255, cv.THRESH_BINARY)
  const contours = new cv.MatVector()
  const hier = new cv.Mat()
  cv.findContours(up, contours, hier, cv.RETR_CCOMP, cv.CHAIN_APPROX_NONE)
  const out: VContour[] = []
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i)
    const area = Math.abs(cv.contourArea(c))
    if (area < 40) { c.delete(); continue }
    const approx = new cv.Mat()
    cv.approxPolyDP(c, approx, 1.4, true)
    const n = approx.rows
    if (n < 3) { c.delete(); approx.delete(); continue }
    const raw: [number, number][] = []
    for (let j = 0; j < n; j++) raw.push([approx.data32S[j * 2], approx.data32S[j * 2 + 1]])
    const pts: VPoint[] = raw.map((p, j) => {
      const a = raw[(j - 1 + n) % n], b = raw[(j + 1) % n]
      const v1x = a[0] - p[0], v1y = a[1] - p[1], v2x = b[0] - p[0], v2y = b[1] - p[1]
      const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) + 1e-9)
      const sharp = cos > -0.3 // 내각 약 107° 미만이면 모서리 유지
      return { x: (p[0] / S - pad) / w, y: (p[1] / S - pad) / h, on: sharp }
    })
    const parent = hier.data32S[i * 4 + 3]
    out.push({ pts, hole: parent !== -1 })
    c.delete(); approx.delete()
  }
  src.delete(); up.delete(); contours.delete(); hier.delete()
  return out
}

/** 경계 상자 (정규화 좌표) */
export function contoursBox(cs: VContour[]): { x: number; y: number; w: number; h: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const c of cs) for (const p of c.pts) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y)
  }
  if (!isFinite(x0)) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** 캔버스에 윤곽 그리기 (미리보기용) */
export function drawContours(ctx: CanvasRenderingContext2D, cs: VContour[], x: number, y: number, size: number) {
  ctx.beginPath()
  for (const c of cs) {
    const P = c.pts.map((p) => ({ x: x + p.x * size, y: y + p.y * size, on: p.on }))
    const n = P.length
    let si = P.findIndex((p) => p.on)
    let start: { x: number; y: number }
    if (si < 0) { si = 0; start = mid(P[n - 1], P[0]) } else start = P[si]
    ctx.moveTo(start.x, start.y)
    for (let k = 1; k <= n; k++) {
      const cur = P[(si + k) % n]
      if (cur.on) { ctx.lineTo(cur.x, cur.y); continue }
      const nx = P[(si + k + 1) % n]
      const end = nx.on ? nx : mid(cur, nx)
      ctx.quadraticCurveTo(cur.x, cur.y, end.x, end.y)
      if (nx.on) k++
    }
    ctx.closePath()
  }
  ctx.fill('nonzero')
}
function mid(a: { x: number; y: number }, b: { x: number; y: number }) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
