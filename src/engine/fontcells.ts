// 남의 폰트(TTF)를 칸 그림으로 되돌려 자모를 나눈다 (두 글씨 섞기에서 상대 글씨로 쓴다)
import type { BuildCell } from './build'
import { newBitmap } from './bitmap'
import { isHangul } from './hangul'
import { ensureRefFont } from './refmask'
import { segmentScored } from './segment'

let seq = 0
/** 글자 칸 안 잉크 상자의 중앙값 (크기 = 긴 변, 가운데) — 칸 크기 비율 */
export function medianFrame(cells: { char: string; bitmap: { w: number; h: number; data: Uint8Array } }[]): { size: number; cx: number; cy: number } | null {
  const s: number[] = [], x: number[] = [], y: number[] = []
  for (const c of cells) {
    if (!isHangul(c.char)) continue
    const { w, h, data } = c.bitmap
    let x0 = w, y0 = h, x1 = -1, y1 = -1
    for (let i = 0; i < data.length; i++) if (data[i]) { const xx = i % w, yy = (i / w) | 0; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy }
    if (x1 < 0) continue
    s.push(Math.max(x1 - x0 + 1, y1 - y0 + 1) / w); x.push((x0 + x1 + 1) / 2 / w); y.push((y0 + y1 + 1) / 2 / h)
  }
  if (s.length < 5) return null
  const med = (a: number[]) => [...a].sort((p, q) => p - q)[a.length >> 1]
  return { size: med(s), cx: med(x), cy: med(y) }
}

export async function fontToCells(ttf: Uint8Array, chars: string[], startIndex: number, n = 180, onProgress?: (d: number, t: number) => void, match?: { size: number; cx: number; cy: number } | null): Promise<BuildCell[]> {
  const fam = `FontGongbangMix${++seq}`
  const face = await new FontFace(fam, ttf.slice().buffer).load()
  document.fonts.add(face)
  try {
    await ensureRefFont(chars.join(''))
    const c = document.createElement('canvas'); c.width = n; c.height = n
    const x = c.getContext('2d', { willReadFrequently: true })!
    let size = n * 0.78
    x.textAlign = 'center'; x.textBaseline = 'alphabetic'
    x.font = `${size}px "${fam}"`
    // 모든 글자에 같은 기준선을 쓴다 (글자마다 가운데로 옮기면 쓴 사람의 위치 습관이 사라진다)
    const m = x.measureText('가나다라마')
    let ox = n / 2, base = n / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
    const draw = (ch: string) => {
      x.clearRect(0, 0, n, n)
      x.fillStyle = '#000'
      x.fillText(ch, ox, base)
      const d = x.getImageData(0, 0, n, n).data
      const bm = newBitmap(n, n)
      let ink = 0
      for (let k = 0; k < n * n; k++) if (d[k * 4 + 3] >= 128) { bm.data[k] = 1; ink++ }
      return { bm, ink }
    }
    // 내 글씨와 섞을 때: 상대 글씨의 평균 크기·위치를 내 글씨에 맞춘다 (자모 크기가 서로 어울리게)
    if (match) {
      const probe = chars.filter(isHangul).slice(0, 40).map((ch) => ({ char: ch, bitmap: draw(ch).bm }))
      const f = medianFrame(probe)
      if (f) {
        const k = Math.max(0.6, Math.min(1.6, match.size / f.size))
        // 원점(ox, base)을 중심으로 k배: 새 가운데 = O + k(c − O) 가 목표가 되도록 원점을 옮긴다
        const cx = f.cx * n, cy = f.cy * n
        ox = match.cx * n - k * (cx - ox); base = match.cy * n - k * (cy - base)
        size *= k
        x.font = `${size}px "${fam}"`
      }
    }
    const out: BuildCell[] = []
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i]
      const { bm, ink } = draw(ch)
      if (ink < 20) continue
      const seg = isHangul(ch) ? segmentScored(bm, ch) : null
      out.push({ index: startIndex + i, char: ch, bitmap: bm, labels: seg?.labels, segCost: seg?.cost, src: 'B' })
      if (i % 10 === 0) { onProgress?.(i, chars.length); await new Promise((r) => setTimeout(r, 0)) }
    }
    return out
  } finally { document.fonts.delete(face) }
}
