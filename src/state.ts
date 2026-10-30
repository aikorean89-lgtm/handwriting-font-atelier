// 프로젝트 상태와 IndexedDB 저장 (계정 없이 이어하기)
import { get, set, del } from 'idb-keyval'
import { type Bitmap, packBits, unpackBits } from './engine/bitmap'
import { type CellState } from './engine/sheet'
import { type Tier, SUPP_BASE, registerSupplement } from './engine/template'
import type { BuildCell, BuildOptions } from './engine/build'

export type Step = 'home' | 'tier' | 'template' | 'capture' | 'review' | 'jamo' | 'build' | 'play' | 'export' | 'gallery'

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
export interface Sheet { no: number; preview: string; sharpness: number; capturedAt: number; cells: Cell[] }
export interface Project {
  tier: Tier
  fontName: string
  sheets: Record<number, Sheet>
  step: Step
  flagged: string[] // 플레이그라운드에서 표시한 어색한 글자
  updatedAt: number
  settings?: BuildOptions // 굵기·자간
  supps?: Record<number, string[]> // 만든 보충 시트 (시트 번호 → 글자)
}

export function newProject(tier: Tier): Project {
  return { tier, fontName: '', sheets: {}, step: 'template', flagged: [], updatedAt: Date.now() }
}

interface StoredCell { index: number; char: string | null; state: CellState; include: boolean; w: number; bits: Uint8Array; labels?: Uint8Array; labelsEdited?: boolean; segCost?: number }
interface StoredProject extends Omit<Project, 'sheets'> { sheets: Record<number, Omit<Sheet, 'cells'> & { cells: StoredCell[] }> }

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
    }
  } catch { return null }
}

export async function clearProject() { try { await del(KEY) } catch { /* noop */ } }

export function allCells(p: Project): Cell[] {
  return Object.values(p.sheets).sort((a, b) => a.no - b.no).flatMap((s) => s.cells)
}

/** 폰트에 넣을 칸 (보충 시트는 번호가 커서 뒤에 오고, 같은 글자면 뒤의 것이 이긴다) */
export function buildCells(p: Project): BuildCell[] {
  return allCells(p).filter((c) => c.include && c.char).map((c) => ({ index: c.index, char: c.char!, bitmap: c.bitmap, labels: c.labels, segCost: c.segCost, edited: c.labelsEdited }))
}

export function suppNos(p: Project): number[] {
  const s = new Set([...Object.keys(p.supps ?? {}).map(Number), ...Object.keys(p.sheets).map(Number).filter((n) => n >= SUPP_BASE)])
  return [...s].sort((a, b) => a - b)
}
