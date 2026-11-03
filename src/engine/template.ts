import layoutV1 from '../data/template-layout.json'
import layoutV2 from '../data/template-layout-v2.json'

export interface CellDef {
  index: number
  char: string | null
  cell: [number, number, number, number] // x, y, w, h (mm)
  skipMark: [number, number, number] // cx, cy, r (mm)
}
export interface SheetDef { sheet: number; kind: 'quick' | 'standard' | 'kids' | 'supplement'; qr: string; cells: CellDef[] }
export interface TemplateLayout {
  version: string
  page: [number, number]
  aruco: { dictionary: string; size: number; markers: Record<string, { origin: [number, number]; position: string }> }
  dropoutColor: string
  sheets: SheetDef[]
}

// v2: 칸 배치는 v1과 같고 글자만 다르다 (가나다…하, 자주 쓰는 글자 위주). 예전에 인쇄한 v1 시트도 계속 읽는다.
export const LAYOUTS: Record<number, TemplateLayout> = {
  1: layoutV1 as unknown as TemplateLayout,
  2: layoutV2 as unknown as TemplateLayout,
}
export const TEMPLATE_VERSION = 2
export const LAYOUT = LAYOUTS[TEMPLATE_VERSION]
export const PX_PER_MM = 10
export const PAGE_W = LAYOUT.page[0] * PX_PER_MM
export const PAGE_H = LAYOUT.page[1] * PX_PER_MM

export type Tier = 'quick' | 'standard' | 'kids' | 'letter'
export const TIERS: Record<Tier, { label: string; sheets: number[]; minutes: number; hangul: number; desc: string; extra: string; pdf: string; preview: string; minDraw: number }> = {
  quick: { label: '빠른 모드', sheets: [1], minutes: 7, hangul: 90, desc: '한 장, 100칸. 처음이라면 여기서 시작하세요.', extra: '숫자만', pdf: 'jaguk-template-v2.pdf', preview: 'sheet-1.png', minDraw: 30 },
  standard: { label: '일반 모드', sheets: [1, 2, 3, 4], minutes: 25, hangul: 225, desc: '네 장, 영문과 기호까지. 자모 모양을 모두 직접 받아 더 닮습니다.', extra: '영문 52자, 기호 32자', pdf: 'jaguk-template-v2.pdf', preview: 'sheet-1.png', minDraw: 30 },
  kids: { label: '큰 칸 모드', sheets: [11, 12], minutes: 12, hangul: 50, desc: '저학년·처음 쓰는 아이용. 칸이 크고(28mm) 아는 글자 위주예요. 1장만 써도 돼요.', extra: '숫자만 (2번 시트)', pdf: 'jaguk-template-kids-v2.pdf', preview: 'sheet-kids.png', minDraw: 15 },
  letter: { label: '손편지 모드', sheets: [21], minutes: 10, hangul: 0, desc: '편지·공책 사진에서 글자를 골라 만들어요.', extra: '사진에 있는 것만', pdf: 'jaguk-template-v2.pdf', preview: 'sheet-1.png', minDraw: 0 },
}

// ── 보충 시트: 일반 모드 2번 시트와 같은 칸 배치(18mm, 8×10)에 고칠 글자만 담는다 ──
export const SUPP_BASE = 100
export const SUPP_MAX = 80
const suppChars = new Map<number, string[]>()

export function isSupplement(no: number) { return no >= SUPP_BASE }
/** 화면에 보일 시트 이름 */
export function sheetLabel(no: number) { return isSupplement(no) ? suppLabel(no) : no >= 11 && no <= 12 ? `큰 칸 ${no - 10}번 시트` : no === 21 ? '손편지에서 고른 글자' : `${no}번 시트` }
export function suppLabel(no: number) { return `보충 시트 ${no - SUPP_BASE}` }

export function registerSupplement(no: number, chars: string[]) { suppChars.set(no, chars.slice(0, SUPP_MAX)) }

function supplementDef(no: number, chars: string[]): SheetDef {
  const base = LAYOUTS[1].sheets.find((s) => s.sheet === 2)!
  const n = no - SUPP_BASE
  return {
    sheet: no, kind: 'supplement', qr: encodeSuppQr(n, chars),
    cells: chars.slice(0, SUPP_MAX).map((ch, k) => ({ ...base.cells[k], index: 1000 + (n - 1) * SUPP_MAX + k + 1, char: ch })),
  }
}

export function sheetDef(no: number, ver: number = TEMPLATE_VERSION): SheetDef | undefined {
  if (isSupplement(no)) {
    const chars = suppChars.get(no)
    return chars ? supplementDef(no, chars) : undefined
  }
  return (LAYOUTS[ver] ?? LAYOUT).sheets.find((s) => s.sheet === no)
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

export interface QrInfo { no: number; ver?: number; chars?: string[] }

/** QR 문자열 → 시트 번호 (보충 시트면 글자 목록도) */
export function parseQrInfo(text: string): QrInfo | null {
  const t = text.trim()
  const m = /^JAGUK\|v(\d+)\|(quick|standard|kids)\|(\d{2})\/(\d{2})$/.exec(t)
  if (m) {
    const ver = parseInt(m[1], 10)
    return LAYOUTS[ver] ? { no: parseInt(m[3], 10), ver } : null
  }
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
