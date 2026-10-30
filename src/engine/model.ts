// 자모 샘플 라이브러리와 개인화 레이아웃: 어떤 자모를 어디에 얼마나 크게 놓을지 정한다
import { type Bitmap, type Box, inkBox } from './bitmap'
import {
  CHO, JONG, JUNG, type Slot, type Syl, CHO_FALLBACK, JUNG_FALLBACK, JONG_FALLBACK, CHO_SPLIT, JONG_SPLIT,
  compose, decompose, isHangul, jamoIndex, shapeOf, variantOf,
} from './hangul'
import { LABEL } from './segment'
import { REF, refMasks } from './refmask'

export interface SourceCell { index: number; char: string; bitmap: Bitmap; labels: Uint8Array; segCost?: number; edited?: boolean }

export interface Sample {
  key: string
  slot: Slot
  jamo: number
  variant: number
  syl: Syl
  hasJong: boolean
  box: Box // 칸 기준 0–1
  bitmap: Bitmap
  mask: Uint8Array
  want: number
  cost: number // 0 = 사용자가 고침 / 확실
  isRef?: boolean
}

export interface Part { sample: Sample; sx: number; sy: number; dx: number; dy: number }
export interface Plan { parts: Part[]; usedRef: boolean }

// 표본이 없을 때 쓰는 기본 위치 (칸 기준 x, y, w, h)
const PRIOR_CHO: Record<number, Box> = {
  1: { x: 0.12, y: 0.2, w: 0.42, h: 0.58 }, 2: { x: 0.26, y: 0.1, w: 0.48, h: 0.4 }, 3: { x: 0.26, y: 0.1, w: 0.48, h: 0.36 },
  4: { x: 0.12, y: 0.1, w: 0.44, h: 0.38 }, 5: { x: 0.12, y: 0.1, w: 0.44, h: 0.34 }, 6: { x: 0.13, y: 0.1, w: 0.4, h: 0.4 },
  7: { x: 0.27, y: 0.08, w: 0.46, h: 0.3 }, 8: { x: 0.13, y: 0.08, w: 0.42, h: 0.3 },
}
const PRIOR_JUNG: Record<string, Box> = {
  'V0': { x: 0.56, y: 0.08, w: 0.3, h: 0.84 }, 'V1': { x: 0.56, y: 0.06, w: 0.28, h: 0.56 },
  'H0': { x: 0.1, y: 0.42, w: 0.8, h: 0.44 }, 'H1': { x: 0.1, y: 0.32, w: 0.8, h: 0.26 },
  'M0': { x: 0.1, y: 0.08, w: 0.78, h: 0.82 }, 'M1': { x: 0.1, y: 0.06, w: 0.76, h: 0.58 },
}
const PRIOR_JONG: Record<number, Box> = {
  1: { x: 0.2, y: 0.62, w: 0.6, h: 0.3 }, 2: { x: 0.2, y: 0.62, w: 0.6, h: 0.3 },
  3: { x: 0.2, y: 0.63, w: 0.6, h: 0.29 }, 4: { x: 0.22, y: 0.64, w: 0.56, h: 0.28 },
}

function priorBox(key: string): Box {
  const [slot, a, b] = key.split(':')
  if (slot === 'cho') return PRIOR_CHO[+a]
  if (slot === 'jong') return PRIOR_JONG[+a]
  if (slot === 'jungC') return PRIOR_JUNG[`${a}${b}`]
  // jung:<jamo>:<hasJong>
  return PRIOR_JUNG[`${shapeOf(+a)}${b}`]
}

function geomKey(slot: Slot, s: Syl): string {
  if (slot === 'cho') return `cho:${variantOf('cho', s)}`
  if (slot === 'jong') return `jong:${variantOf('jong', s)}`
  return `jung:${s.jung}:${s.jong > 0 ? 1 : 0}`
}
function jungClassKey(s: Syl) { return `jungC:${shapeOf(s.jung)}:${s.jong > 0 ? 1 : 0}` }

export class Library {
  samples: Sample[] = []
  private stats = new Map<string, { x: number; y: number; w: number; h: number; n: number }>()
  private refCache = new Map<string, Sample>()

  constructor(cells: SourceCell[]) {
    for (const c of cells) {
      if (!isHangul(c.char)) continue
      const syl = decompose(c.char)
      for (const slot of ['cho', 'jung', 'jong'] as Slot[]) {
        if (slot === 'jong' && syl.jong === 0) continue
        const want = LABEL[slot]
        const b = inkBox(c.bitmap, c.labels, want)
        if (!b || b.w * b.h < 6) continue
        const N = c.bitmap.w
        const box = { x: b.x / N, y: b.y / N, w: b.w / N, h: b.h / N }
        const s: Sample = {
          key: `${c.index}:${slot}`, slot, jamo: jamoIndex(slot, syl), variant: variantOf(slot, syl), syl,
          hasJong: syl.jong > 0, box, bitmap: c.bitmap, mask: c.labels, want, cost: c.edited ? 0 : (c.segCost ?? 0.4),
        }
        this.samples.push(s)
        this.addStat(geomKey(slot, syl), box)
        if (slot === 'jung') this.addStat(jungClassKey(syl), box)
      }
    }
  }

