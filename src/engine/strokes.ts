// 붙여 쓴 글씨를 '획 조각'으로 나눈다: 뼈대(가운데 선)를 구해 갈림점에서 끊고, 잉크를 가장 가까운 조각에 붙인다.
// 자모가 서로 닿아 한 덩어리가 돼도, 닿은 자리(갈림점)에서 나뉘므로 조각 단위로 자모를 정할 수 있다.
import { type Bitmap, components, distanceTo } from './bitmap'

/** Zhang–Suen 세선화 */
export function thin(src: Uint8Array, w: number, h: number): Uint8Array {
  const img = src.slice()
  const del: number[] = []
  let changed = true
  const P = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x])
  for (let iter = 0; changed && iter < 60; iter++) {
    changed = false
    for (let step = 0; step < 2; step++) {
      del.length = 0
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!img[y * w + x]) continue
        const p2 = P(x, y - 1), p3 = P(x + 1, y - 1), p4 = P(x + 1, y), p5 = P(x + 1, y + 1)
        const p6 = P(x, y + 1), p7 = P(x - 1, y + 1), p8 = P(x - 1, y), p9 = P(x - 1, y - 1)
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
        if (B < 2 || B > 6) continue
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
        let A = 0
        for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) A++
        if (A !== 1) continue
        if (step === 0) { if (p2 * p4 * p6 || p4 * p6 * p8) continue }
        else if (p2 * p4 * p8 || p2 * p6 * p8) continue
        del.push(y * w + x)
      }
      if (del.length) { changed = true; for (const i of del) img[i] = 0 }
    }
  }
  return img
}

export const strokeOpts = { legacy: false, corners: true }
function nbCount(img: Uint8Array, w: number, h: number, i: number) { const x = i % w, y = (i - x) / w; let c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && img[ny * w + nx]) c++ } return c }
export const strokeDebug = { cuts: 0, paths: 0, maxTurn: 0, lens: [] as string[] }

/** 8-이웃을 한 바퀴 돌며 0→1로 바뀌는 횟수 (1 = 끝점, 2 = 선 위, 3 이상 = 갈림점) */
function crossings(img: Uint8Array, w: number, h: number, i: number): number {
  const x = i % w, y = (i - x) / w
  const P = (dx: number, dy: number) => { const nx = x + dx, ny = y + dy; return nx < 0 || ny < 0 || nx >= w || ny >= h ? 0 : img[ny * w + nx] }
  const ring = [P(0, -1), P(1, -1), P(1, 0), P(1, 1), P(0, 1), P(-1, 1), P(-1, 0), P(-1, -1)]
  let c = 0
  for (let k = 0; k < 8; k++) if (!ring[k] && ring[(k + 1) % 8]) c++
  return c
}
export interface Units { unit: Int32Array; n: number; pen: number }

/** 잉크 화소마다 획 조각 번호(1..n)를 붙인다 */
export function strokeUnits(bm: Bitmap, maxUnits = 16): Units {
  const { w, h, data } = bm
  const N = w * h
  const unit = new Int32Array(N)
  let total = 0
  for (let i = 0; i < N; i++) total += data[i]
  if (!total) return { unit, n: 0, pen: 0 }
  // 펜 굵기
  const bg = new Uint8Array(N)
  for (let i = 0; i < N; i++) bg[i] = data[i] ? 0 : 1
  const dt = distanceTo(bg, w, h)
  const skel = thin(data, w, h)
  let ds = 0, ns = 0
  for (let i = 0; i < N; i++) if (skel[i]) { ds += dt[i]; ns++ }
  const pen = ns ? (2 * ds) / ns : 4
  // 갈림점: 둘레를 한 바퀴 돌 때 뼈대가 세 번 이상 나타나는 곳 (계단 모양 대각선을 갈림점으로 잘못 보지 않게)
  const junc: number[] = []
  for (let i = 0; i < N; i++) if (skel[i] && (strokeOpts.legacy ? nbCount(skel, w, h, i) >= 3 : crossings(skel, w, h, i) >= 3)) junc.push(i)
  // 갈림점 둘레를 뼈대에서 지워 조각으로 끊는다
  const cut = skel.slice()
  const r = Math.max(1.5, pen * 0.75)
  const rr = Math.ceil(r)
  for (const j of junc) {
    const jx = j % w, jy = (j - jx) / w
    for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
      if (dx * dx + dy * dy > r * r) continue
      const x = jx + dx, y = jy + dy
      if (x >= 0 && y >= 0 && x < w && y < h) cut[y * w + x] = 0
    }
  }
  if (strokeOpts.corners) cutCorners(cut, w, h, pen)
  const segs = components({ w, h, data: cut })
  // 너무 짧은 조각(굵은 획 끝의 잔가지)은 버린다
  const minLen = Math.max(3, pen * 0.6)
  const seedId = new Int32Array(segs.sizes.length)
  let n = 0
  for (let s = 1; s < segs.sizes.length; s++) if (segs.sizes[s] >= minLen) seedId[s] = ++n
  if (!n) {
    // 뼈대가 없으면 연결 요소를 조각으로
    const cc = components(bm)
    for (let i = 0; i < N; i++) unit[i] = cc.labels[i]
    return { unit, n: cc.sizes.length - 1, pen }
  }
  // 잉크 안에서 가장 가까운 조각으로 퍼뜨린다 (BFS)
  const q: number[] = []
  for (let i = 0; i < N; i++) {
    const s = segs.labels[i]
    if (s && seedId[s]) { unit[i] = seedId[s]; q.push(i) }
  }
  for (let head = 0; head < q.length; head++) {
    const p = q[head]
    const x = p % w, y = (p - x) / w
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const t = ny * w + nx
      if (data[t] && !unit[t]) { unit[t] = unit[p]; q.push(t) }
    }
  }
  // 씨앗이 닿지 않은 잉크(뼈대 없는 작은 점)는 자기 연결 요소로
  const cc = components(bm)
  const extra = new Map<number, number>()
  for (let i = 0; i < N; i++) {
    if (!data[i] || unit[i]) continue
    const c = cc.labels[i]
    if (!extra.has(c)) extra.set(c, ++n)
    unit[i] = extra.get(c)!
  }
  // 작은 조각은 가장 많이 맞닿은 이웃 조각에 합치고, 조각이 많으면 작은 것부터 합친다
  const minSize = Math.max(12, total * 0.008)
  const skip = new Set<number>()
  for (let round = 0; round < 60; round++) {
    const size = new Array<number>(n + 1).fill(0)
    for (let i = 0; i < N; i++) if (unit[i]) size[unit[i]]++
    const alive: number[] = []
    for (let k = 1; k <= n; k++) if (size[k]) alive.push(k)
    let victim = -1
    for (const k of alive) if (!skip.has(k) && size[k] < minSize && (victim < 0 || size[k] < size[victim])) victim = k
    if (victim < 0 && alive.length > maxUnits) victim = alive.reduce((a, b) => (size[a] <= size[b] ? a : b))
    if (victim < 0) break
    const touch = new Map<number, number>()
    for (let i = 0; i < N; i++) {
      if (unit[i] !== victim) continue
      const x = i % w, y = (i - x) / w
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const u = unit[ny * w + nx]
        if (u && u !== victim) touch.set(u, (touch.get(u) ?? 0) + 1)
      }
    }
    let to = -1, bc = 0
    for (const [u, c] of touch) if (c > bc) { bc = c; to = u }
    if (to < 0) { skip.add(victim); if (alive.length <= maxUnits) continue; to = alive.find((k) => k !== victim) ?? -1; if (to < 0) break }
    for (let i = 0; i < N; i++) if (unit[i] === victim) unit[i] = to
  }
  // 번호를 1..n으로 다시 매긴다
  const remap = new Map<number, number>()
  let m = 0
  for (let i = 0; i < N; i++) {
    const u = unit[i]
    if (!u) continue
    if (!remap.has(u)) remap.set(u, ++m)
    unit[i] = remap.get(u)!
  }
  return { unit, n: m, pen }
}

