// 같은 자모를 여러 글자에서 모았을 때, 서로 모양이 다른(잘못 잘린) 샘플을 찾아낸다.
// 각 샘플을 자기 상자 크기로 늘려 24×24 격자에 맞춘 뒤, 서로의 거리(챔퍼)를 잰다.
import { type Bitmap, distanceTo, inkBox } from './bitmap'

export const G = 24

export interface Desc { ink: Uint8Array; dt: Float32Array; n: number; aspect: number }

/** mask가 있으면 mask===want 인 잉크만 */
export function describe(bm: Bitmap, mask: Uint8Array | undefined, want: number): Desc | null {
  const b = inkBox(bm, mask, want)
  if (!b || b.w < 2 || b.h < 2) return null
  const ink = new Uint8Array(G * G)
  const fx = G / b.w, fy = G / b.h
  for (let y = b.y; y < b.y + b.h; y++) {
    const gy0 = Math.floor((y - b.y) * fy), gy1 = Math.min(G - 1, Math.max(gy0, Math.ceil((y + 1 - b.y) * fy) - 1))
    for (let x = b.x; x < b.x + b.w; x++) {
      const i = y * bm.w + x
      if (!bm.data[i] || (mask && mask[i] !== want)) continue
      const gx0 = Math.floor((x - b.x) * fx), gx1 = Math.min(G - 1, Math.max(gx0, Math.ceil((x + 1 - b.x) * fx) - 1))
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) ink[gy * G + gx] = 1
    }
  }
  let n = 0
  for (let i = 0; i < ink.length; i++) n += ink[i]
  if (!n) return null
  return { ink, dt: distanceTo(ink, G, G), n, aspect: b.w / b.h }
}

/** 대칭 챔퍼 거리 (격자 칸 단위). 획이 하나 더 있거나 빠지면 커진다 */
export function chamfer(a: Desc, b: Desc): number {
  let sa = 0, sb = 0
  for (let i = 0; i < a.ink.length; i++) {
    if (a.ink[i]) sa += b.dt[i]
    if (b.ink[i]) sb += a.dt[i]
  }
  // 한쪽에만 있는 획이 평균에 묻히지 않게 두 방향 중 큰 쪽에 무게를 더 준다
  const da = sa / a.n, db = sb / b.n
  return 0.35 * Math.min(da, db) + 0.65 * Math.max(da, db)
}

export function median(a: number[]): number {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
