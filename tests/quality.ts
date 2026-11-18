// 조합 품질 측정대: 알고 있는 손글씨 글꼴로 템플릿 글자를 '써서' 폰트를 만들고,
// 만들어진 11,172자 가운데 자주 쓰는 2,350자를 원래 글꼴과 모양으로 비교한다.
//   npx vite --port 5179 → tests/quality.html → window.quality('Gaegu', 'quick')
import { segmentScored, setRefineAbove, setRefineMargin, setVoteWeight, setWarp } from '../src/engine/segment'
import { ensureRefFont } from '../src/engine/refmask'
import { buildFont, type BuildCell } from '../src/engine/build'
import { decompose, isHangul, shapeOf } from '../src/engine/hangul'
import type { Bitmap } from '../src/engine/bitmap'
import layout from '../src/data/template-layout-v2.json'

declare global { interface Window { quality: (fam: string, tier: string, opts?: any) => Promise<unknown>; qReady: boolean } }

const SHEETS: Record<string, number[]> = { quick: [1], standard: [1, 2, 3, 4], kids: [11, 12] }
const N = 160
const G = 64

function cellOf(ch: string, fam: string, jitter = 0, seed = 1): Bitmap {
  const c = document.createElement('canvas'); c.width = N; c.height = N
  const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, N, N); x.fillStyle = '#000'
  // 칸의 70%쯤 크기로, 손으로 쓴 것처럼 위치·크기를 조금씩 흔든다
  let s = seed
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5 }
  const size = N * (0.74 + jitter * 0.08 * r())
  x.font = `${size}px "${fam}"`; x.textAlign = 'center'; x.textBaseline = 'middle'
  x.fillText(ch, N / 2 + jitter * N * 0.04 * r(), N / 2 + jitter * N * 0.04 * r())
  const d = x.getImageData(0, 0, N, N).data; const out = new Uint8Array(N * N)
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] < 128 ? 1 : 0
  return { w: N, h: N, data: out }
}

// 글자 하나를 그려 잉크 상자에 맞춰 G×G로 정규화
const big = document.createElement('canvas'); big.width = 192; big.height = 192
const bctx = big.getContext('2d', { willReadFrequently: true })!
const small = document.createElement('canvas'); small.width = G; small.height = G
const sctx = small.getContext('2d', { willReadFrequently: true })!
function norm(ch: string, fam: string): { m: Uint8Array; aspect: number; h: number } | null {
  bctx.fillStyle = '#fff'; bctx.fillRect(0, 0, 192, 192); bctx.fillStyle = '#000'
  bctx.font = `150px "${fam}"`; bctx.textAlign = 'center'; bctx.textBaseline = 'middle'; bctx.fillText(ch, 96, 96)
  const d = bctx.getImageData(0, 0, 192, 192).data
  let x0 = 192, y0 = 192, x1 = -1, y1 = -1
  for (let y = 0; y < 192; y++) for (let x = 0; x < 192; x++) if (d[(y * 192 + x) * 4] < 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (x1 < 0) return null
  const w = x1 - x0 + 1, h = y1 - y0 + 1, sc = (G - 4) / Math.max(w, h)
  sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, G, G)
  sctx.drawImage(big, x0, y0, w, h, (G - w * sc) / 2, (G - h * sc) / 2, w * sc, h * sc)
  const e = sctx.getImageData(0, 0, G, G).data
  const m = new Uint8Array(G * G)
  for (let i = 0; i < m.length; i++) m[i] = e[i * 4] < 140 ? 1 : 0
  return { m, aspect: w / h, h }
}
function dt(m: Uint8Array): Float32Array {
  const INF = 1e6, o = new Float32Array(G * G)
  for (let i = 0; i < o.length; i++) o[i] = m[i] ? 0 : INF
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const i = y * G + x
    if (x > 0) o[i] = Math.min(o[i], o[i - 1] + 1)
    if (y > 0) o[i] = Math.min(o[i], o[i - G] + 1)
    if (x > 0 && y > 0) o[i] = Math.min(o[i], o[i - G - 1] + 1.4)
    if (x < G - 1 && y > 0) o[i] = Math.min(o[i], o[i - G + 1] + 1.4)
  }
  for (let y = G - 1; y >= 0; y--) for (let x = G - 1; x >= 0; x--) {
    const i = y * G + x
    if (x < G - 1) o[i] = Math.min(o[i], o[i + 1] + 1)
    if (y < G - 1) o[i] = Math.min(o[i], o[i + G] + 1)
    if (x < G - 1 && y < G - 1) o[i] = Math.min(o[i], o[i + G + 1] + 1.4)
    if (x > 0 && y < G - 1) o[i] = Math.min(o[i], o[i + G - 1] + 1.4)
  }
  return o
}
/** 두 정규화 글자의 평균 윤곽 거리 (64칸 기준 화소, 작을수록 닮음) */
function dist(a: Uint8Array, b: Uint8Array): number {
  const da = dt(a), db = dt(b)
  let s1 = 0, n1 = 0, s2 = 0, n2 = 0
  for (let i = 0; i < a.length; i++) { if (a[i]) { s1 += Math.min(db[i], 12); n1++ } if (b[i]) { s2 += Math.min(da[i], 12); n2++ } }
  return ((n1 ? s1 / n1 : 12) + (n2 ? s2 / n2 : 12)) / 2
}

