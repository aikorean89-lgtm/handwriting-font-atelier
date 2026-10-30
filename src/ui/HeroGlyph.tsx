import { useEffect, useRef, useState } from 'react'
import { splitForDisplay } from '../engine/refmask'
import { decompose, CHO, JUNG, JONG } from '../engine/hangul'

const SIZE = 440

function maskToCanvas(mask: Uint8Array, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = SIZE; c.height = SIZE
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(SIZE, SIZE)
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
  for (let i = 0; i < mask.length; i++) if (mask[i]) { img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255 }
  ctx.putImageData(img, 0, 0)
  return c
}

/** "한"이 초·중·종으로 갈라졌다 다시 붙는 한 번의 연출 */
export function HeroGlyph({ ch = '한' }: { ch?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const run = useRef<() => void>(() => {})

  useEffect(() => {
    let raf = 0
    let cancelled = false
    const font = `800 ${Math.round(SIZE * 0.9)}px "Hahmlet Variable", serif`
    document.fonts.load(font, ch + '학할함항안간난만산').then(() => {
      if (cancelled) return
      const css = getComputedStyle(document.documentElement)
      const col = (n: string, d: string) => css.getPropertyValue(n).trim() || d
      const parts = splitForDisplay(ch, SIZE, font)
      const paper = col('--text', '#1c1d1a')
      const layers = [
        { m: parts.cho, color: col('--cho', '#c2502f'), dx: -0.11, dy: -0.06 },
        { m: parts.jung, color: col('--jung', '#2f8a73'), dx: 0.12, dy: -0.02 },
        ...(parts.jong ? [{ m: parts.jong, color: col('--jong', '#b0841a'), dx: 0.0, dy: 0.12 }] : []),
      ].map((l) => ({ ...l, ink: maskToCanvas(l.m, paper), tint: maskToCanvas(l.m, l.color) }))
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const canvas = ref.current!
      canvas.width = SIZE * 2; canvas.height = SIZE * 2
      const ctx = canvas.getContext('2d')!
      const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
      const draw = (split: number) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.imageSmoothingEnabled = true
        for (const l of layers) {
          const x = (SIZE * 0.5 + l.dx * SIZE * split) , y = (SIZE * 0.5 + l.dy * SIZE * split)
          ctx.globalAlpha = 1
          ctx.drawImage(l.ink, x, y)
          if (split > 0.05) { ctx.globalAlpha = Math.min(1, (split - 0.05) * 1.4); ctx.drawImage(l.tint, x, y) }
        }
        ctx.globalAlpha = 1
      }
      const play = () => {
        cancelAnimationFrame(raf)
        if (reduce) { draw(0.6); return }
        const t0 = performance.now()
        const tl = (now: number) => {
          const t = (now - t0) / 1000
          let s = 0
          if (t < 0.5) s = 0
          else if (t < 1.4) s = ease((t - 0.5) / 0.9)
          else if (t < 2.6) s = 1
          else if (t < 3.4) s = 1 - ease((t - 2.6) / 0.8)
          else { draw(0); return }
          draw(s)
          raf = requestAnimationFrame(tl)
        }
        raf = requestAnimationFrame(tl)
      }
      run.current = play
      draw(0)
      setReady(true)
      play()
    })
    return () => { cancelled = true; cancelAnimationFrame(raf) }
  }, [ch])

  const s = decompose(ch)
  return (
    <div className="hero-stage" onClick={() => run.current()} onMouseEnter={() => run.current()}>
      <canvas ref={ref} role="img" aria-label={`'${ch}'이 초성 ${CHO[s.cho]}, 중성 ${JUNG[s.jung]}, 종성 ${JONG[s.jong]}으로 나뉘는 모습`} />
      {ready && (
        <div className="hero-legend" aria-hidden>
          <span><i style={{ background: 'var(--cho)' }} />초성 {CHO[s.cho]}</span>
          <span><i style={{ background: 'var(--jung)' }} />중성 {JUNG[s.jung]}</span>
          {s.jong > 0 && <span><i style={{ background: 'var(--jong)' }} />종성 {JONG[s.jong]}</span>}
        </div>
      )}
    </div>
  )
}
