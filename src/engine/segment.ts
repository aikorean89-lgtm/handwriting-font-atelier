// 손글씨 음절 비트맵 → 초(1)·중(2)·종(3) 라벨 지도
import { type Bitmap, components, dilate, distanceTo, inkBox } from './bitmap'
import { REF, refMasks } from './refmask'

export const LABEL = { cho: 1, jung: 2, jong: 3 } as const
export const segDebug: { on: boolean; log: string[] } = { on: false, log: [] }

const dtCache = new Map<string, (Float32Array | null)[]>()

function slotDT(ch: string) {
  const hit = dtCache.get(ch)
  if (hit) return hit
  const m = refMasks(ch)
  const res = [
    distanceTo(m.slot.cho, REF, REF),
    distanceTo(m.slot.jung, REF, REF),
    m.slot.jong ? distanceTo(m.slot.jong, REF, REF) : null,
  ]
  dtCache.set(ch, res)
  return res
}

export function segment(bm: Bitmap, ch: string): Uint8Array { return segmentScored(bm, ch).labels }

/** 라벨과 함께 배치 비용(낮을수록 확실)을 돌려준다 */
export function segmentScored(bm: Bitmap, ch: string): { labels: Uint8Array; cost: number } {
  const labels = new Uint8Array(bm.w * bm.h)
  const box = inkBox(bm)
  if (!box) return { labels, cost: 9 }
  const ref = refMasks(ch)
  const dts = slotDT(ch)
  const nSlots = ref.slot.jong ? 3 : 2
  const slotMasks = [ref.slot.cho, ref.slot.jung, ref.slot.jong]
  // 손글씨 경계 상자 → 기준 경계 상자
  const sx = ref.box.w / box.w, sy = ref.box.h / box.h
  const toRef = (x: number, y: number) => {
    const rx = Math.min(REF - 1, Math.max(0, Math.round(ref.box.x + (x - box.x + 0.5) * sx)))
    const ry = Math.min(REF - 1, Math.max(0, Math.round(ref.box.y + (y - box.y + 0.5) * sy)))
    return ry * REF + rx
  }
  // 기준 글자의 자모별 상대 상자와 잉크 비율
  type B = { x0: number; y0: number; x1: number; y1: number }
  const refBox: B[] = [], refFrac: number[] = []
  let refTot = 0
  const refCnt = [0, 0, 0]
  for (let k = 0; k < nSlots; k++) {
    const m = slotMasks[k]!
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0
    for (let y = 0; y < REF; y++) for (let x = 0; x < REF; x++) {
      if (!m[y * REF + x]) continue
      refCnt[k]++
      const nx = (x - ref.box.x) / ref.box.w, ny = (y - ref.box.y) / ref.box.h
      x0 = Math.min(x0, nx); y0 = Math.min(y0, ny); x1 = Math.max(x1, nx); y1 = Math.max(y1, ny)
    }
    refBox.push({ x0, y0, x1, y1 }); refTot += refCnt[k]
  }
  for (let k = 0; k < nSlots; k++) refFrac.push(refCnt[k] / Math.max(1, refTot))

  // 모양 비교용: 기준 자모 마스크를 넉넉히 넓힌 것
  const fat = [0, 1, 2].map((k) => (k < nSlots ? dilate(slotMasks[k]!, REF, REF, 5) : null))
  const { labels: comp, sizes } = components(bm)
  const nComp = sizes.length - 1
  const samp: number[][] = Array.from({ length: nComp + 1 }, () => []) // 요소별 표본 화소 (정규화 x, y)
  const sampSplit: number[][][] = Array.from({ length: nComp + 1 }, () => [[], [], [], []])
  // 화소별 가장 가까운 영역 (붙은 획을 나눌 때와 작은 조각에 사용)
  const best = new Uint8Array(bm.w * bm.h)
  const votes: number[][] = Array.from({ length: nComp + 1 }, () => [0, 0, 0, 0])
  const dsum: number[][] = Array.from({ length: nComp + 1 }, () => [0, 0, 0, 0])
  // 요소별 상대 상자, 나눌 때의 자모별 상자
  const cb: B[] = Array.from({ length: nComp + 1 }, () => ({ x0: 1, y0: 1, x1: 0, y1: 0 }))
  const sb: B[][] = Array.from({ length: nComp + 1 }, () => [0, 1, 2, 3].map(() => ({ x0: 1, y0: 1, x1: 0, y1: 0 })))
  const grow = (b: B, x: number, y: number) => { if (x < b.x0) b.x0 = x; if (y < b.y0) b.y0 = y; if (x > b.x1) b.x1 = x; if (y > b.y1) b.y1 = y }
  let total = 0
  for (let y = 0; y < bm.h; y++) {
    for (let x = 0; x < bm.w; x++) {
      const i = y * bm.w + x
      if (!bm.data[i]) continue
      total++
      const r = toRef(x, y)
      let bk = 1, bd = Infinity
      for (let k = 0; k < nSlots; k++) {
        const d = dts[k]![r]
        dsum[comp[i]][k + 1] += d
        if (d < bd) { bd = d; bk = k + 1 }
      }
      best[i] = bk
      votes[comp[i]][bk]++
      const nx = (x - box.x) / box.w, ny = (y - box.y) / box.h
      grow(cb[comp[i]], nx, ny)
      grow(sb[comp[i]][bk], nx, ny)
      if ((x + y) % 3 === 0) { samp[comp[i]].push(nx, ny); sampSplit[comp[i]][bk].push(nx, ny) }
    }
  }
  // 큰 획 덩어리만 배치 탐색 (작은 점·삐침은 나중에)
  const order = Array.from({ length: nComp }, (_, i) => i + 1).sort((a, b) => sizes[b] - sizes[a])
  const big = order.filter((c) => sizes[c] >= Math.max(12, total * 0.012)).slice(0, 7)
  const canSplit = big.map((c) => {
    const v = votes[c]
    let parts = 0
    for (let k = 1; k <= nSlots; k++) if (v[k] >= sizes[c] * 0.15) parts++
    return parts >= 2
  })
  const choice = new Array<number>(big.length).fill(1)
  const bestChoice = choice.slice()
  let bestCost = Infinity
  const acc: B[] = [0, 1, 2, 3].map(() => ({ x0: 1, y0: 1, x1: 0, y1: 0 }))
  const ink = [0, 0, 0, 0]
  const iou = (a: B, b: B) => {
    const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
    const inter = ix * iy
    const ua = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter
    return ua > 0 ? inter / ua : 0
  }
  const evaluate = () => {
    // 다시 누적
    for (let k = 1; k <= nSlots; k++) { acc[k] = { x0: 1, y0: 1, x1: 0, y1: 0 }; ink[k] = 0 }
    let pen = 0
    big.forEach((c, j) => {
      const o = choice[j]
      if (o > 0) {
        const b = cb[c], a = acc[o]
        a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0); a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1)
        ink[o] += sizes[c]
      } else {
        pen += 0.3
        for (let k = 1; k <= nSlots; k++) {
          if (!votes[c][k]) continue
          const b = sb[c][k], a = acc[k]
          a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0); a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1)
          ink[k] += votes[c][k]
        }
      }
    })
    let cost = pen
    const bigInk = ink.reduce((s, v) => s + v, 0) || 1
    for (let k = 1; k <= nSlots; k++) if (!ink[k]) return Infinity
    // 자모마다 자기 상자에 맞춰 늘린 뒤 기준 모양 위에 떨어지는 비율
    const hit = [0, 0, 0, 0], cnt = [0, 0, 0, 0]
    const tally = (k: number, pts: number[]) => {
      const a = acc[k], r = refBox[k - 1], m = fat[k - 1]!
      const aw = Math.max(1e-3, a.x1 - a.x0), ah = Math.max(1e-3, a.y1 - a.y0)
      const rw = r.x1 - r.x0, rh = r.y1 - r.y0
      for (let t = 0; t < pts.length; t += 2) {
        const u = r.x0 + ((pts[t] - a.x0) / aw) * rw, v = r.y0 + ((pts[t + 1] - a.y0) / ah) * rh
        const px = Math.round(ref.box.x + u * ref.box.w), py = Math.round(ref.box.y + v * ref.box.h)
        cnt[k]++
        if (px >= 0 && py >= 0 && px < REF && py < REF && m[py * REF + px]) hit[k]++
      }
    }
    big.forEach((c, j) => {
      const o = choice[j]
      if (o > 0) tally(o, samp[c])
      else for (let k = 1; k <= nSlots; k++) if (sampSplit[c][k].length) tally(k, sampSplit[c][k])
    })
    for (let k = 1; k <= nSlots; k++) {
      const shape = cnt[k] ? hit[k] / cnt[k] : 0
      cost += 0.7 * (1 - iou(acc[k], refBox[k - 1])) + 1.2 * (1 - shape) + 0.6 * Math.abs(ink[k] / bigInk - refFrac[k - 1])
    }
    return cost
  }
  const dfs = (j: number) => {
    if (j === big.length) {
      const c = evaluate()
      if (segDebug.on) segDebug.log.push(`${choice.join('')} ${c.toFixed(3)}`)
      if (c < bestCost) { bestCost = c; for (let t = 0; t < big.length; t++) bestChoice[t] = choice[t] }
      return
    }
    for (let o = 1; o <= nSlots; o++) { choice[j] = o; dfs(j + 1) }
    if (canSplit[j]) { choice[j] = 0; dfs(j + 1) }
  }
  if (big.length) dfs(0)
  if (segDebug.on) segDebug.log.push(`big=${big.map((c) => sizes[c] + '@' + cb[c].x0.toFixed(2) + ',' + cb[c].y0.toFixed(2) + '-' + cb[c].x1.toFixed(2) + ',' + cb[c].y1.toFixed(2)).join(' ')} ref=${refBox.map((b) => [b.x0, b.y0, b.x1, b.y1].map((v) => v.toFixed(2)).join(',')).join(' | ')} frac=${refFrac.map((f) => f.toFixed(2))}`)
  const compLabel = new Array<number>(nComp + 1).fill(-1)
  if (isFinite(bestCost)) big.forEach((c, j) => { compLabel[c] = bestChoice[j] })
  for (let c = 1; c <= nComp; c++) {
    if (compLabel[c] !== -1) continue
    const v = votes[c]
    let bk = 1
    for (let k = 2; k <= nSlots; k++) if (v[k] > v[bk]) bk = k
    compLabel[c] = bk
  }
  for (let i = 0; i < labels.length; i++) {
    if (!bm.data[i]) continue
    const l = compLabel[comp[i]]
    labels[i] = l > 0 ? l : best[i]
  }
  cleanFragments(bm, labels, 0.18, 40)
  // 비어 있는 영역이 있으면 평균 거리가 가장 가까운 요소를 넘겨준다
  for (let k = 1; k <= nSlots; k++) {
    if (labels.some((l) => l === k)) continue
    let bc = -1, bd = Infinity
    for (let c = 1; c <= nComp; c++) {
      const md = dsum[c][k] / sizes[c]
      const from = compLabel[c]
      if (from > 0 && countLabel(labels, from) - sizes[c] <= 0) continue
      if (md < bd) { bd = md; bc = c }
    }
    if (bc > 0) for (let i = 0; i < labels.length; i++) if (comp[i] === bc) labels[i] = k
  }
  return { labels, cost: isFinite(bestCost) ? bestCost / nSlots : 9 }
}

