import layoutJson from '../data/template-layout.json'

export interface CellDef {
  index: number
  char: string | null
  cell: [number, number, number, number] // x, y, w, h (mm)
  skipMark: [number, number, number] // cx, cy, r (mm)
}
export interface SheetDef { sheet: number; kind: 'quick' | 'standard' | 'supplement'; qr: string; cells: CellDef[] }
export interface TemplateLayout {
  version: string
  page: [number, number]
  aruco: { dictionary: string; size: number; markers: Record<string, { origin: [number, number]; position: string }> }
  dropoutColor: string
  sheets: SheetDef[]
}

export const LAYOUT = layoutJson as unknown as TemplateLayout
export const PX_PER_MM = 10
export const PAGE_W = LAYOUT.page[0] * PX_PER_MM
export const PAGE_H = LAYOUT.page[1] * PX_PER_MM

export type Tier = 'quick' | 'standard'
export const TIERS: Record<Tier, { label: string; sheets: number[]; minutes: number; hangul: number; desc: string }> = {
  quick: { label: '빠른 폰트', sheets: [1], minutes: 7, hangul: 90, desc: '한 장, 100칸. 처음이라면 여기서 시작하세요.' },
  standard: { label: '표준 폰트', sheets: [1, 2, 3, 4], minutes: 25, hangul: 225, desc: '네 장, 영문과 기호까지. 자모 모양을 모두 직접 받아 더 닮습니다.' },
}

// ── 보충 시트: 표준 2번 시트와 같은 칸 배치(18mm, 8×10)에 고칠 글자만 담는다 ──
export const SUPP_BASE = 100
export const SUPP_MAX = 80
const suppChars = new Map<number, string[]>()

export function isSupplement(no: number) { return no >= SUPP_BASE }
export function suppLabel(no: number) { return `보충 시트 ${no - SUPP_BASE}` }

export function registerSupplement(no: number, chars: string[]) { suppChars.set(no, chars.slice(0, SUPP_MAX)) }

function supplementDef(no: number, chars: string[]): SheetDef {
  const base = LAYOUT.sheets.find((s) => s.sheet === 2)!
  const n = no - SUPP_BASE
  return {
    sheet: no, kind: 'supplement', qr: encodeSuppQr(n, chars),
    cells: chars.slice(0, SUPP_MAX).map((ch, k) => ({ ...base.cells[k], index: 1000 + (n - 1) * SUPP_MAX + k + 1, char: ch })),
  }
}

export function sheetDef(no: number): SheetDef | undefined {
  if (isSupplement(no)) {
    const chars = suppChars.get(no)
    return chars ? supplementDef(no, chars) : undefined
  }
  return LAYOUT.sheets.find((s) => s.sheet === no)
}

/** 글자 → 영숫자 QR 부호 (한 글자당 base36 세 자리). 한글은 음절 번호, 그 밖은 11172 + 코드 */
export function encodeSuppQr(n: number, chars: string[]): string {
  const body = chars.map((ch) => {
    const cp = ch.codePointAt(0)!
    const v = cp >= 0xac00 && cp <= 0xd7a3 ? cp - 0xac00 : 11172 + Math.min(cp, 33000)
    return v.toString(36).toUpperCase().padStart(3, '0')
  }).join('')
  return `JAGUK:V1:SUPP:${String(n).padStart(2, '0')}:${body}`
}

function decodeSuppBody(body: string): string[] {
  const out: string[] = []
  for (let i = 0; i + 3 <= body.length; i += 3) {
    const v = parseInt(body.slice(i, i + 3), 36)
    out.push(String.fromCodePoint(v < 11172 ? 0xac00 + v : v - 11172))
  }
  return out
}

export interface QrInfo { no: number; chars?: string[] }

/** QR 문자열 → 시트 번호 (보충 시트면 글자 목록도) */
export function parseQrInfo(text: string): QrInfo | null {
  const t = text.trim()
  const m = /^JAGUK\|v(\d+)\|(quick|standard)\|(\d{2})\/(\d{2})$/.exec(t)
  if (m) return { no: parseInt(m[3], 10) }
  const s = /^JAGUK:V1:SUPP:(\d{2}):([0-9A-Z]+)$/.exec(t.toUpperCase())
  if (s) {
    const no = SUPP_BASE + parseInt(s[1], 10)
    const chars = decodeSuppBody(s[2])
    registerSupplement(no, chars)
    return { no, chars }
  }
  return null
}

export function parseQr(text: string): number | null {
  return parseQrInfo(text)?.no ?? null
}

/** 마커 4개 각각의 바깥→안 모서리 좌표(mm). OpenCV ArUco 모서리 순서: TL, TR, BR, BL */
export function markerCornersMm(id: number): [number, number][] {
  const o = LAYOUT.aruco.markers[String(id)].origin
  const s = LAYOUT.aruco.size
  return [[o[0], o[1]], [o[0] + s, o[1]], [o[0] + s, o[1] + s], [o[0], o[1] + s]]
}

/** 수동 지정용: 각 마커의 종이 바깥쪽 모서리 */
export function markerOuterCornerMm(id: number): [number, number] {
  const c = markerCornersMm(id)
  return c[id] // id 0=TL의 TL, 1=TR의 TR, 2=BR의 BR, 3=BL의 BL
}
