import { useEffect, useRef } from 'react'
import type { Bitmap } from '../engine/bitmap'

const INK = '#15130f'
export const SLOT_COLORS = ['#15130f', '#c2502f', '#3e8a73', '#b88a16'] // 배경, 초, 중, 종 (한지 위에서 읽히는 색)

/** 칸 비트맵을 한지색 바탕에 그린다. labels가 있으면 자모별 색 */
export function CellCanvas({ bitmap, labels, className, onTap, label }: {
  bitmap: Bitmap; labels?: Uint8Array; className?: string; label?: string
  onTap?: (x: number, y: number) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = bitmap.w; c.height = bitmap.h
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(bitmap.w, bitmap.h)
    const pal = (labels ? SLOT_COLORS : [INK]).map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)))
    for (let i = 0; i < bitmap.data.length; i++) {
      if (!bitmap.data[i]) continue
      const col = labels ? pal[labels[i]] ?? pal[0] : pal[0]
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [bitmap, labels])
  return (
    <canvas
      ref={ref} className={className} role="img" aria-label={label}
      onClick={onTap ? (e) => {
        const r = (e.target as HTMLCanvasElement).getBoundingClientRect()
        onTap(Math.floor(((e.clientX - r.left) / r.width) * bitmap.w), Math.floor(((e.clientY - r.top) / r.height) * bitmap.h))
      } : undefined}
    />
  )
}
