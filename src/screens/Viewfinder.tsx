// 카메라 뷰파인더: 마커 4개가 잡히고 선명하면 자동 촬영
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { loadCV } from '../engine/cv'
import { detectMarkersMat, sharpnessOf, type Pt } from '../engine/sheet'

interface Props { sheetLabel: string; onCapture: (c: HTMLCanvasElement) => void; onClose: () => void }

export function Viewfinder({ sheetLabel, onCapture, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const [corners, setCorners] = useState<(Pt | null)[]>([null, null, null, null])
  const [sharp, setSharp] = useState(0)
  const [light, setLight] = useState(0)
  const [busy, setBusy] = useState(false)
  const stable = useRef(0)
  const stream = useRef<MediaStream | null>(null)
  const done = useRef(false)

  const capture = async () => {
    if (done.current || !video.current) return
    done.current = true
    setBusy(true)
    const v = video.current
    try {
      const track = stream.current?.getVideoTracks()[0]
      const IC = (window as any).ImageCapture
      if (track && IC) {
        try {
          const blob: Blob = await new IC(track).takePhoto()
          const bmp = await createImageBitmap(blob)
          const c = document.createElement('canvas')
          const s = Math.min(1, 3600 / Math.max(bmp.width, bmp.height))
          c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
          c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
          onCapture(c)
          return
        } catch { /* 비디오 프레임으로 */ }
      }
      const c = document.createElement('canvas')
      c.width = v.videoWidth; c.height = v.videoHeight
      c.getContext('2d')!.drawImage(v, 0, 0)
      onCapture(c)
    } finally { setBusy(false) }
  }

  useEffect(() => {
    let alive = true
    let timer = 0
    const small = document.createElement('canvas')
    ;(async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false })
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return }
        stream.current = s
        const v = video.current!
        v.srcObject = s
        await v.play()
        const cv = await loadCV()
        const loop = () => {
          if (!alive || done.current) return
          if (v.videoWidth) {
            const sc = Math.min(1, 1000 / Math.max(v.videoWidth, v.videoHeight))
            small.width = Math.round(v.videoWidth * sc); small.height = Math.round(v.videoHeight * sc)
            const ctx = small.getContext('2d', { willReadFrequently: true })!
            ctx.drawImage(v, 0, 0, small.width, small.height)
            const src = cv.imread(small)
            const gray = new cv.Mat()
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
            const det = detectMarkersMat(cv, gray)
            const sh = sharpnessOf(cv, gray)
            const mean = cv.mean(gray)[0]
            src.delete(); gray.delete()
            const cs: (Pt | null)[] = [0, 1, 2, 3].map((id) => {
              const c = det.corners[id]
              return c ? [c[id][0] / sc, c[id][1] / sc] : null
            })
            setCorners(cs); setSharp(sh); setLight(mean)
            const ok = cs.every(Boolean) && sh > 60 && mean > 70
            stable.current = ok ? stable.current + 1 : 0
            if (stable.current >= 3) { navigator.vibrate?.(10); capture(); return }
          }
          timer = window.setTimeout(loop, 220)
        }
        loop()
      } catch (e: any) {
        setErr(e?.name === 'NotAllowedError' ? '카메라 권한이 꺼져 있어요. 브라우저 설정에서 허용하거나, 사진 올리기를 쓰세요.' : '카메라를 열지 못했어요. 사진 올리기를 쓰세요.')
      }
    })()
    return () => {
      alive = false
      clearTimeout(timer)
      stream.current?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 영상 좌표 → 화면 좌표 (object-fit: contain)
  const v = video.current
  const found = corners.filter(Boolean).length
  const toView = (p: Pt) => {
    if (!v || !v.videoWidth) return p
    const W = v.clientWidth, H = v.clientHeight
    const s = Math.min(W / v.videoWidth, H / v.videoHeight)
    const ox = (W - v.videoWidth * s) / 2, oy = (H - v.videoHeight * s) / 2
    return [ox + p[0] * s, oy + p[1] * s] as Pt
  }
  const L = 34
  const dirs: Pt[] = [[1, 1], [-1, 1], [-1, -1], [1, -1]]
  const msg = found < 4 ? `마커 ${found}/4: 네 모서리가 모두 보이게 해 주세요` : sharp <= 60 ? '초점을 맞추는 중이에요. 잠깐 멈춰 주세요' : light <= 70 ? '조금 더 밝은 곳으로 옮겨 주세요' : '좋아요, 찍습니다'
  return (
    <div className="viewfinder" role="dialog" aria-label={`${sheetLabel} 촬영`}>
      <div className="vf-stage">
        <video ref={video} playsInline muted />
        <svg aria-hidden>
          {corners.map((c, i) => {
            if (!c) return null
            const [x, y] = toView(c)
            const [dx, dy] = dirs[i]
            return <path key={i} d={`M${x} ${y + dy * L}V${y}H${x + dx * L}`} fill="none" stroke="var(--seal)" strokeWidth="4" />
          })}
        </svg>
        {err && <div className="error" style={{ position: 'absolute', left: 16, right: 16, top: 16 }}>{err}</div>}
      </div>
      <div className="vf-bar">
        <div className="vf-status" aria-live="polite">
          <b>{sheetLabel}</b>
          <span>{busy ? '사진을 받는 중이에요' : msg}</span>
        </div>
        <button className={`shutter ${found === 4 ? 'ready' : ''}`} onClick={capture} aria-label="지금 찍기" disabled={busy} />
        <button className="btn small quiet vf-close" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}