  private addStat(k: string, b: Box) {
    const s = this.stats.get(k) ?? { x: 0, y: 0, w: 0, h: 0, n: 0 }
    s.x += b.x; s.y += b.y; s.w += b.w; s.h += b.h; s.n++
    this.stats.set(k, s)
  }
  private measured(k: string): Box | null {
    const s = this.stats.get(k)
    if (!s || !s.n) return null
    return { x: s.x / s.n, y: s.y / s.n, w: s.w / s.n, h: s.h / s.n }
  }

  has(slot: Slot, jamo: number) { return this.samples.some((s) => s.slot === slot && s.jamo === jamo) }

  /** 직접 받지도, 두 자모를 붙여 만들지도 못해 기준 글꼴로 채우는 자모 */
  missingJamo(): string[] {
    const out: string[] = []
    const canSplit = (slot: 'cho' | 'jong', c: string) => {
      const sp = slot === 'cho' ? CHO_SPLIT[c] : JONG_SPLIT[c]
      return !!sp && sp.every((p) => this.has(slot, slot === 'cho' ? CHO.indexOf(p) : JONG.indexOf(p)))
    }
    CHO.forEach((c, i) => { if (!this.has('cho', i) && !canSplit('cho', c)) out.push(`초성 ${c}`) })
    JUNG.forEach((c, i) => { if (!this.has('jung', i)) out.push(`중성 ${c}`) })
    JONG.forEach((c, i) => { if (i > 0 && !this.has('jong', i) && !canSplit('jong', c)) out.push(`종성 ${c}`) })
    return out
  }

  /** 출처 문맥의 상자를 목표 문맥으로 옮긴다 */
  private mapFrames(slot: Slot, src: Syl, tgt: Syl): [Box, Box] {
    const ks = geomKey(slot, src), kt = geomKey(slot, tgt)
    const ms = this.measured(ks), mt = this.measured(kt)
    if (ms && mt) return [ms, mt]
    if (slot === 'jung') {
      const cs = this.measured(jungClassKey(src)), ct = this.measured(jungClassKey(tgt))
      if (cs && ct) return [cs, ct]
      return [priorBox(jungClassKey(src)), priorBox(jungClassKey(tgt))]
    }
    return [priorBox(ks), priorBox(kt)]
  }

  private pick(slot: Slot, jamo: number, tgt: Syl): Sample | null {
    const cands = this.samples.filter((s) => s.slot === slot && s.jamo === jamo)
    if (!cands.length) return null
    const v = variantOf(slot, tgt)
    const order = slot === 'cho' ? CHO_FALLBACK[v] : slot === 'jung' ? JUNG_FALLBACK[v] : JONG_FALLBACK[v]
    const wantJong = tgt.jong > 0
    const confident = cands.filter((s) => s.cost <= 0.62)
    const use = confident.length ? confident : cands
    for (const ov of order) {
      let pool = use.filter((s) => s.variant === ov)
      if (slot === 'jung') {
        const same = pool.filter((s) => s.hasJong === wantJong)
        if (same.length) pool = same
      }
      if (pool.length) return this.mostTypical(pool)
    }
    return this.mostTypical(use)
  }

  private mostTypical(pool: Sample[]): Sample {
    if (pool.length === 1) return pool[0]
    let best = pool[0], bd = Infinity
    for (const s of pool) {
      const m = this.measured(geomKey(s.slot, s.syl))
      if (!m) continue
      const d = Math.abs(s.box.w - m.w) + Math.abs(s.box.h - m.h) + Math.abs(s.box.x - m.x) + Math.abs(s.box.y - m.y) + 0.8 * s.cost
      if (d < bd) { bd = d; best = s }
    }
    return best
  }

  private place(sample: Sample, slot: Slot, tgt: Syl, into?: Box): Part {
    let target: Box
    if (into) target = into
    else {
      const [ms, mt] = this.mapFrames(slot, sample.syl, tgt)
      const sx = clamp(mt.w / ms.w, 0.55, 1.8), sy = clamp(mt.h / ms.h, 0.55, 1.8)
      target = { x: mt.x + (sample.box.x - ms.x) * sx, y: mt.y + (sample.box.y - ms.y) * sy, w: sample.box.w * sx, h: sample.box.h * sy }
    }
    const a = clamp(target.w / sample.box.w, 0.3, 1.95), d = clamp(target.h / sample.box.h, 0.3, 1.95)
    return { sample, sx: a, sy: d, dx: target.x - a * sample.box.x, dy: target.y - d * sample.box.y }
  }

