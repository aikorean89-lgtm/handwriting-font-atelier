// 내 글씨 분석: 직접 쓴 한글 칸으로 크기·위치·기울기·굵기·비율·자모 일관성을 재고 교정 포인트를 고른다
import { inkBox } from './bitmap'
import { JUNG, decompose, isHangul } from './hangul'
import { Library, type SourceCell } from './model'
import { penWidth } from './punct'
import { REF, ensureRefFont, refMasks } from './refmask'

export interface Metric {
  key: string
  title: string
  score: 1 | 2 | 3 // 3 잘함, 2 보통, 1 연습
  value: string // 사람이 읽는 측정값
  say: string // 한 줄 풀이
  tip?: string // 연습 방법
}
export interface Report { count: number; metrics: Metric[]; practice: string[]; best: Metric[]; work: Metric[] }

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
const std = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) }
const cv = (a: number[]) => (mean(a) ? std(a) / mean(a) : 0)
const grade = (v: number, good: number, ok: number): 1 | 2 | 3 => (v <= good ? 3 : v <= ok ? 2 : 1)
const pct = (x: number) => `${Math.round(x * 100)}%`

/** 세로획 하나짜리 중성(ㅣㅏㅓㅑㅕ)의 기울기: 위가 오른쪽으로 기울면 +도 */
function slantOf(c: SourceCell): number | null {
  const s = decompose(c.char)
  if (!'ㅣㅏㅓㅑㅕ'.includes(JUNG[s.jung])) return null
  const { w, data } = c.bitmap
  let n = 0, sx = 0, sy = 0
  for (let i = 0; i < data.length; i++) if (data[i] && c.labels[i] === 2) { n++; sx += i % w; sy += (i / w) | 0 }
  if (n < 30) return null
  const mx = sx / n, my = sy / n
  let vxx = 0, vyy = 0, vxy = 0
  for (let i = 0; i < data.length; i++) if (data[i] && c.labels[i] === 2) { const dx = (i % w) - mx, dy = ((i / w) | 0) - my; vxx += dx * dx; vyy += dy * dy; vxy += dx * dy }
  if (vyy < 4 * vxx) return null // 세로로 길쭉하지 않으면 믿지 않는다
  return (-Math.atan(vxy / vyy) * 180) / Math.PI
}

