// 이진 비트맵 도구: 연결 요소, 거리 변환, 경계 상자, 압축 저장

export interface Bitmap { w: number; h: number; data: Uint8Array } // 1 = 잉크

export function newBitmap(w: number, h: number): Bitmap {
  return { w, h, data: new Uint8Array(w * h) }
}

export function countInk(b: Bitmap): number {
  let n = 0
  for (let i = 0; i < b.data.length; i++) n += b.data[i] ? 1 : 0
  return n
}

export interface Box { x: number; y: number; w: number; h: number }

export function inkBox(b: Bitmap, label?: Uint8Array, want?: number): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const i = y * b.w + x
      const on = label ? label[i] === want : b.data[i] === 1
      if (!on) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return null
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/** 8-연결 요소 라벨링. 반환: 라벨 배열(0=배경, 1..n)과 크기 */
export function components(b: Bitmap): { labels: Int32Array; sizes: number[] } {
  const { w, h, data } = b
  const labels = new Int32Array(w * h)
  const sizes: number[] = [0]
  const stack: number[] = []
  let next = 1
  for (let i = 0; i < w * h; i++) {
    if (!data[i] || labels[i]) continue
    let size = 0
    labels[i] = next
    stack.push(i)
    while (stack.length) {
      const p = stack.pop()!
      size++
      const px = p % w, py = (p - px) / w
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx
          if (nx < 0 || nx >= w) continue
          const q = ny * w + nx
          if (data[q] && !labels[q]) { labels[q] = next; stack.push(q) }
        }
      }
    }
    sizes.push(size)
    next++
  }
  return { labels, sizes }
}

/** 작은 잡티 제거 */
export function removeSpecks(b: Bitmap, minArea: number): Bitmap {
  const { labels, sizes } = components(b)
  const out = newBitmap(b.w, b.h)
  for (let i = 0; i < b.data.length; i++) {
    const l = labels[i]
    if (l && sizes[l] >= minArea) out.data[i] = 1
  }
  return out
}

/** 3-4 챔퍼 거리 변환: mask에 속한 화소까지의 거리 (화소 단위) */
export function distanceTo(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9
  const d = new Float32Array(w * h)
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let v = d[i]
      if (x > 0) v = Math.min(v, d[i - 1] + 3)
      if (y > 0) {
        v = Math.min(v, d[i - w] + 3)
        if (x > 0) v = Math.min(v, d[i - w - 1] + 4)
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4)
      }
      d[i] = v
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      let v = d[i]
      if (x < w - 1) v = Math.min(v, d[i + 1] + 3)
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 3)
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4)
        if (x > 0) v = Math.min(v, d[i + w - 1] + 4)
      }
      d[i] = v
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3
  return d
}

export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice()
  const dist = distanceTo(mask, w, h)
  const out = new Uint8Array(w * h)
  for (let i = 0; i < out.length; i++) out[i] = dist[i] <= r ? 1 : 0
  return out
}

/** 1비트 압축 (IndexedDB 저장용) */
export function packBits(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(data.length / 8))
  for (let i = 0; i < data.length; i++) if (data[i]) out[i >> 3] |= 1 << (i & 7)
  return out
}
export function unpackBits(bits: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = (bits[i >> 3] >> (i & 7)) & 1
  return out
}

/** 비트맵을 캔버스에 그린다 (잉크색, 라벨별 색 지원) */
export function drawBitmap(
  ctx: CanvasRenderingContext2D, b: Bitmap, colors: string[] | string, labels?: Uint8Array,
) {
  const img = ctx.createImageData(b.w, b.h)
  const parsed = (Array.isArray(colors) ? colors : [colors]).map(hexToRgb)
  for (let i = 0; i < b.data.length; i++) {
    if (!b.data[i]) continue
    const c = parsed[labels ? Math.min(labels[i], parsed.length - 1) : 0] ?? parsed[0]
    img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