function ksx1001(): string[] {
  const out: string[] = []
  const dec = new TextDecoder('euc-kr')
  for (let a = 0xb0; a <= 0xc8; a++) for (let b = 0xa1; b <= 0xfe; b++) {
    const ch = dec.decode(new Uint8Array([a, b]))
    if (ch.length === 1 && isHangul(ch)) out.push(ch)
  }
  return out
}
const groupOf = (ch: string) => {
  const s = decompose(ch)
  const sh = shapeOf(s.jung)
  const jongKind = s.jong === 0 ? '받침없음' : [3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 18].includes(s.jong) ? '겹받침' : '받침'
  return `${sh === 'V' ? '세로모음' : sh === 'H' ? '가로모음' : '섞인모음'}·${jongKind}`
}

let seq = 0
window.quality = async (fam, tier, opts: any = {}) => {
  setRefineAbove(opts.refineAbove ?? 0.5); setVoteWeight(opts.vote ?? 0.5); setWarp(opts.warp ?? 2); setRefineMargin(opts.margin ?? 0.02)
  const sheets = SHEETS[tier]
  const chars: string[] = []
  for (const sh of (layout as any).sheets) if (sheets.includes(sh.sheet)) for (const c of sh.cells) if (c.char) chars.push(c.char)
  const all = ksx1001()
  await document.fonts.load(`100px "${fam}"`, all.join('') + chars.join(''))
  if (opts.other) await document.fonts.load(`100px "${opts.other}"`, all.join(''))
  await ensureRefFont(chars.filter(isHangul).join(''))
  const cells: BuildCell[] = chars.map((ch, i) => {
    const bm = cellOf(ch, fam, opts.noise ?? 1, i * 7919 + 13)
    const seg = isHangul(ch) ? segmentScored(bm, ch) : null
    return { index: i + 1, char: ch, bitmap: bm, labels: seg?.labels, segCost: seg?.cost }
  })
  const t0 = performance.now()
  const r = await buildFont(cells, 'Q', () => {}, {})
  const ms = Math.round(performance.now() - t0)
  const name = `QBuilt${++seq}`
  const face = new FontFace(name, r.ttf.slice().buffer); await face.load(); document.fonts.add(face)
  const direct = new Set(r.directChars)
  const groups = new Map<string, number[]>()
  const worst: [number, string][] = []
  let dSum = 0, dN = 0, oSum = 0, oN = 0, aSum = 0
  const hBuilt: number[] = []
  for (const ch of all) {
    const g = norm(ch, fam), b = norm(ch, name)
    if (!g || !b) continue
    const d = dist(g.m, b.m)
    hBuilt.push(b.h)
    if (direct.has(ch)) { dSum += d; dN++; continue }
    const k = groupOf(ch)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(d)
    aSum += Math.abs(Math.log(b.aspect / g.aspect))
    worst.push([d, ch])
    if (opts.other) { const o = norm(ch, opts.other); if (o) { oSum += dist(g.m, o.m); oN++ } }
  }
  worst.sort((a, b) => b[0] - a[0])
  // 잘못 읽힘: 만든 글자가 원래 글꼴의 '모음만 다른 글자'에 더 가까우면 다른 글자로 읽힌다 (예: 권이 건처럼)
  const allSet = new Set(all)
  const gtCache = new Map<string, { m: Uint8Array; d: Float32Array } | null>()
  const gt = (ch: string) => {
    if (!gtCache.has(ch)) { const g = norm(ch, fam); gtCache.set(ch, g ? { m: g.m, d: dt(g.m) } : null) }
    return gtCache.get(ch)!
  }
  const d2 = (bm: Uint8Array, bd: Float32Array, g: { m: Uint8Array; d: Float32Array }) => {
    let s1 = 0, n1 = 0, s2 = 0, n2 = 0
    for (let i = 0; i < bm.length; i++) { if (bm[i]) { s1 += Math.min(g.d[i], 12); n1++ } if (g.m[i]) { s2 += Math.min(bd[i], 12); n2++ } }
    return ((n1 ? s1 / n1 : 12) + (n2 ? s2 / n2 : 12)) / 2
  }
  let misread = 0, checked = 0, oMis = 0, oChecked = 0
  const misList: string[] = []
  for (const ch of all) {
    if (direct.has(ch)) continue
    const b = norm(ch, name), own = gt(ch)
    if (!b || !own) continue
    const bd = dt(b.m)
    const self = d2(b.m, bd, own)
    const sy = decompose(ch)
    let worse = ''
    for (let j = 0; j < 21 && !worse; j++) {
      if (j === sy.jung) continue
      const o = String.fromCharCode(0xac00 + (sy.cho * 21 + j) * 28 + sy.jong)
      if (!allSet.has(o)) continue
      const g = gt(o); if (g && d2(b.m, bd, g) < self) worse = o
    }
    checked++
    if (worse) { misread++; if (misList.length < 40) misList.push(`${ch}→${worse}`) }
    if (opts.other) {
      const ob = norm(ch, opts.other)
      if (ob) {
        const od = dt(ob.m), oself = d2(ob.m, od, own)
        let ow = false
        for (let j = 0; j < 21 && !ow; j++) {
          if (j === sy.jung) continue
          const o = String.fromCharCode(0xac00 + (sy.cho * 21 + j) * 28 + sy.jong)
          if (!allSet.has(o)) continue
          const g = gt(o); if (g && d2(ob.m, od, g) < oself) ow = true
        }
        oChecked++; if (ow) oMis++
      }
    }
  }
  const comp = [...groups.values()].flat()
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length)
  const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))) }
  document.fonts.delete(face)
  return {
    fam, tier, ms, direct: r.directHangul, refFallback: r.refFallback, missing: r.missingJamo,
    composedDist: +mean(comp).toFixed(3), directDist: +(dSum / Math.max(1, dN)).toFixed(3),
    otherFontDist: oN ? +(oSum / oN).toFixed(3) : null,
    aspectErr: +(aSum / Math.max(1, comp.length)).toFixed(3),
    misread: +(misread / Math.max(1, checked)).toFixed(4), misList: misList.join(' '), otherMisread: +(oMis / Math.max(1, oChecked)).toFixed(4),
    heightCV: +(sd(hBuilt) / mean(hBuilt)).toFixed(3),
    groups: Object.fromEntries([...groups.entries()].map(([k, v]) => [k, [+mean(v).toFixed(2), v.length]])),
    worst: worst.slice(0, 40).map(([d, c]) => `${c}${d.toFixed(1)}`).join(' '),
  }
}
window.qReady = true