export async function analyzeHandwriting(cellsIn: SourceCell[]): Promise<Report | null> {
  const cells = cellsIn.filter((c) => isHangul(c.char) && c.labels)
  if (cells.length < 8) return null
  await ensureRefFont(cells.map((c) => c.char).join(''))

  const size: number[] = [], cy: number[] = [], cx: number[] = [], pens: number[] = [], aspect: number[] = [], jongR: number[] = [], choR: number[] = [], slant: number[] = []
  const dev = new Map<string, number>()
  for (const c of cells) {
    const N = c.bitmap.w
    const b = inkBox(c.bitmap)
    if (!b) continue
    size.push(Math.max(b.w, b.h) / N)
    cy.push((b.y + b.h / 2) / N); cx.push((b.x + b.w / 2) / N)
    pens.push(penWidth([c.bitmap]) / N)
    const r = refMasks(c.char)
    aspect.push((b.w / b.h) / (r.box.w / r.box.h))
    const s = decompose(c.char)
    if (s.jong) {
      const jb = inkBox(c.bitmap, c.labels, 3)
      const rj = inkBox({ w: REF, h: REF, data: r.all }, r.slot.jong ?? undefined, 1)
      if (jb && rj) jongR.push((jb.h / b.h) / (rj.h / r.box.h))
    }
    if ('ㅏㅐㅑㅒㅓㅔㅕㅖㅣ'.includes(JUNG[s.jung])) {
      const cb = inkBox(c.bitmap, c.labels, 1)
      const rc = inkBox({ w: REF, h: REF, data: r.all }, r.slot.cho, 1)
      if (cb && rc) choR.push((cb.w / b.w) / (rc.w / r.box.w))
    }
    const sl = slantOf(c)
    if (sl != null) slant.push(sl)
  }
  const ms = mean(size), mcy = mean(cy)
  cells.forEach((c, i) => {
    if (i >= size.length) return
    dev.set(c.char, (dev.get(c.char) ?? 0) + Math.abs(size[i] - ms) / Math.max(0.01, ms) + Math.abs(cy[i] - mcy) * 3)
  })

  const lib = new Library(cells)
  const samples = lib.samples
  const outShare = samples.length ? samples.filter((s) => s.outlier).length / samples.length : 0
  for (const s of samples) {
    const ch = cells.find((c) => s.key.startsWith(`${c.index}:`))?.char
    if (ch && s.outlier) dev.set(ch, (dev.get(ch) ?? 0) + 1)
  }

  const metrics: Metric[] = []
  const sizeCv = cv(size)
  metrics.push({ key: 'size', title: '글자 크기', score: grade(sizeCv, 0.07, 0.12), value: `들쭉날쭉 ${pct(sizeCv)}`,
    say: sizeCv <= 0.07 ? '글자 크기가 고르게 맞아요.' : sizeCv <= 0.12 ? '글자 크기가 조금씩 달라요.' : '글자마다 크기 차이가 커요.',
    tip: '칸의 십자선을 기준으로, 모든 글자를 칸의 70% 정도 크기로 써 보세요.' })
  const posSd = Math.max(std(cy), std(cx) * 0.8)
  metrics.push({ key: 'pos', title: '줄 맞춤', score: grade(posSd, 0.03, 0.055), value: `흔들림 ${pct(posSd)}`,
    say: posSd <= 0.03 ? '글자가 같은 높이에 가지런히 놓여요.' : posSd <= 0.055 ? '글자가 조금씩 오르내려요.' : '글자 높이가 많이 오르내려요.',
    tip: '글자의 가운데를 칸의 가로 점선에 맞춘다고 생각하며 써 보세요.' })
  if (slant.length >= 4) {
    const ms2 = mean(slant), sd2 = std(slant)
    const a = Math.abs(ms2)
    metrics.push({ key: 'slant', title: '기울기', score: (a <= 3 && sd2 <= 5 ? 3 : a <= 7 && sd2 <= 8 ? 2 : 1), value: `${ms2 >= 0 ? '오른쪽' : '왼쪽'}으로 ${a.toFixed(1)}°`,
      say: a <= 3 ? (sd2 <= 5 ? '세로획이 바르게 서 있어요.' : '세로획 기울기가 글자마다 달라요.') : `세로획이 ${ms2 > 0 ? '오른쪽' : '왼쪽'}으로 기울어요.`,
      tip: 'ㅣ, ㅏ의 세로획을 칸의 세로 점선과 나란하게 내려 그어 보세요.' })
  }
  const penCv = cv(pens)
  metrics.push({ key: 'pen', title: '획 굵기', score: grade(penCv, 0.12, 0.2), value: `들쭉날쭉 ${pct(penCv)}`,
    say: penCv <= 0.12 ? '획 굵기가 일정해요.' : '글자마다 획 굵기가 달라요. 펜을 누르는 힘이 바뀌는 것 같아요.',
    tip: '같은 펜으로, 같은 힘으로 천천히 써 보세요.' })
  const asp = mean(aspect)
  metrics.push({ key: 'shape', title: '글자 모양(폭)', score: (asp >= 0.88 && asp <= 1.14 ? 3 : asp >= 0.76 && asp <= 1.3 ? 2 : 1), value: `인쇄체의 ${pct(asp)}`,
    say: asp < 0.88 ? '글자가 홀쭉한 편이에요.' : asp > 1.14 ? '글자가 납작하고 넓은 편이에요.' : '글자 폭과 높이의 비율이 알맞아요.',
    tip: asp < 0.88 ? '자음과 모음 사이를 조금 더 띄워 글자를 옆으로 넓혀 보세요.' : asp > 1.14 ? '자음과 모음을 조금 더 붙이고 위아래로 길게 써 보세요.' : undefined })
  if (jongR.length >= 4) {
    const j = mean(jongR)
    metrics.push({ key: 'jong', title: '받침 크기', score: (j >= 0.85 && j <= 1.2 ? 3 : j >= 0.7 && j <= 1.4 ? 2 : 1), value: `인쇄체의 ${pct(j)}`,
      say: j < 0.85 ? '받침이 작은 편이에요.' : j > 1.2 ? '받침이 큰 편이에요.' : '받침 크기가 알맞아요.',
      tip: j < 0.85 ? '받침을 윗부분 너비만큼 넉넉하게 써 보세요.' : j > 1.2 ? '받침을 조금 작게, 윗부분 아래에 단정하게 받쳐 보세요.' : undefined })
  }
  if (choR.length >= 4) {
    const c2 = mean(choR)
    metrics.push({ key: 'cho', title: '자음:모음 비율', score: (c2 >= 0.85 && c2 <= 1.2 ? 3 : c2 >= 0.7 && c2 <= 1.4 ? 2 : 1), value: `자음 폭 인쇄체의 ${pct(c2)}`,
      say: c2 < 0.85 ? '가, 나처럼 옆에 모음이 오는 글자에서 자음이 좁은 편이에요.' : c2 > 1.2 ? '옆에 모음이 오는 글자에서 자음이 넓은 편이에요.' : '자음과 모음의 폭 비율이 알맞아요.',
      tip: c2 < 0.85 ? '자음을 조금 더 넓게 써서 모음과 균형을 맞춰 보세요.' : c2 > 1.2 ? '자음을 조금 좁게 써서 모음이 들어갈 자리를 남겨 보세요.' : undefined })
  }
  metrics.push({ key: 'cons', title: '자모 모양 일관성', score: grade(outShare, 0.08, 0.16), value: `튀는 자모 ${pct(outShare)}`,
    say: outShare <= 0.08 ? '같은 자모를 매번 비슷하게 써요. 폰트가 깔끔하게 나와요.' : '같은 자모를 글자마다 다르게 쓰는 경우가 있어요.',
    tip: '아래 ‘연습할 글자’를 천천히 다시 써 보세요.' })

  const practice = [...dev.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([ch]) => ch)
  const sorted = [...metrics].sort((a, b) => b.score - a.score)
  return {
    count: cells.length, metrics, practice,
    best: sorted.filter((m) => m.score === 3).slice(0, 2),
    work: [...metrics].filter((m) => m.score < 3).sort((a, b) => a.score - b.score).slice(0, 3),
  }
}
