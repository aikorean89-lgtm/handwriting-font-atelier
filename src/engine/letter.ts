// 손편지·공책 사진 → 잉크 그림 → 글자 상자 찾기 → 칸 비트맵
/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadCV } from './cv'
import { type Bitmap, type Box, newBitmap } from './bitmap'

export interface LetterImage { w: number; h: number; ink: Uint8Array }

const WORK = 1800 // 작업 해상도 (긴 변)

/** 사진을 흑백 잉크 그림으로. dark: 0.55(진한 글씨만)–0.85(연한 글씨까지) */
export async function inkFromPhoto(src: HTMLCanvasElement, dark = 0.72): Promise<LetterImage> {
  const cv = await loadCV()
  const s = Math.min(1, WORK / Math.max(src.width, src.height))
  const w = Math.round(src.width * s), h = Math.round(src.height * s)
  const m = cv.imread(src)
  const rs = new cv.Mat()
  cv.resize(m, rs, new cv.Size(w, h), 0, 0, cv.INTER_AREA)
  const g = new cv.Mat()
  cv.cvtColor(rs, g, cv.COLOR_RGBA2GRAY)
  // 배경(종이·조명) 추정: 작게 줄여 글씨를 지우고 다시 키운다
  const small = new cv.Mat()
  cv.resize(g, small, new cv.Size(Math.max(8, Math.round(w / 12)), Math.max(8, Math.round(h / 12))), 0, 0, cv.INTER_AREA)
  const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5))
  cv.dilate(small, small, k)
  cv.GaussianBlur(small, small, new cv.Size(5, 5), 0)
  const bg = new cv.Mat()
  cv.resize(small, bg, new cv.Size(w, h), 0, 0, cv.INTER_LINEAR)
  const gd: Uint8Array = g.data, bd: Uint8Array = bg.data
  const ink = new Uint8Array(w * h)
  for (let i = 0; i < ink.length; i++) ink[i] = gd[i] < Math.max(bd[i], 50) * dark ? 1 : 0
  // 공책 줄(가로·세로로 아주 긴 선) 지우기
  const im = cv.matFromArray(h, w, cv.CV_8UC1, ink.map((v) => v * 255))
  const lines = new cv.Mat(), tmp = new cv.Mat()
  const kh = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(Math.round(w / 8), 1))
  const kv = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, Math.round(h / 8)))
  cv.morphologyEx(im, lines, cv.MORPH_OPEN, kh)
  cv.morphologyEx(im, tmp, cv.MORPH_OPEN, kv)
  cv.bitwise_or(lines, tmp, lines)
  const kd = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
  cv.dilate(lines, lines, kd)
  const ld: Uint8Array = lines.data
  for (let i = 0; i < ink.length; i++) if (ld[i]) ink[i] = 0
  for (const x of [m, rs, g, small, k, bg, im, lines, tmp, kh, kv, kd]) x.delete()
  removeDots(ink, w, h, Math.max(4, Math.round((w * h) / 400000)))
  return { w, h, ink }
}

function removeDots(ink: Uint8Array, w: number, h: number, minArea: number) {
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  for (let i = 0; i < ink.length; i++) {
    if (!ink[i] || seen[i]) continue
    const comp: number[] = []
    stack.push(i); seen[i] = 1
    while (stack.length) {
      const p = stack.pop()!
      comp.push(p)
      const x = p % w, y = (p - x) / w
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const q = ny * w + nx
        if (ink[q] && !seen[q]) { seen[q] = 1; stack.push(q) }
      }
    }
    if (comp.length < minArea) for (const p of comp) ink[p] = 0
  }
}

/** 줄을 찾고, 줄마다 세로로 비는 곳을 기준으로 글자 상자를 나눈다.
 *  한글은 자모가 떨어져 있어(라, 늘) 조각을 글자 하나 크기로 묶어야 한다: 줄 높이 정도의 정사각형이 되도록 묶는 방법을 고른다 */
