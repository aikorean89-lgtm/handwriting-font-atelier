import { useEffect, useRef } from 'react'
import { SCOUNT } from '../engine/hangul'

export const MOSAIC_COLS = 106

/** 11,172칸 모자이크. direct = 직접 쓴 음절 번호, upTo = 여기까지 조합 완료 */
export function drawMosaic(canvas: HTMLCanvasElement, direct: Set<number>, upTo: number, opts: { cols?: number; band?: boolean } = {}) {
  const cols = opts.cols ?? MOSAIC_COLS
  const rows = Math.ceil(SCOUNT / cols)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const W = canvas.clientWidth * dpr, H = canvas.clientHeight * dpr
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H }
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, W, H)
  const cw = W / cols, ch = H / rows
  const css = getComputedStyle(document.documentElement)
  const empty = css.getPropertyValue('--mosaic-empty').trim() || '#e7e9e4'
  const fill = css.getPropertyValue('--mosaic-fill').trim() || '#3a3d37'
  const seal = css.getPropertyValue('--seal').trim() || '#c8321b'
  const g = Math.max(0.6, Math.min(cw, ch) * 0.16)
  for (let i = 0; i < SCOUNT; i++) {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch
    ctx.fillStyle = direct.has(i) ? seal : i < upTo ? fill : empty
    ctx.fillRect(x, y, Math.max(0.6, cw - g), Math.max(0.6, ch - g))
  }
}

export function Mosaic({ direct, upTo, cols, label }: { direct: Set<number>; upTo: number; cols?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    drawMosaic(c, direct, upTo, { cols })
    const ro = new ResizeObserver(() => drawMosaic(c, direct, upTo, { cols }))
    ro.observe(c)
    return () => ro.disconnect()
  }, [direct, upTo, cols])
  return <canvas ref={ref} role="img" aria-label={label} />
}
