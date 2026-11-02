// 프로젝트 상태와 IndexedDB 저장 (계정 없이 이어하기)
import { get, set, del } from 'idb-keyval'
import { type Bitmap, packBits, unpackBits } from './engine/bitmap'
import { type CellState } from './engine/sheet'
import { type Tier, SUPP_BASE, registerSupplement } from './engine/template'
import type { BuildCell, BuildOptions } from './engine/build'
import { isHangul } from './engine/hangul'
import { ensureRefFont } from './engine/refmask'
import { SEG_VERSION, segmentScored } from './engine/segment'

export type Step = 'home' | 'tier' | 'template' | 'capture' | 'draw' | 'review' | 'jamo' | 'build' | 'play' | 'export' | 'gallery'

export interface Cell {
  index: number
  char: string | null
  state: CellState
  include: boolean // 폰트에 쓸지
  bitmap: Bitmap
  labels?: Uint8Array // 한글 자모 라벨 (1 초, 2 중, 3 종)
  labelsEdited?: boolean
  segCost?: number // 자동 분리 비용 (높을수록 의심)
}
export interface Sheet { no: number; ver?: number /* 템플릿 버전, 없으면 v1 */; drawn?: boolean /* 화면에 직접 쓴 시트 */; preview: string; sharpness: number; capturedAt: number; cells: Cell[] }
export interface Project {
  tier: Tier
  fontName: string
  sheets: Record<number, Sheet>
  step: Step
  flagged: string[] // 플레이그라운드에서 표시한 어색한 글자
  updatedAt: number
  settings?: BuildOptions // 굵기·자간
  supps?: Record<number, string[]> // 만든 보충 시트 (시트 번호 → 글자)
  segVersion?: number // 자동 자모 분리를 한 방식의 버전
  edits?: Record<string, Bitmap> // 글자 손보기로 직접 고친 글자 (폰트를 만들 때 가장 나중에 덮어쓴다)
}

export function newProject(tier: Tier): Project {
  return { tier, fontName: '', sheets: {}, step: 'template', flagged: [], updatedAt: Date.now(), segVersion: SEG_VERSION }
}

/** 예전 방식으로 나눈 자모를 새 방식으로 다시 나눈다 (사용자가 손으로 고친 글자는 그대로) */
export async function resegment(p: Project, onProgress?: (done: number, total: number) => void): Promise<Project> {
  const todo = allCells(p).filter((c) => c.include && c.char && isHangul(c.char) && !c.labelsEdited)
  await ensureRefFont(todo.map((c) => c.char).join(''))
  const fresh = new Map<number, { labels: Uint8Array; segCost: number }>()
  for (let i = 0; i < todo.length; i++) {
    const c = todo[i]
    const r = segmentScored(c.bitmap, c.char!)
    fresh.set(c.index, { labels: r.labels, segCost: r.cost })
    if (i % 8 === 0) { onProgress?.(i, todo.length); await new Promise((res) => setTimeout(res, 0)) }
  }
  onProgress?.(todo.length, todo.length)
  const sheets = Object.fromEntries(Object.entries(p.sheets).map(([k, s]) => [k, {
    ...s, cells: s.cells.map((c) => { const f = fresh.get(c.index); return f ? { ...c, ...f } : c }),
  }]))
  return { ...p, sheets, segVersion: SEG_VERSION }
}

export function needsResegment(p: Project): boolean { return (p.segVersion ?? 1) < SEG_VERSION && Object.keys(p.sheets).length > 0 }

interface StoredCell { index: number; char: string | null; state: CellState; include: boolean; w: number; bits: Uint8Array; labels?: Uint8Array; labelsEdited?: boolean; segCost?: number }
interface StoredProject extends Omit<Project, 'sheets' | 'edits'> { sheets: Record<number, Omit<Sheet, 'cells'> & { cells: StoredCell[] }>; edits?: Record<string, { w: number; bits: Uint8Array }> }

const KEY = 'jaguk.project.v1'

function pack2(labels: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(labels.length / 4))
  for (let i = 0; i < labels.length; i++) out[i >> 2] |= (labels[i] & 3) << ((i & 3) * 2)
  return out
}
function unpack2(b: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = (b[i >> 2] >> ((i & 3) * 2)) & 3
  return out
}

export async function saveProject(p: Project) {
  const sp: StoredProject = {
    ...p,
    sheets: Object.fromEntries(Object.entries(p.sheets).map(([k, s]) => [k, {
      ...s,
      cells: s.cells.map((c) => ({
        index: c.index, char: c.char, state: c.state, include: c.include, w: c.bitmap.w, bits: packBits(c.bitmap.data),
        labels: c.labels ? pack2(c.labels) : undefined, labelsEdited: c.labelsEdited, segCost: c.segCost,
      })),
    }])),
    edits: p.edits ? Object.fromEntries(Object.entries(p.edits).map(([ch, bm]) => [ch, { w: bm.w, bits: packBits(bm.data) }])) : undefined,
  }
  try { await set(KEY, sp) } catch { /* 저장 공간 부족 시 무시: 화면 작업은 계속 */ }
}

export async function loadProject(): Promise<Project | null> {
  try {
    const sp = (await get(KEY)) as StoredProject | undefined
    if (!sp) return null
    for (const [no, chars] of Object.entries(sp.supps ?? {})) registerSupplement(+no, chars)
    return {
      ...sp,
      sheets: Object.fromEntries(Object.entries(sp.sheets).map(([k, s]) => [k, {
        ...s,
        cells: s.cells.map((c) => {
          const n = c.w * c.w
          return {
            index: c.index, char: c.char, state: c.state, include: c.include,
            bitmap: { w: c.w, h: c.w, data: unpackBits(c.bits, n) },
            labels: c.labels ? unpack2(c.labels, n) : undefined, labelsEdited: c.labelsEdited, segCost: c.segCost,
          }
        }),
      }])),
      edits: sp.edits ? Object.fromEntries(Object.entries(sp.edits).map(([ch, e]) => [ch, { w: e.w, h: e.w, data: unpackBits(e.bits, e.w * e.w) }])) : undefined,
    }
  } catch { return null }
}

export async function clearProject() { try { await del(KEY) } catch { /* noop */ } }

export function allCells(p: Project): Cell[] {
  return Object.values(p.sheets).sort((a, b) => a.no - b.no).flatMap((s) => s.cells)
}

/** 폰트에 넣을 칸 (보충 시트는 번호가 커서 뒤에 오고, 같은 글자면 뒤의 것이 이긴다) */
export function buildCells(p: Project): BuildCell[] {
  const cells: BuildCell[] = allCells(p).filter((c) => c.include && c.char).map((c) => ({ index: c.index, char: c.char!, bitmap: c.bitmap, labels: c.labels, segCost: c.segCost, edited: c.labelsEdited }))
  for (const [ch, bm] of Object.entries(p.edits ?? {})) cells.push({ index: -2, char: ch, bitmap: bm, raw: true })
  return cells
}

export function suppNos(p: Project): number[] {
  const s = new Set([...Object.keys(p.supps ?? {}).map(Number), ...Object.keys(p.sheets).map(Number).filter((n) => n >= SUPP_BASE)])
  return [...s].sort((a, b) => a - b)
}
