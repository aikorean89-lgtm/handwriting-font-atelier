import { useEffect, useState } from 'react'
import { type CVStatus, onCVStatus } from '../engine/cv'

/** 영상 처리 엔진을 받는 동안만 보이는 진행 막대 */
export function EngineStatus() {
  const [s, setS] = useState<CVStatus | null>(null)
  useEffect(() => onCVStatus(setS), [])
  if (!s || s.state === 'ready' || s.state === 'idle') return null
  if (s.state === 'error') return null
  const pct = Math.round((s.loaded / s.total) * 100)
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1)
  return (
    <div className="engine" role="status" aria-live="polite">
      <div className="engine-text">
        <b>{s.state === 'starting' ? '사진 읽을 준비를 마치는 중' : '사진 읽을 준비 중'}</b>
        <span className="count">
          {s.state === 'starting' ? '거의 다 됐어요' : `영상 처리 엔진 ${mb(s.loaded)} / ${mb(s.total)}MB`}
        </span>
      </div>
      <div className="engine-bar" aria-hidden><i style={{ width: `${s.state === 'starting' ? 100 : pct}%` }} /></div>
      <p className="note">처음 한 번만 받아요. 그동안 시트를 찍어 두어도 됩니다.</p>
    </div>
  )
}
