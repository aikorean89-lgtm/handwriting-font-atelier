// 마커를 찾지 못했을 때: 네 모서리를 직접 끌어 맞춘다
import { useEffect, useRef, useState } from 'react'
import type { Pt } from '../engine/sheet'

export function CornerEditor({ canvas, onDone, onCancel }: { canvas: HTMLCanvasElement; onDone: (pts: Pt[]) => void; onCancel: () => void }) {
  const [url] = useState(() => canvas.toDataURL('image/jpeg', 0.8))
  const box = useRef<HTMLDivElement>(null)
  const [pts, setPts] = useState<Pt[]>([[0.08, 0.06], [0.92, 0.06], [0.92, 0.94], [0.08, 0.94]])
  const drag = useRef<number | null>(null)

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (drag.current == null || !box.current) return
      const r = box.current.getBoundingClientRect()
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
      setPts((p) => p.map((q, i) => (i === drag.current ? [x, y] : q)))
    }
    const up = () => { drag.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])

  const names = ['왼쪽 위', '오른쪽 위', '오른쪽 아래', '왼쪽 아래']
  const nudge = (i: number, dx: number, dy: number) => setPts((p) => p.map((q, k) => (k === i ? [q[0] + dx, q[1] + dy] : q)))
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>마커를 찾지 못했어요</h2>
      <p className="note">빨간 네모 네 개를 시트 네 모서리 검은 마커의 바깥 끝에 맞춰 주세요. 네모를 누른 뒤 화살표 키로도 움직일 수 있어요.</p>
      <div className="corner-editor" ref={box}>
        <img src={url} alt="찍은 사진" draggable={false} />
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
          <polygon points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--seal)" strokeWidth="0.004" />
        </svg>
        {pts.map((p, i) => (
          <button
            key={i} className="h" style={{ left: `${p[0] * 100}%`, top: `${p[1] * 100}%` }} aria-label={`${names[i]} 모서리`}
            onPointerDown={(e) => { drag.current = i; (e.target as HTMLElement).setPointerCapture?.(e.pointerId) }}
            onKeyDown={(e) => {
              const s = e.shiftKey ? 0.02 : 0.002
              if (e.key === 'ArrowLeft') nudge(i, -s, 0); if (e.key === 'ArrowRight') nudge(i, s, 0)
              if (e.key === 'ArrowUp') nudge(i, 0, -s); if (e.key === 'ArrowDown') nudge(i, 0, s)
            }}
          />
        ))}
      </div>
      <div className="actions">
        <button className="btn primary" onClick={() => onDone(pts.map((p) => [p[0] * canvas.width, p[1] * canvas.height]))}>이 모서리로 펴기</button>
        <button className="btn quiet" onClick={onCancel}>다시 찍기</button>
      </div>
    </div>
  )
}
