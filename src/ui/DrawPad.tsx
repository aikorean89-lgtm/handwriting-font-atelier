// 펜으로 칸에 글씨를 쓰는 판 (화면에 직접 쓰기, 글자 손보기에서 함께 쓴다)
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { type Bitmap, newBitmap } from '../engine/bitmap'

export interface DrawPadHandle {
  /** 지금 그림을 N×N 비트맵으로 (1 = 잉크) */
  getBitmap(): Bitmap
  isEmpty(): boolean
  clear(): void
  /** 처음 비트맵으로 되돌린다 */
  reset(): void
}

const UP = 3 // 화면 해상도 = 출력의 몇 배
const INK = '#1b1a1f'
const SIZES = [{ k: 0.7, label: '가늘게' }, { k: 1, label: '보통' }, { k: 1.45, label: '굵게' }]

export const DrawPad = forwardRef<DrawPadHandle, {
  n: number // 출력 비트맵 한 변
  pen: number // 기본 펜 굵기 (출력 화소)
  initial?: Bitmap | null
  label: string
  guide?: boolean
  eraser?: boolean // 지우개 단추 보이기
  onStroke?: () => void
}>(function DrawPad({ n, pen, initial, label, guide = true, eraser = true, onStroke }, ref) {
  const R = n * UP
  const canvas = useRef<HTMLCanvasElement>(null)
  const undo = useRef<ImageData[]>([])
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [size, setSize] = useState(1)
  const [, setTick] = useState(0)
  const sawPen = useRef(false)
  const drawing = useRef<{ id: number; x: number; y: number; mx: number; my: number } | null>(null)
  const empty = useRef(true)

  const ctx = () => canvas.current!.getContext('2d', { willReadFrequently: true })!

  const paintInitial = () => {
    const c = ctx()
    c.clearRect(0, 0, R, R)
    empty.current = true
    if (!initial) return
    const t = document.createElement('canvas'); t.width = initial.w; t.height = initial.h
    const tc = t.getContext('2d')!
    const img = tc.createImageData(initial.w, initial.h)
    for (let i = 0; i < initial.data.length; i++) if (initial.data[i]) { img.data[i * 4 + 3] = 255; empty.current = false }
    tc.putImageData(img, 0, 0)
    c.imageSmoothingEnabled = true
    c.drawImage(t, 0, 0, R, R)
    // 확대하며 흐려진 가장자리를 다시 또렷하게
    const d = c.getImageData(0, 0, R, R)
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] >= 128 ? 255 : 0
    c.putImageData(d, 0, 0)
  }

  useEffect(() => {
    const cv = canvas.current!
    cv.width = R; cv.height = R
    paintInitial()
    undo.current = []
    setTick((t) => t + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, R])

  useImperativeHandle(ref, () => ({
    getBitmap() {
      const t = document.createElement('canvas'); t.width = n; t.height = n
      const tc = t.getContext('2d', { willReadFrequently: true })!
      tc.imageSmoothingEnabled = true
      tc.imageSmoothingQuality = 'high'
      tc.drawImage(canvas.current!, 0, 0, n, n)
      const d = tc.getImageData(0, 0, n, n).data
      const bm = newBitmap(n, n)
      for (let i = 0; i < n * n; i++) bm.data[i] = d[i * 4 + 3] >= 110 ? 1 : 0
      return bm
    },
    isEmpty() { return empty.current },
    clear() { pushUndo(); ctx().clearRect(0, 0, R, R); empty.current = true; setTick((t) => t + 1) },
    reset() { pushUndo(); paintInitial(); setTick((t) => t + 1) },
  }))

  const pushUndo = () => {
    undo.current.push(ctx().getImageData(0, 0, R, R))
    if (undo.current.length > 40) undo.current.shift()
  }
  const doUndo = () => {
    const last = undo.current.pop()
    if (!last) return
    ctx().putImageData(last, 0, 0)
    setTick((t) => t + 1)
  }

  const pos = (e: PointerEvent | React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * R, y: ((e.clientY - r.top) / r.height) * R }
  }
  const width = () => Math.max(1.5, pen * SIZES[size].k * UP * (tool === 'eraser' ? 2.2 : 1))
  const style = (c: CanvasRenderingContext2D) => {
    c.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    c.strokeStyle = INK; c.fillStyle = INK
    c.lineWidth = width(); c.lineCap = 'round'; c.lineJoin = 'round'
  }

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'pen') sawPen.current = true
    else if (e.pointerType === 'touch' && sawPen.current) return // 펜을 쓰는 중이면 손바닥 터치는 무시
    if (drawing.current) return
    e.preventDefault()
    canvas.current!.setPointerCapture(e.pointerId)
    pushUndo()
    const p = pos(e)
    drawing.current = { id: e.pointerId, x: p.x, y: p.y, mx: p.x, my: p.y }
    const c = ctx(); style(c)
    c.beginPath(); c.arc(p.x, p.y, width() / 2, 0, Math.PI * 2); c.fill()
    if (tool === 'pen') empty.current = false
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawing.current
    if (!d || d.id !== e.pointerId) return
    e.preventDefault()
    const c = ctx(); style(c)
    const evs = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[]
    for (const ev of evs) {
      const p = pos(ev)
      const mx = (d.x + p.x) / 2, my = (d.y + p.y) / 2
      c.beginPath(); c.moveTo(d.mx, d.my); c.quadraticCurveTo(d.x, d.y, mx, my); c.stroke()
      d.mx = mx; d.my = my; d.x = p.x; d.y = p.y
    }
  }
  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawing.current
    if (!d || d.id !== e.pointerId) return
    const c = ctx(); style(c)
    c.beginPath(); c.moveTo(d.mx, d.my); c.lineTo(d.x, d.y); c.stroke()
    c.globalCompositeOperation = 'source-over'
    drawing.current = null
    setTick((t) => t + 1)
    onStroke?.()
  }

  return (
    <div className="drawpad">
      <div className={`drawpad-surface ${guide ? 'guide' : ''}`}>
        <canvas
          ref={canvas} aria-label={label} role="img"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
      <div className="drawpad-tools" role="toolbar" aria-label="펜 도구">
        {eraser && (
          <div className="seg" role="group" aria-label="도구">
            <button aria-pressed={tool === 'pen'} onClick={() => setTool('pen')}>펜</button>
            <button aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')}>지우개</button>
          </div>
        )}
        <div className="seg" role="group" aria-label="굵기">
          {SIZES.map((s, i) => <button key={s.label} aria-pressed={size === i} onClick={() => setSize(i)}>{s.label}</button>)}
        </div>
        <button className="btn small quiet" onClick={doUndo} disabled={!undo.current.length}>되돌리기</button>
      </div>
    </div>
  )
})
