// 기준 폰트로 음절의 초·중·종 영역 지도를 만든다.
// 같은 중성·종성에 초성만 바꾼 글자들에서 공통으로 남는 화소 = 중성+종성 → 나머지가 초성.
import { CHO, JONG, compose, decompose, type Syl } from './hangul'
import { type Box, dilate } from './bitmap'

export const REF = 128
const REF_FONT = '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif'

export interface RefMasks {
  syl: Syl
  all: Uint8Array
  slot: { cho: Uint8Array; jung: Uint8Array; jong: Uint8Array | null }
  box: Box
}

const ctxs = new Map<number, CanvasRenderingContext2D>()
function getCtx(size = REF): CanvasRenderingContext2D {
  const hit = ctxs.get(size)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctxs.set(size, ctx)
  return ctx
}

const JONG_ALTS = [1, 4, 8, 16, 21, 17, 19]
const CHO_ALTS = [11, 0, 2, 6, 9, 18, 3]

/** refMasks가 그리는 모든 글자 (대상 + 대조용 글자) */
export function refCharsFor(ch: string): string[] {
  const s = decompose(ch)
  const out = [ch]
  if (s.jong > 0) JONG_ALTS.filter((t) => t !== s.jong).slice(0, 5).forEach((t) => out.push(compose({ ...s, jong: t })))
  CHO_ALTS.filter((c) => c !== s.cho).slice(0, 5).forEach((c) => out.push(compose({ ...s, cho: c })))
  return out
}

/** 대조용 글자까지 웹 폰트 조각을 모두 받아 둔다 (안 받으면 대체 글꼴로 그려져 영역 지도가 어긋난다) */
export async function ensureRefFont(chars: string) {
  const all = new Set<string>()
  for (const ch of chars) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp >= 0xac00 && cp <= 0xd7a3) refCharsFor(ch).forEach((c) => all.add(c))
  }
  try { await document.fonts.load(`500 100px ${REF_FONT}`, [...all].join('')) } catch { /* 시스템 글꼴 사용 */ }
}

function render(ch: string, size = REF, font = `500 ${Math.round(REF * 0.86)}px ${REF_FONT}`): Uint8Array {
  const c = getCtx(size)
  c.clearRect(0, 0, size, size)
  c.fillStyle = '#fff'; c.fillRect(0, 0, size, size)
  c.fillStyle = '#000'
  c.font = font
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText(ch, size / 2, size / 2 + size * 0.02)
  const d = c.getImageData(0, 0, size, size).data
  const out = new Uint8Array(size * size)
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] < 128 ? 1 : 0
  return out
}

/** 대조 글자를 대상 글자에 가장 잘 겹치도록 평행 이동 (글꼴이 받침·초성에 따라 위치를 조금씩 옮기므로) */
function alignTo(target: Uint8Array, m: Uint8Array, size = REF): Uint8Array {
  const R = 10
  let bx = 0, by = 0, best = -1
  for (let dy = -R; dy <= R; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
    let ov = 0
    for (let y = Math.max(0, dy); y < Math.min(size, size + dy); y += 2) {
      const row = y * size, srow = (y - dy) * size
      for (let x = Math.max(0, dx); x < Math.min(size, size + dx); x += 2) if (target[row + x] && m[srow + x - dx]) ov++
    }
    if (ov > best) { best = ov; bx = dx; by = dy }
  }
  // 1화소 단위로 다듬기
  let fx = bx, fy = by
  best = -1
  for (let dy = by - 1; dy <= by + 1; dy++) for (let dx = bx - 1; dx <= bx + 1; dx++) {
    let ov = 0
    for (let y = Math.max(0, dy); y < Math.min(size, size + dy); y++) {
      const row = y * size, srow = (y - dy) * size
      for (let x = Math.max(0, dx); x < Math.min(size, size + dx); x++) if (target[row + x] && m[srow + x - dx]) ov++
    }
    if (ov > best) { best = ov; fx = dx; fy = dy }
  }
  if (!fx && !fy) return m
  const out = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    const sy = y - fy
    if (sy < 0 || sy >= size) continue
    for (let x = 0; x < size; x++) { const sx = x - fx; if (sx >= 0 && sx < size) out[y * size + x] = m[sy * size + sx] }
  }
  return out
}

function frequency(chars: string[], target?: Uint8Array): Float32Array {
  const acc = new Float32Array(REF * REF)
  for (const ch of chars) {
    const m = target ? alignTo(target, render(ch)) : render(ch)
    for (let i = 0; i < acc.length; i++) acc[i] += m[i]
  }
  for (let i = 0; i < acc.length; i++) acc[i] /= chars.length
  return acc
}

const cache = new Map<string, RefMasks>()