function countLabel(labels: Uint8Array, k: number) {
  let n = 0
  for (let i = 0; i < labels.length; i++) if (labels[i] === k) n++
  return n
}

/** 탭한 위치의 획(같은 라벨로 이어진 덩어리)을 다음 자모로 넘긴다 */
export function cycleRegion(bm: Bitmap, labels: Uint8Array, x: number, y: number, nSlots: number): Uint8Array | null {
  const { w, h } = bm
  // 가장 가까운 잉크 화소 찾기 (반경 6)
  let start = -1, bd = Infinity
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
    const xx = x + dx, yy = y + dy
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
    const i = yy * w + xx
    if (!bm.data[i]) continue
    const d = dx * dx + dy * dy
    if (d < bd) { bd = d; start = i }
  }
  if (start < 0) return null
  const cur = labels[start]
  const next = (cur % nSlots) + 1
  const out = labels.slice()
  const stack = [start]
  out[start] = next
  while (stack.length) {
    const p = stack.pop()!
    const px = p % w, py = (p - px) / w
    for (let ddy = -1; ddy <= 1; ddy++) for (let ddx = -1; ddx <= 1; ddx++) {
      const nx = px + ddx, ny = py + ddy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const q = ny * w + nx
      if (bm.data[q] && out[q] === cur) { out[q] = next; stack.push(q) }
    }
  }
  return out
}