/** 뼈대 조각을 크게 꺾이는 곳에서 한 번 더 끊는다 (한 획으로 이어 쓴 두 자모: ㅊ의 삐침이 ㅓ의 짧은 획으로 이어지는 경우 등) */
function cutCorners(cut: Uint8Array, w: number, h: number, pen: number) {
  const segs = components({ w, h, data: cut })
  const n = segs.sizes.length - 1
  const L = Math.max(4, Math.round(pen * 1.3))
  const rr = Math.max(1.5, pen * 0.55)
  const R = Math.ceil(rr)
  const neighbors = (i: number, lab: number) => {
    const x = i % w, y = (i - x) / w
    const out: number[] = []
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const q = ny * w + nx
      if (segs.labels[q] === lab) out.push(q)
    }
    return out
  }
  const byLabel: number[][] = Array.from({ length: n + 1 }, () => [])
  for (let i = 0; i < w * h; i++) if (segs.labels[i]) byLabel[segs.labels[i]].push(i)
  const cuts: number[] = []
  for (let lab = 1; lab <= n; lab++) {
    const px = byLabel[lab]
    if (px.length < L * 3) continue
    const start = px.find((i) => crossings(cut, w, h, i) === 1)
    if (start == null) continue // 고리(ㅇ)는 그대로
    // 끝점에서 따라가며 경로를 만든다
    const path: number[] = [start]
    const seen = new Set<number>([start])
    for (;;) {
      const cur = path[path.length - 1]
      const nx = neighbors(cur, lab).filter((q) => !seen.has(q))
      if (!nx.length) break
      // 4방향 이웃을 먼저 (대각선 지름길로 건너뛰지 않게)
      const cx = cur % w
      nx.sort((a, b) => (Math.abs((a % w) - cx) + Math.abs(((a - (a % w)) / w) - (cur - cx) / w)) - (Math.abs((b % w) - cx) + Math.abs(((b - (b % w)) / w) - (cur - cx) / w)))
      path.push(nx[0]); seen.add(nx[0])
    }
    if (path.length < L * 3) continue
    const P = path.map((i) => [i % w, (i - (i % w)) / w])
    const turn: number[] = new Array(path.length).fill(0)
    for (let t = L; t < path.length - L; t++) {
      const ax = P[t][0] - P[t - L][0], ay = P[t][1] - P[t - L][1]
      const bx = P[t + L][0] - P[t][0], by = P[t + L][1] - P[t][1]
      const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) + 1e-9)
      turn[t] = Math.acos(Math.max(-1, Math.min(1, cos)))
      if (turn[t] > strokeDebug.maxTurn) strokeDebug.maxTurn = turn[t]
    }
    for (let t = L; t < path.length - L; t++) {
      if (turn[t] < 1.0) continue // 약 57°
      let isMax = true
      for (let k = Math.max(L, t - L); k <= Math.min(path.length - L - 1, t + L); k++) if (turn[k] > turn[t]) { isMax = false; break }
      if (isMax) { cuts.push(path[t]); t += L }
    }
  }
  strokeDebug.cuts = cuts.length
  strokeDebug.paths = n
  for (const c of cuts) {
    const cx = c % w, cy = (c - cx) / w
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > rr * rr) continue
      const x = cx + dx, y = cy + dy
      if (x >= 0 && y >= 0 && x < w && y < h) cut[y * w + x] = 0
    }
  }
}
