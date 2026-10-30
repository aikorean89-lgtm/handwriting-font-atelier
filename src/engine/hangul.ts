// 한글 자모 분해·조합 규칙과 8·4·4벌 위치 변형 분류

export const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'.split('')
export const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'.split('')
export const JONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'.split('')]

export const SBASE = 0xac00
export const SCOUNT = 11172

export type Slot = 'cho' | 'jung' | 'jong'
export const SLOTS: Slot[] = ['cho', 'jung', 'jong']
export type Shape = 'V' | 'H' | 'M'

export interface Syl { cho: number; jung: number; jong: number }

export function isHangul(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0
  return c >= SBASE && c < SBASE + SCOUNT
}

export function decompose(ch: string): Syl {
  const i = (ch.codePointAt(0) ?? 0) - SBASE
  return { cho: Math.floor(i / 588), jung: Math.floor((i % 588) / 28), jong: i % 28 }
}

export function compose(s: Syl): string {
  return String.fromCodePoint(SBASE + (s.cho * 21 + s.jung) * 28 + s.jong)
}

const VERT = new Set('ㅏㅐㅑㅒㅓㅔㅕㅖㅣ')
const HOR = new Set('ㅗㅛㅜㅠㅡ')

export function shapeOf(jung: number): Shape {
  const v = JUNG[jung]
  if (VERT.has(v)) return 'V'
  if (HOR.has(v)) return 'H'
  return 'M'
}

/** 초성 8벌 (1–8) */
export function choVariant(jung: number, hasJong: boolean): number {
  const v = JUNG[jung]
  if (!hasJong) {
    if (VERT.has(v)) return 1
    if ('ㅗㅛㅡ'.includes(v)) return 2
    if ('ㅜㅠ'.includes(v)) return 3
    if ('ㅘㅙㅚㅢ'.includes(v)) return 4
    return 5
  }
  if (VERT.has(v)) return 6
  if (HOR.has(v)) return 7
  return 8
}

/** 중성 4벌 (1–4): 받침 유무 × 초성이 ㄱ·ㅋ인지 */
export function jungVariant(cho: number, hasJong: boolean): number {
  const gk = CHO[cho] === 'ㄱ' || CHO[cho] === 'ㅋ'
  if (gk) return hasJong ? 3 : 1
  return hasJong ? 4 : 2
}

/** 종성 4벌 (1–4) */
export function jongVariant(jung: number): number {
  const v = JUNG[jung]
  if ('ㅏㅑㅘ'.includes(v)) return 1
  if ('ㅓㅕㅚㅝㅟㅢㅣ'.includes(v)) return 2
  if ('ㅐㅒㅔㅖㅙㅞ'.includes(v)) return 3
  return 4
}

export function variantOf(slot: Slot, s: Syl): number {
  if (slot === 'cho') return choVariant(s.jung, s.jong > 0)
  if (slot === 'jung') return jungVariant(s.cho, s.jong > 0)
  return jongVariant(s.jung)
}

export function jamoIndex(slot: Slot, s: Syl): number {
  return slot === 'cho' ? s.cho : slot === 'jung' ? s.jung : s.jong
}

export function jamoChar(slot: Slot, idx: number): string {
  return slot === 'cho' ? CHO[idx] : slot === 'jung' ? JUNG[idx] : JONG[idx]
}

/** 원하는 벌이 없을 때 시도할 순서 */
export const CHO_FALLBACK: Record<number, number[]> = {
  1: [1, 6, 4, 2, 3, 5, 8, 7], 2: [2, 3, 7, 4, 5, 1, 8, 6], 3: [3, 2, 7, 5, 4, 8, 1, 6],
  4: [4, 5, 8, 1, 2, 3, 6, 7], 5: [5, 4, 8, 3, 2, 1, 6, 7], 6: [6, 1, 8, 4, 7, 2, 3, 5],
  7: [7, 2, 3, 8, 6, 4, 5, 1], 8: [8, 4, 5, 6, 7, 1, 2, 3],
}
export const JUNG_FALLBACK: Record<number, number[]> = {
  1: [1, 2, 3, 4], 2: [2, 1, 4, 3], 3: [3, 4, 1, 2], 4: [4, 3, 2, 1],
}
export const JONG_FALLBACK: Record<number, number[]> = {
  1: [1, 2, 3, 4], 2: [2, 1, 3, 4], 3: [3, 2, 1, 4], 4: [4, 2, 1, 3],
}

/** 겹자음·쌍자음을 두 자모로 나누기 (빠진 자모를 만들 때 사용) */
export const CHO_SPLIT: Record<string, [string, string]> = {
  'ㄲ': ['ㄱ', 'ㄱ'], 'ㄸ': ['ㄷ', 'ㄷ'], 'ㅃ': ['ㅂ', 'ㅂ'], 'ㅆ': ['ㅅ', 'ㅅ'], 'ㅉ': ['ㅈ', 'ㅈ'],
}
export const JONG_SPLIT: Record<string, [string, string]> = {
  'ㄲ': ['ㄱ', 'ㄱ'], 'ㄳ': ['ㄱ', 'ㅅ'], 'ㄵ': ['ㄴ', 'ㅈ'], 'ㄶ': ['ㄴ', 'ㅎ'], 'ㄺ': ['ㄹ', 'ㄱ'],
  'ㄻ': ['ㄹ', 'ㅁ'], 'ㄼ': ['ㄹ', 'ㅂ'], 'ㄽ': ['ㄹ', 'ㅅ'], 'ㄾ': ['ㄹ', 'ㅌ'], 'ㄿ': ['ㄹ', 'ㅍ'],
  'ㅀ': ['ㄹ', 'ㅎ'], 'ㅄ': ['ㅂ', 'ㅅ'], 'ㅆ': ['ㅅ', 'ㅅ'],
}

/** 한글 호환 자모 U+3131–U+3163 */
export const COMPAT_JAMO: string[] = Array.from({ length: 0x3163 - 0x3131 + 1 }, (_, i) => String.fromCodePoint(0x3131 + i))
