// 검수가 끝난 칸들 → TTF 한 벌
/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadCV } from './cv'
import { type Bitmap, inkBox } from './bitmap'
import { COMPAT_JAMO, SBASE, SCOUNT, isHangul } from './hangul'
import { Library, type Sample, type SourceCell } from './model'
import { ensureRefFont } from './refmask'
import { buildTTF, signedArea, type TGlyph, type TPoint } from './ttf'
import { type VContour, vectorize } from './vectorize'
import { AUTO_PUNCT, drawPunct, penWidth, textMetrics } from './punct'

export interface BuildCell { index: number; char: string; bitmap: Bitmap; labels?: Uint8Array; segCost?: number; edited?: boolean }
export interface BuildProgress { phase: 'prepare' | 'vector' | 'compose' | 'write' | 'done'; done: number; total: number; direct?: Set<number>; composedUpTo?: number }
export interface BuildResult {
  ttf: Uint8Array
  glyphs: TGlyph[]
  directChars: string[]
  family: string
  directHangul: number
  composed: number
  refFallback: number
  missingJamo: string[]
  extraChars: number
  autoPunct: string[]
}

/** 굵기(확대 화소 단위 −3…+6)와 자간(1/1000 em) */
export interface BuildOptions { weight?: number; tracking?: number }

const EM = 1000
const ASC = 880

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

export function postscriptName(family: string): string {
  const ascii = family.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '')
  let h = 0
  for (const ch of family) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return `FontGongbang-${ascii.slice(0, 18) || 'Hand'}${h.toString(36).slice(0, 6)}`
}