// 눈으로 비교: 위 = 원래 글꼴, 아래 = 만든 폰트. 각 글자 밑에 쓴 부품의 출처 글자
import { Library } from '../src/engine/model'
;(window as any).qsheet = async (fam: string, tier: string, show: string) => {
  const sheets = SHEETS[tier]
  const chars: string[] = []
  for (const sh of (layout as any).sheets) if (sheets.includes(sh.sheet)) for (const c of sh.cells) if (c.char) chars.push(c.char)
  await document.fonts.load(`100px "${fam}"`, show + chars.join(''))
  await ensureRefFont(chars.filter(isHangul).join(''))
  const cells: BuildCell[] = chars.map((ch, i) => {
    const bm = cellOf(ch, fam, 1, i * 7919 + 13)
    const seg = isHangul(ch) ? segmentScored(bm, ch) : null
    return { index: i + 1, char: ch, bitmap: bm, labels: seg?.labels, segCost: seg?.cost }
  })
  const r = await buildFont(cells, 'Q', () => {}, {})
  const lib = new Library(cells.filter((c) => c.labels) as any)
  const name = `QS${++seq}`
  const face = new FontFace(name, r.ttf.slice().buffer); await face.load(); document.fonts.add(face)
  const arr = [...show], S = 96, cols = Math.min(12, arr.length), rows = Math.ceil(arr.length / cols)
  const c = document.createElement('canvas'); c.width = cols * S; c.height = rows * (S * 2 + 18)
  const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height)
  x.textAlign = 'center'; x.textBaseline = 'middle'
  arr.forEach((ch, i) => {
    const X = (i % cols) * S + S / 2, Y = Math.floor(i / cols) * (S * 2 + 18)
    x.fillStyle = '#000'; x.font = `${S * 0.8}px "${fam}"`; x.fillText(ch, X, Y + S / 2)
    x.fillStyle = '#b02a14'; x.font = `${S * 0.8}px "${name}"`; x.fillText(ch, X, Y + S * 1.5)
    const src = lib.plan(ch).parts.map((p) => p.sample.isRef ? '★' : chars[+p.sample.key.split(':')[0] - 1]).join('')
    x.fillStyle = '#666'; x.font = '12px sans-serif'; x.fillText(src, X, Y + S * 2 + 8)
    x.strokeStyle = '#ddd'; x.strokeRect(X - S / 2, Y, S, S * 2)
  })
  document.fonts.delete(face)
  return c.toDataURL()
}