  /** 목표 문맥에서 이 자모가 차지할 상자 (빠진 자모를 반으로 나눠 채울 때) */
  private targetBox(slot: Slot, tgt: Syl): Box {
    const kt = geomKey(slot, tgt)
    return this.measured(kt) ?? (slot === 'jung' ? (this.measured(jungClassKey(tgt)) ?? priorBox(jungClassKey(tgt))) : priorBox(kt))
  }

  private refSample(slot: Slot, tgt: Syl): Sample {
    const k = `${slot}:${jamoIndex(slot, tgt)}:${variantOf(slot, tgt)}`
    const hit = this.refCache.get(k)
    if (hit) return hit
    const ch = compose(tgt)
    const m = refMasks(ch)
    const mask = slot === 'jong' ? m.slot.jong! : m.slot[slot]
    const bitmap: Bitmap = { w: REF, h: REF, data: m.all }
    const labels = new Uint8Array(REF * REF)
    for (let i = 0; i < labels.length; i++) if (mask[i]) labels[i] = 1
    const b = inkBox(bitmap, labels, 1) ?? { x: 0, y: 0, w: REF, h: REF }
    const s: Sample = {
      key: `ref:${k}`, slot, jamo: jamoIndex(slot, tgt), variant: variantOf(slot, tgt), syl: tgt, hasJong: tgt.jong > 0,
      box: { x: b.x / REF, y: b.y / REF, w: b.w / REF, h: b.h / REF }, bitmap, mask: labels, want: 1, cost: 1, isRef: true,
    }
    this.refCache.set(k, s)
    return s
  }

  planSlot(slot: Slot, tgt: Syl, plan: Plan) {
    const jamo = jamoIndex(slot, tgt)
    const s = this.pick(slot, jamo, tgt)
    if (s) { plan.parts.push(this.place(s, slot, tgt)); return }
    // 쌍자음·겹받침은 두 자모를 나란히 놓아 만든다
    const ch = slot === 'cho' ? CHO[jamo] : slot === 'jong' ? JONG[jamo] : ''
    const split = slot === 'cho' ? CHO_SPLIT[ch] : slot === 'jong' ? JONG_SPLIT[ch] : undefined
    if (split) {
      const idxs = split.map((c) => (slot === 'cho' ? CHO.indexOf(c) : JONG.indexOf(c)))
      const parts = idxs.map((ix) => this.pick(slot, ix, slot === 'cho' ? { ...tgt, cho: ix } : { ...tgt, jong: ix }))
      if (parts.every(Boolean)) {
        const tb = this.targetBox(slot, tgt)
        const half = tb.w * 0.52
        parts.forEach((p, k) => {
          plan.parts.push(this.place(p!, slot, tgt, { x: tb.x + k * (tb.w - half), y: tb.y, w: half, h: tb.h }))
        })
        return
      }
    }
    plan.parts.push(this.place(this.refSample(slot, tgt), slot, tgt, this.targetBox(slot, tgt)))
    plan.usedRef = true
  }

  plan(ch: string): Plan {
    const tgt = decompose(ch)
    const plan: Plan = { parts: [], usedRef: false }
    this.planSlot('cho', tgt, plan)
    this.planSlot('jung', tgt, plan)
    if (tgt.jong > 0) this.planSlot('jong', tgt, plan)
    return plan
  }

  /** 호환 자모(ㄱ, ㅏ …) 단독형: 대표 샘플을 칸 가운데에 */
  planCompat(ch: string): Plan | null {
    const ci = CHO.indexOf(ch), ji = JUNG.indexOf(ch), ti = JONG.indexOf(ch)
    let s: Sample | null = null
    if (ci >= 0) s = this.pick('cho', ci, { cho: ci, jung: 0, jong: 0 })
    if (!s && ti > 0) s = this.pick('jong', ti, { cho: 11, jung: 0, jong: ti })
    if (!s && ji >= 0) s = this.pick('jung', ji, { cho: 11, jung: ji, jong: 0 })
    if (!s) return null
    const h = 0.6, w = clamp((s.box.w / s.box.h) * h, 0.12, 0.8)
    const into = { x: 0.5 - w / 2, y: 0.5 - h / 2 + 0.04, w, h }
    if (s.box.w / s.box.h > 2.2) { into.h = 0.6 * (0.8 / (s.box.w / s.box.h)); into.w = 0.8; into.x = 0.1; into.y = 0.5 - into.h / 2 }
    return { parts: [this.place(s, s.slot, s.syl, into)], usedRef: false }
  }
}

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)) }