export function findBoxes(img: LetterImage): Box[] {
  const { w, h, ink } = img
  const rows = new Float32Array(h)
  for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) s += ink[y * w + x]; rows[y] = s }
  const sm = (a: Float32Array, r: number) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const j = i + k; if (j >= 0 && j < a.length) { s += a[j]; n++ } } o[i] = s / n } return o }
  const rs = sm(rows, 2)
  let mx = 0
  for (const v of rs) mx = Math.max(mx, v)
  const th = mx * 0.04
  let bands: [number, number][] = []
  let s = -1
  for (let y = 0; y <= h; y++) {
    const on = y < h && rs[y] > th
    if (on && s < 0) s = y
    if (!on && s >= 0) { if (y - s >= 4) bands.push([s, y]); s = -1 }
  }
  // 아래로 처진 받침(늘, 할)이나 위로 솟은 점이 따로 떨어진 얇은 줄을 가까운 줄에 붙인다
  for (let pass = 0; pass < 3 && bands.length > 1; pass++) {
    const hs = bands.map(([a, b]) => b - a).sort((a, b) => a - b)
    const mh = hs[hs.length >> 1]
    const out: [number, number][] = []
    for (const bd of bands) {
      const last = out[out.length - 1]
      const thin = (x: [number, number]) => x[1] - x[0] < mh * 0.6
      if (last && (bd[0] - last[1] < mh * 0.12 || ((thin(bd) || thin(last)) && bd[0] - last[1] < mh * 0.45))) last[1] = bd[1]
      else out.push([bd[0], bd[1]])
    }
    bands = out
  }
  const out: Box[] = []
  for (const [y0, y1] of bands) {
    const lh = y1 - y0
    const cols = new Uint8Array(w)
    for (let x = 0; x < w; x++) for (let y = y0; y < y1; y++) if (ink[y * w + x]) { cols[x] = 1; break }
    const runs: [number, number][] = []
    let a = -1
    for (let x = 0; x <= w; x++) {
      const on = x < w && cols[x]
      if (on && a < 0) a = x
      if (!on && a >= 0) { runs.push([a, x]); a = -1 }
    }
    if (!runs.length) continue
    // 글자 높이(받침 포함 줄 높이보다 조금 작다)를 글자 폭의 기준으로
    const unit = lh * 0.875
    // 동적 계획법: runs[i..j]를 한 글자로 묶는 비용 = 폭이 unit에서 벗어난 정도 + 안쪽 틈이 큰 정도
    const n = runs.length
    const best = new Float64Array(n + 1).fill(Infinity), from = new Int32Array(n + 1)
    best[0] = 0
    for (let j = 1; j <= n; j++) {
      for (let i = j - 1; i >= 0; i--) {
        const wd = runs[j - 1][1] - runs[i][0]
        if (wd > unit * 1.45 && i < j - 1) break
        let gap = 0
        for (let k = i + 1; k < j; k++) gap = Math.max(gap, runs[k][0] - runs[k - 1][1])
        const r = wd / unit
        const cost = (r > 1 ? (r - 1) * 2.2 : (1 - r) * 0.9) ** 2 + (gap / unit) ** 2 * 1.5 + 0.05
        if (best[i] + cost < best[j]) { best[j] = best[i] + cost; from[j] = i }
      }
    }
    const groups: [number, number][] = []
    for (let j = n; j > 0; j = from[j]) groups.push([runs[from[j]][0], runs[j - 1][1]])
    groups.reverse()
    for (const [gx0, gx1] of groups) {
      const b = tighten(img, gx0, y0, gx1, y1)
      if (b && b.h >= lh * 0.25 && b.w * b.h >= 30) out.push(b)
    }
  }
  return out
}

function tighten(img: LetterImage, x0: number, y0: number, x1: number, y1: number): Box | null {
  let a = x1, b = y1, c = -1, d = -1
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (img.ink[y * img.w + x]) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y) }
  return c < 0 ? null : { x: a, y: b, w: c - a + 1, h: d - b + 1 }
}

/** 상자 안 글씨를 N×N 칸 가운데에, 긴 변이 칸의 72%가 되게 옮긴다 */
export function boxToCell(img: LetterImage, box: Box, n = 180): Bitmap {
  const t = tighten(img, Math.max(0, box.x), Math.max(0, box.y), Math.min(img.w, box.x + box.w), Math.min(img.h, box.y + box.h)) ?? box
  const c = document.createElement('canvas'); c.width = t.w; c.height = t.h
  const x = c.getContext('2d')!
  const id = x.createImageData(t.w, t.h)
  for (let yy = 0; yy < t.h; yy++) for (let xx = 0; xx < t.w; xx++) if (img.ink[(t.y + yy) * img.w + t.x + xx]) id.data[(yy * t.w + xx) * 4 + 3] = 255
  x.putImageData(id, 0, 0)
  const k = (n * 0.72) / Math.max(t.w, t.h)
  const o = document.createElement('canvas'); o.width = n; o.height = n
  const ox = o.getContext('2d', { willReadFrequently: true })!
  ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high'
  ox.drawImage(c, (n - t.w * k) / 2, (n - t.h * k) / 2, t.w * k, t.h * k)
  const d = ox.getImageData(0, 0, n, n).data
  const bm = newBitmap(n, n)
  for (let i = 0; i < n * n; i++) bm.data[i] = d[i * 4 + 3] >= 110 ? 1 : 0
  return bm
}