// 자모 나누기 결과를 색으로: 초성 주황 · 중성 초록 · 종성 노랑
const SEGCOL = [[255, 255, 255], [194, 80, 47], [47, 138, 115], [176, 132, 26]]
;(window as any).qseg = async (fam: string, chars: string) => {
  const arr = [...chars]
  await document.fonts.load(`100px "${fam}"`, chars); await ensureRefFont(chars)
  const cols = Math.min(10, arr.length), rows = Math.ceil(arr.length / cols)
  const cv = document.createElement('canvas'); cv.width = cols * (N + 4); cv.height = rows * (N + 22)
  const ctx = cv.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height)
  const layoutChars: string[] = []
  for (const sh of (layout as any).sheets) for (const c of sh.cells) if (c.char) layoutChars.push(c.char)
  arr.forEach((ch, j) => {
    const i = layoutChars.indexOf(ch)
    const bm = cellOf(ch, fam, 1, (i >= 0 ? i : j) * 7919 + 13); const s = segmentScored(bm, ch)
    const img = ctx.createImageData(N, N)
    for (let p = 0; p < N * N; p++) img.data.set([...(bm.data[p] ? SEGCOL[s.labels[p]] : SEGCOL[0]), 255], p * 4)
    const x = (j % cols) * (N + 4), y = Math.floor(j / cols) * (N + 22)
    ctx.putImageData(img, x, y + 20); ctx.fillStyle = '#000'; ctx.font = '16px sans-serif'; ctx.fillText(`${ch} ${s.cost.toFixed(2)}`, x + 4, y + 16)
    ctx.strokeStyle = '#ddd'; ctx.strokeRect(x, y + 20, N, N)
  })
  return cv.toDataURL()
}