export async function buildFont(cellsIn: BuildCell[], family: string, onProgress: (p: BuildProgress) => void, opts: BuildOptions = {}): Promise<BuildResult> {
  const cv = await loadCV()
  onProgress({ phase: 'prepare', done: 0, total: 1 })
  const weight = Math.max(-3, Math.min(6, Math.round(opts.weight ?? 0)))
  const tracking = Math.max(-100, Math.min(200, Math.round(opts.tracking ?? 0)))
  // 같은 글자를 여러 번 쓴 경우(보충 시트) 나중 칸의 글씨를 쓴다. 자모 샘플로는 모두 쓴다
  const lastByChar = new Map<string, BuildCell>()
  for (const c of cellsIn) lastByChar.set(c.char, c)
  const cells = [...lastByChar.values()]
  const hangulCells = cellsIn.filter((c) => isHangul(c.char) && c.labels) as Required<BuildCell>[]
  await ensureRefFont(hangulCells.map((c) => c.char).join(''))
  const lib = new Library(hangulCells as SourceCell[])

  // 전체 정규화: 직접 쓴 한글의 중앙값 크기·위치
  const boxes = hangulCells.map((c) => inkBox(c.bitmap)).filter(Boolean).map((b, i) => {
    const N = hangulCells[i].bitmap.w
    return { cx: (b!.x + b!.w / 2) / N, cy: (b!.y + b!.h / 2) / N, h: b!.h / N, w: b!.w / N }
  })
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0.5 }
  const hMed = med(boxes.map((b) => Math.max(b.h, b.w)))
  const S = Math.max(0.75, Math.min(1.7, 0.8 / Math.max(hMed, 0.2)))
  const uMid = med(boxes.map((b) => b.cx)), vMid = med(boxes.map((b) => b.cy))
  const k = EM * S
  const cX = 500 - k * uMid
  const cY = 380 + k * vMid
  const TX = (u: number) => k * u + cX
  const TY = (v: number) => -k * v + cY

  const toPoints = (cs: VContour[], fx: (u: number) => number, fy: (v: number) => number): TPoint[][] => {
    const out: TPoint[][] = []
    for (const c of cs) {
      const pts: TPoint[] = []
      for (const p of c.pts) {
        const q = { x: Math.round(fx(p.x)), y: Math.round(fy(p.y)), on: p.on }
        const last = pts[pts.length - 1]
        if (last && last.x === q.x && last.y === q.y) { last.on = last.on || q.on; continue }
        pts.push(q)
      }
      if (pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y) pts.pop()
      if (pts.length < 3) continue
      const a = signedArea(pts)
      if ((!c.hole && a > 0) || (c.hole && a < 0)) pts.reverse()
      out.push(pts)
    }
    return out
  }

  const glyphs: TGlyph[] = []
  // .notdef
  glyphs.push({ advance: 600, contours: [
    [{ x: 50, y: -100, on: true }, { x: 50, y: 750, on: true }, { x: 550, y: 750, on: true }, { x: 550, y: -100, on: true }],
    [{ x: 110, y: -40, on: true }, { x: 490, y: -40, on: true }, { x: 490, y: 690, on: true }, { x: 110, y: 690, on: true }],
  ] })
  glyphs.push({ advance: 300, unicodes: [0x20, 0xa0] })
  glyphs.push({ advance: EM, unicodes: [0x3000] })

  // 직접 쓰지 않은 기본 문장부호는 펜 굵기에 맞춰 그린다
  const autoPunct: string[] = []
  {
    const have = new Set(cells.map((c) => c.char))
    const missing = AUTO_PUNCT.filter((ch) => !have.has(ch))
    if (missing.length) {
      const digits = cells.filter((c) => /^[0-9]$/.test(c.char)).map((c) => c.bitmap)
      const hb = hangulCells.map((c) => c.bitmap)
      const tm = textMetrics(digits, hb)
      const pen = Math.max(2, penWidth(hb.length ? hb : digits) * (tm.N / (hb[0]?.w ?? tm.N)))
      for (const ch of missing) {
        const bm = drawPunct(ch, { pen, ...tm })
        if (bm) { cells.push({ index: -1, char: ch, bitmap: bm }); autoPunct.push(ch) }
      }
    }
  }

  // 직접 쓴 글자 (한글 + 영숫자·기호)
  const direct = new Map<number, number>()
  const directSet = new Set<number>()
  let extraChars = 0
  const total = cells.length
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    const cp = c.char.codePointAt(0)!
    const cs = vectorize(cv, c.bitmap, undefined, undefined, 1, weight)
    if (!cs.length) continue
    if (isHangul(c.char)) {
      const pts = toPoints(cs, TX, TY)
      if (!pts.length) continue
      direct.set(cp, glyphs.length)
      directSet.add(cp - SBASE)
      glyphs.push({ advance: EM + tracking, unicodes: [cp], contours: pts })
    } else {
      const b = inkBox(c.bitmap)!
      const N = c.bitmap.w
      const left = b.x / N, wid = b.w / N
      const side = 60
      const pts = toPoints(cs, (u) => k * (u - left) + side, TY)
      if (!pts.length) continue
      glyphs.push({ advance: Math.round(k * wid + side * 2) + tracking, unicodes: [cp], contours: pts })
      if (c.index >= 0) extraChars++
    }
    if (i % 12 === 0) { onProgress({ phase: 'vector', done: i, total, direct: directSet }); await tick() }
  }

  // 자모 부품 글리프 (필요할 때 벡터화)
  const compIndex = new Map<string, number>()
  const componentGlyph = (s: Sample): number => {
    const hit = compIndex.get(s.key)
    if (hit != null) return hit
    const cs = vectorize(cv, s.bitmap, s.mask, s.want, s.isRef ? 0.6 : 1, s.isRef ? 0 : weight)
    const idx = glyphs.length
    glyphs.push({ advance: EM, contours: toPoints(cs, TX, TY) })
    compIndex.set(s.key, idx)
    return idx
  }
  const emPart = (p: { sample: Sample; sx: number; sy: number; dx: number; dy: number }) => ({
    glyph: componentGlyph(p.sample), sx: p.sx, sy: p.sy,
    dx: cX * (1 - p.sx) + k * p.dx,
    dy: cY * (1 - p.sy) - k * p.dy,
  })

  // 11,172자 조합
  let composed = 0, refFallback = 0
  const composites: TGlyph[] = []
  for (let i = 0; i < SCOUNT; i++) {
    const cp = SBASE + i
    if (direct.has(cp)) continue
    const plan = lib.plan(String.fromCodePoint(cp))
    if (plan.usedRef) refFallback++
    const comps = plan.parts.map(emPart).filter((c) => glyphs[c.glyph].contours?.length)
    composites.push({ advance: EM + tracking, unicodes: [cp], components: comps })
    composed++
    if (i % 400 === 0) { onProgress({ phase: 'compose', done: i, total: SCOUNT, direct: directSet, composedUpTo: i }); await tick() }
  }
  for (const ch of COMPAT_JAMO) {
    const plan = lib.planCompat(ch)
    if (!plan) continue
    composites.push({ advance: EM + tracking, unicodes: [ch.codePointAt(0)!], components: plan.parts.map(emPart) })
  }
  onProgress({ phase: 'write', done: 0, total: 1, direct: directSet, composedUpTo: SCOUNT })
  await tick()
  // 부품이 비어 있는 복합 글리프는 빈 글리프로
  const all = [...glyphs, ...composites.map((g) => (g.components!.length ? g : { advance: g.advance, unicodes: g.unicodes }))]
  const ttf = writeFont(all, family)
  onProgress({ phase: 'done', done: 1, total: 1, direct: directSet, composedUpTo: SCOUNT })
  return { ttf, glyphs: all, directChars: [...direct.keys()].map((c) => String.fromCodePoint(c)), family, directHangul: direct.size, composed, refFallback, missingJamo: lib.missingJamo(), extraChars, autoPunct }
}

/** 같은 글리프로 이름만 바꿔 다시 쓴다 */
export function writeFont(glyphs: TGlyph[], family: string, owner?: string): Uint8Array {
  const year = new Date().getFullYear()
  return buildTTF(glyphs, {
    family, postscript: postscriptName(family), version: '1.000',
    copyright: `© ${owner || family} ${year}`, license: '이 폰트는 글씨를 쓴 사람의 것입니다. 폰트공방으로 만들었습니다.',
    ascender: 1000, descender: -250, lineGap: 0, typoAscender: ASC, typoDescender: -120, typoLineGap: 250, xHeight: 500, capHeight: 700,
  })
}