export function refMasks(ch: string): RefMasks {
  const hit = cache.get(ch)
  if (hit) return hit
  const s = decompose(ch)
  const all = render(ch)
  const N = REF * REF

  // 종성 영역
  let jong: Uint8Array | null = null
  let notJong: Uint8Array = new Uint8Array(N)
  if (s.jong > 0) {
    const alts = JONG_ALTS.filter((t) => t !== s.jong).slice(0, 5)
    const f = frequency(alts.map((t) => compose({ ...s, jong: t })), all)
    const keep = new Uint8Array(N)
    for (let i = 0; i < N; i++) keep[i] = f[i] >= 0.99 ? 1 : 0
    notJong = dilate(keep, REF, REF, 3)
    jong = new Uint8Array(N)
    for (let i = 0; i < N; i++) jong[i] = all[i] && !notJong[i] ? 1 : 0
  }
  // 초성 영역
  const choAlts = CHO_ALTS.filter((c) => c !== s.cho).slice(0, 5)
  const f2 = frequency(choAlts.map((c) => compose({ ...s, cho: c })), all)
  const keep2 = new Uint8Array(N)
  for (let i = 0; i < N; i++) keep2[i] = f2[i] >= 0.99 ? 1 : 0
  const notCho = dilate(keep2, REF, REF, 3)
  const cho = new Uint8Array(N)
  const jung = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    if (!all[i]) continue
    if (jong && jong[i]) continue
    if (!notCho[i]) cho[i] = 1
    else jung[i] = 1
  }
  cleanSlots(all, cho, jung, jong)
  let x0 = REF, y0 = REF, x1 = -1, y1 = -1
  for (let y = 0; y < REF; y++) for (let x = 0; x < REF; x++) {
    if (!all[y * REF + x]) continue
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
  }
  const res: RefMasks = { syl: s, all, slot: { cho, jung, jong }, box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } }
  cache.set(ch, res)
  return res
}

/** 기준 폰트의 자모 하나만 (빠진 자모를 대신할 때) */
export function refJamoMask(ch: string, slot: 'cho' | 'jung' | 'jong'): Uint8Array | null {
  const m = refMasks(ch)
  return slot === 'jong' ? m.slot.jong : m.slot[slot]
}

export const _debug = { CHO, JONG }

/** 큰 글자 한 자를 초·중·종 층으로 나눈다 (랜딩 연출용) */
export function splitForDisplay(ch: string, size: number, font: string): { all: Uint8Array; cho: Uint8Array; jung: Uint8Array; jong: Uint8Array | null } {
  const s = decompose(ch)
  const N = size * size
  const all0 = render(ch, size, font)
  const freq = (chars: string[]) => {
    const acc = new Float32Array(N)
    for (const c of chars) { const m = alignTo(all0, render(c, size, font), size); for (let i = 0; i < N; i++) acc[i] += m[i] }
    return acc
  }
  const all = render(ch, size, font)
  const r = Math.max(2, Math.round(size / 64))
  let jong: Uint8Array | null = null
  if (s.jong) {
    const f = freq([1, 4, 8, 16, 21].filter((t) => t !== s.jong).slice(0, 4).map((t) => compose({ ...s, jong: t })))
    const keep = new Uint8Array(N); for (let i = 0; i < N; i++) keep[i] = f[i] >= 4 ? 1 : 0
    const nj = dilate(keep, size, size, r)
    jong = new Uint8Array(N); for (let i = 0; i < N; i++) jong[i] = all[i] && !nj[i] ? 1 : 0
  }
  const f2 = freq([11, 0, 2, 6, 9].filter((c) => c !== s.cho).slice(0, 4).map((c) => compose({ ...s, cho: c })))
  const keep2 = new Uint8Array(N); for (let i = 0; i < N; i++) keep2[i] = f2[i] >= 4 ? 1 : 0
  const nc = dilate(keep2, size, size, r)
  const cho = new Uint8Array(N), jung = new Uint8Array(N)
  for (let i = 0; i < N; i++) { if (!all[i] || (jong && jong[i])) continue; if (!nc[i]) cho[i] = 1; else jung[i] = 1 }
  cleanSlots(all, cho, jung, jong, size)
  return { all, cho, jung, jong }
}

/** 기준 지도의 가장자리 부스러기(정렬 차이로 남은 얇은 조각)를 이웃 자모로 넘긴다 */
function cleanSlots(all: Uint8Array, cho: Uint8Array, jung: Uint8Array, jong: Uint8Array | null, size = REF) {
  const N = size * size
  const lab = new Uint8Array(N)
  for (let i = 0; i < N; i++) if (all[i]) lab[i] = cho[i] ? 1 : jung[i] ? 2 : jong && jong[i] ? 3 : 2
  const slotSize = [0, 0, 0, 0]
  for (let i = 0; i < N; i++) slotSize[lab[i]]++
  for (let pass = 0; pass < 2; pass++) {
    const seen = new Uint8Array(N)
    for (let i = 0; i < N; i++) {
      if (!lab[i] || seen[i]) continue
      const l = lab[i]
      const region: number[] = []
      const touch = [0, 0, 0, 0]
      const stack = [i]; seen[i] = 1
      while (stack.length) {
        const p = stack.pop()!
        region.push(p)
        const px = p % size, py = (p - px) / size
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
          const q = ny * size + nx
          if (!lab[q]) continue
          if (lab[q] === l) { if (!seen[q]) { seen[q] = 1; stack.push(q) } } else touch[lab[q]]++
        }
      }
      if (region.length >= Math.max(20, slotSize[l] * 0.1)) continue
      let b = 0
      for (let k = 1; k <= 3; k++) if (touch[k] > touch[b]) b = k
      if (b) for (const p of region) lab[p] = b
    }
  }
  for (let i = 0; i < N; i++) {
    cho[i] = lab[i] === 1 ? 1 : 0
    jung[i] = lab[i] === 2 ? 1 : 0
    if (jong) jong[i] = lab[i] === 3 ? 1 : 0
  }
}