import { segDebug } from '../src/engine/segment'
;(window as any).qdebug = async (fam: string, ch: string, opts: any = {}) => {
  setRefineAbove(opts.refineAbove ?? 0.5); setWarp(opts.warp ?? 2)
  await document.fonts.load(`100px "${fam}"`, ch); await ensureRefFont(ch)
  const layoutChars: string[] = []
  for (const sh of (layout as any).sheets) for (const c of sh.cells) if (c.char) layoutChars.push(c.char)
  const i = layoutChars.indexOf(ch)
  const bm = cellOf(ch, fam, 1, (i >= 0 ? i : 0) * 7919 + 13)
  segDebug.on = true; segDebug.log = []
  const s = segmentScored(bm, ch)
  segDebug.on = false
  const log = segDebug.log.slice()
  const sorted = log.filter((l) => /^\d+ /.test(l)).sort((a, b) => +a.split(' ')[1] - +b.split(' ')[1]).slice(0, 8)
  return { cost: s.cost, top: sorted, other: log.filter((l) => !/^\d+ /.test(l)) }
}

import { refMasks as _rm, REF as _REF } from '../src/engine/refmask'
;(window as any).qref = async (chars: string, S = 64) => {
  const arr = [...chars]; await ensureRefFont(chars)
  const cols = (window as any).qcols ?? 20, rows = Math.ceil(arr.length / cols)
  const cv = document.createElement('canvas'); cv.width = cols * S; cv.height = rows * S
  const ctx = cv.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height)
  const t = document.createElement('canvas'); t.width = _REF; t.height = _REF; const tx = t.getContext('2d')!
  arr.forEach((ch, j) => {
    const m = _rm(ch); const img = tx.createImageData(_REF, _REF)
    for (let i = 0; i < _REF * _REF; i++) { const k = m.slot.cho[i] ? 1 : m.slot.jung[i] ? 2 : m.slot.jong?.[i] ? 3 : 0; img.data.set([...SEGCOL[k], 255], i * 4) }
    tx.putImageData(img, 0, 0)
    ctx.drawImage(t, (j % cols) * S, Math.floor(j / cols) * S, S, S)
    ctx.strokeStyle = '#eee'; ctx.strokeRect((j % cols) * S, Math.floor(j / cols) * S, S, S)
  })
  return cv.toDataURL()
}

;(window as any).qrefdist = async (fam: string, tier: string) => {
  const sheets = SHEETS[tier]
  const chars: string[] = []
  for (const sh of (layout as any).sheets) if (sheets.includes(sh.sheet)) for (const c of sh.cells) if (c.char) chars.push(c.char)
  await document.fonts.load(`100px "${fam}"`, chars.join('')); await ensureRefFont(chars.filter(isHangul).join(''))
  const cells = chars.map((ch, i) => { const bm = cellOf(ch, fam, 1, i * 7919 + 13); const seg = isHangul(ch) ? segmentScored(bm, ch) : null; return { index: i + 1, char: ch, bitmap: bm, labels: seg?.labels, segCost: seg?.cost } })
  const lib = new Library(cells.filter((c) => c.labels) as any)
  return lib.samples.map((s) => `${chars[+s.key.split(':')[0] - 1]}:${s.slot}:${(s.refDist ?? -1).toFixed(2)}:${(s.cons ?? -1).toFixed(2)}`)
}