/** 같은 라벨끼리 이어진 작은 조각은 가장 많이 맞닿은 이웃 라벨로 합친다 (줄무늬 방지) */
function cleanFragments(bm: Bitmap, labels: Uint8Array, rel: number, abs: number) {
  const { w, h } = bm
  for (let pass = 0; pass < 3; pass++) {
    const seen = new Int32Array(w * h)
    let id = 0
    let changed = false
    const total = bm.data.reduce((s, v) => s + v, 0)
    for (let i = 0; i < w * h; i++) {
      if (!bm.data[i] || seen[i]) continue
      id++
      const lab = labels[i]
      const region: number[] = []
      const stack = [i]
      seen[i] = id
      const touch = [0, 0, 0, 0]
      while (stack.length) {
        const p = stack.pop()!
        region.push(p)
        const px = p % w, py = (p - px) / w
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const q = ny * w + nx
          if (!bm.data[q]) continue
          if (labels[q] === lab) { if (!seen[q]) { seen[q] = id; stack.push(q) } } else touch[labels[q]]++
        }
      }
      const limit = Math.max(abs, total * rel * 0.25)
      if (region.length >= limit) continue
      let best = 0
      for (let k = 1; k <= 3; k++) if (touch[k] > touch[best]) best = k
      if (best && touch[best] > 0) { for (const p of region) labels[p] = best; changed = true }
    }
    if (!changed) break
  }
}
