// 손편지·공책 사진에서 글자를 골라 폰트 만들기 (기억 폰트)
import { useEffect, useMemo, useRef, useState } from 'react'
import { Head } from '../ui/common'
import { type Box } from '../engine/bitmap'
import { boxToCell, findBoxes, inkFromPhoto, type LetterImage } from '../engine/letter'
import { fileToCanvas } from '../engine/sheet'
import { isHangul } from '../engine/hangul'
import { ensureRefFont } from '../engine/refmask'
import { segmentScored } from '../engine/segment'
import { TEMPLATE_VERSION } from '../engine/template'
import { EngineStatus } from '../ui/EngineStatus'
import type { Cell, Project, Sheet } from '../state'

export const LETTER_SHEET = 21
const N = 180
interface Photo { name: string; src: HTMLCanvasElement; img: LetterImage; boxes: Box[]; labels: Record<number, string>; dark: number }

const ok = (ch: string) => isHangul(ch) || /^[0-9A-Za-z]$/.test(ch)

export function LetterScreen({ project, onSheet, onNext }: { project: Project; onSheet: (s: Sheet) => void; onNext: () => void }) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [at, setAt] = useState(0)
  const [sel, setSel] = useState<number | null>(null)
  const [ch, setCh] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [drawMode, setDrawMode] = useState(false)
  const drag = useRef<{ x: number; y: number; x2: number; y2: number } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const inkCanvas = useRef<Map<Photo, HTMLCanvasElement>>(new Map())
  const fileRef = useRef<HTMLInputElement>(null)
  const prev = project.sheets[LETTER_SHEET]
  const prevCount = prev?.cells.length ?? 0
  const p = photos[at]

  const addPhoto = async (f: File | undefined) => {
    if (!f) return
    setBusy('사진에서 글씨를 찾는 중'); setMsg(null)
    try {
      const src = await fileToCanvas(f, 3000)
      const img = await inkFromPhoto(src)
      const boxes = findBoxes(img)
      setPhotos((ps) => { const next = [...ps, { name: f.name, src, img, boxes, labels: {}, dark: 0.72 }]; setAt(next.length - 1); return next })
      setSel(null)
      if (!boxes.length) setMsg('글자를 찾지 못했어요. ‘글씨 진하기’를 올리거나, ‘상자 직접 그리기’로 글자를 감싸 주세요.')
    } catch (e) { setMsg((e as Error).message || '사진을 읽지 못했어요.') } finally { setBusy(null) }
  }
  const redo = async (dark: number) => {
    if (!p) return
    setBusy('다시 찾는 중')
    const img = await inkFromPhoto(p.src, dark)
    const boxes = findBoxes(img)
    inkCanvas.current.delete(p)
    setPhotos((ps) => ps.map((x, i) => (i === at ? { ...x, img, boxes, labels: {}, dark } : x)))
    setSel(null); setBusy(null)
  }
  const patch = (fn: (x: Photo) => Photo) => setPhotos((ps) => ps.map((x, i) => (i === at ? fn(x) : x)))

  // 그리기
  useEffect(() => {
    const c = canvas.current
    if (!c || !p) return
    let ic = inkCanvas.current.get(p)
    if (!ic) {
      ic = document.createElement('canvas'); ic.width = p.img.w; ic.height = p.img.h
      const x = ic.getContext('2d')!
      const id = x.createImageData(p.img.w, p.img.h)
      for (let i = 0; i < p.img.ink.length; i++) { const v = p.img.ink[i] ? 30 : 255; id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255 }
      x.putImageData(id, 0, 0)
      inkCanvas.current.set(p, ic)
    }
    c.width = p.img.w; c.height = p.img.h
    const x = c.getContext('2d')!
    x.drawImage(ic, 0, 0)
    const lw = Math.max(2, p.img.w / 500)
    p.boxes.forEach((b, i) => {
      const lab = p.labels[i]
      x.lineWidth = i === sel ? lw * 2 : lw
      x.strokeStyle = i === sel ? '#c8321b' : lab ? '#2f8a73' : '#5aa2ff'
      x.setLineDash(lab || i === sel ? [] : [lw * 3, lw * 2])
      x.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4)
      if (lab) {
        const fs = Math.max(14, b.h * 0.42)
        x.font = `700 ${fs}px sans-serif`
        x.fillStyle = '#2f8a73'; x.fillRect(b.x - 2, b.y - 2 - fs * 1.15, fs * 1.2, fs * 1.15)
        x.fillStyle = '#fff'; x.fillText(lab, b.x + fs * 0.08, b.y - 2 - fs * 0.22)
      }
    })
    const d = drag.current
    if (d) { x.setLineDash([]); x.strokeStyle = '#c8321b'; x.lineWidth = lw; x.strokeRect(Math.min(d.x, d.x2), Math.min(d.y, d.y2), Math.abs(d.x2 - d.x), Math.abs(d.y2 - d.y)) }
  })

  const toImg = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * p!.img.w, y: ((e.clientY - r.top) / r.height) * p!.img.h }
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!p) return
    const q = toImg(e)
    if (drawMode) { canvas.current!.setPointerCapture(e.pointerId); drag.current = { x: q.x, y: q.y, x2: q.x, y2: q.y }; return }
    let best: number | null = null, area = Infinity
    p.boxes.forEach((b, i) => { const pad = 6; if (q.x >= b.x - pad && q.x <= b.x + b.w + pad && q.y >= b.y - pad && q.y <= b.y + b.h + pad && b.w * b.h < area) { best = i; area = b.w * b.h } })
    setSel(best); setCh(best != null ? p.labels[best] ?? '' : '')
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return
    const q = toImg(e); drag.current.x2 = q.x; drag.current.y2 = q.y
    setMsg((m) => m) // 다시 그리기
    setPhotos((ps) => [...ps])
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    if (!d || !p) return
    const b = { x: Math.round(Math.min(d.x, d.x2)), y: Math.round(Math.min(d.y, d.y2)), w: Math.round(Math.abs(d.x2 - d.x)), h: Math.round(Math.abs(d.y2 - d.y)) }
    if (b.w < 6 || b.h < 6) { setPhotos((ps) => [...ps]); return }
    patch((x) => ({ ...x, boxes: [...x.boxes, b] }))
    setSel(p.boxes.length); setCh(''); setDrawMode(false)
  }

  const setLabel = (v: string) => {
    if (sel == null) return
    const c = [...v.trim()][0] ?? ''
    if (c && !ok(c)) { setMsg('한글 한 글자(또는 숫자·영문 한 자)를 넣어 주세요.'); return }
    patch((x) => { const labels = { ...x.labels }; if (c) labels[sel] = c; else delete labels[sel]; return { ...x, labels } })
    // 다음 상자로
    if (c && p) {
      const nxt = p.boxes.findIndex((_, i) => i > sel && !p.labels[i])
      setSel(nxt >= 0 ? nxt : null); setCh('')
    }
  }
  const removeBox = () => {
    if (sel == null) return
    patch((x) => {
      const labels: Record<number, string> = {}
      Object.entries(x.labels).forEach(([k, v]) => { const i = +k; if (i < sel) labels[i] = v; else if (i > sel) labels[i - 1] = v })
      return { ...x, boxes: x.boxes.filter((_, i) => i !== sel), labels }
    })
    setSel(null)
  }
  const autoLabel = () => {
    if (!p) return
    const chars = [...text].filter(ok)
    const hs = p.boxes.map((b) => b.h).sort((a, b) => a - b)
    const med = hs[hs.length >> 1] ?? 0
    const order = p.boxes.map((b, i) => ({ b, i })).filter(({ b }) => b.h >= med * 0.5)
    const labels: Record<number, string> = {}
    order.forEach(({ i }, k) => { if (k < chars.length) labels[i] = chars[k] })
    patch((x) => ({ ...x, labels }))
    setMsg(order.length === chars.length ? `상자 ${order.length}개에 글자를 차례대로 붙였어요. 틀린 곳은 상자를 눌러 고치세요.` : `상자 ${order.length}개, 글자 ${chars.length}자라 수가 달라요. 앞에서부터 붙였으니, 어긋나는 곳의 상자를 눌러 고치거나 지워 주세요.`)
  }

  const total = useMemo(() => photos.reduce((s, x) => s + Object.values(x.labels).filter(isHangul).length, 0), [photos])
  const finish = async () => {
    setBusy('글자를 칸으로 옮기고 자모를 나누는 중')
    await new Promise((r) => setTimeout(r, 30))
    try {
      const picks: { ch: string; img: LetterImage; b: Box }[] = []
      for (const ph of photos) for (const [k, v] of Object.entries(ph.labels)) picks.push({ ch: v, img: ph.img, b: ph.boxes[+k] })
      await ensureRefFont(picks.map((x) => x.ch).join(''))
      const base = 2001 + prevCount
      const cells: Cell[] = [...(prev?.cells ?? [])]
      picks.forEach((x, i) => {
        const bm = boxToCell(x.img, x.b, N)
        const seg = isHangul(x.ch) ? segmentScored(bm, x.ch) : null
        cells.push({ index: base + i, char: x.ch, state: 'ok', include: true, bitmap: bm, labels: seg?.labels, segCost: seg?.cost })
      })
      onSheet({ no: LETTER_SHEET, ver: TEMPLATE_VERSION, drawn: true, preview: photos[0]?.src.toDataURL('image/jpeg', 0.6) ?? prev?.preview ?? '', sharpness: 100, capturedAt: Date.now(), cells })
      onNext()
    } finally { setBusy(null) }
  }
  const canFinish = total + prevCount >= 10

  return (
    <main className="wrap screen letter">
      <Head n="03" title="손편지 사진에서 글자 고르기">편지·공책·카드처럼 손으로 쓴 글씨 사진을 올리세요. 글자마다 상자를 찾아 드려요. 사진에 쓰인 글을 그대로 쳐 넣으면 상자에 글자가 차례대로 붙어요. 많이 고를수록 그분의 글씨를 닮아요. 사진은 이 기기 밖으로 나가지 않아요.</Head>
      {prevCount > 0 && <p className="note">이미 고른 글자 {prevCount}자가 있어요. 여기서 고른 글자가 더해져요.</p>}
      <div className="actions">
        <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={!!busy}>{photos.length ? '사진 더 올리기' : '사진 올리기'}</button>
        {photos.length > 1 && photos.map((_, i) => <button key={i} className={`chip ${i === at ? 'on' : ''}`} onClick={() => { setAt(i); setSel(null) }}>사진 {i + 1}</button>)}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden data-testid="letter-file" onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = '' }} />
      {busy && <div className="panel" role="status">{busy}…<EngineStatus /></div>}
      {msg && <p className="note" role="status">{msg}</p>}

      {p && (
        <div className="letter-grid">
          <div className="letter-view">
            <canvas ref={canvas} className={drawMode ? 'drawing' : ''} onPointerDown={down} onPointerMove={move} onPointerUp={up} aria-label="찾은 글자 상자" role="img" />
            <div className="letter-tools">
              <label className="tune-row">
                <span>글씨 진하기 <b>{p.dark <= 0.62 ? '진한 글씨만' : p.dark >= 0.8 ? '연한 글씨까지' : '보통'}</b></span>
                <input type="range" min={0.55} max={0.85} step={0.05} defaultValue={p.dark} onChange={(e) => redo(+e.target.value)} aria-label="글씨 진하기" />
              </label>
              <button className={`btn small ${drawMode ? 'primary' : 'quiet'}`} onClick={() => setDrawMode((d) => !d)}>{drawMode ? '상자를 끌어서 그리세요' : '상자 직접 그리기'}</button>
            </div>
          </div>
          <div className="letter-side">
            <div className="letter-sel">
              {sel != null ? (
                <>
                  <b>고른 상자의 글자</b>
                  <div className="fix-row">
                    <input value={ch} maxLength={2} autoFocus onChange={(e) => setCh(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setLabel(ch) }} aria-label="상자의 글자" placeholder="예: 사" />
                    <button className="btn" onClick={() => setLabel(ch)}>붙이기</button>
                  </div>
                  <div className="row"><button className="btn small quiet" onClick={() => setLabel('')}>글자 떼기</button><button className="btn small quiet" onClick={removeBox}>상자 지우기</button></div>
                </>
              ) : <p className="note">사진의 상자를 누르면 그 글자를 적을 수 있어요. 글자 하나에 상자 하나가 되게, 잘못 나뉜 상자는 지우고 직접 그려 주세요.</p>}
            </div>
            <label className="note" htmlFor="ltext">사진에 쓰인 글 (쳐 넣고 ‘차례대로 붙이기’)</label>
            <textarea id="ltext" className="letter-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 사랑하는 우리 손주에게 …" />
            <button className="btn small" onClick={autoLabel} disabled={!text.trim()}>차례대로 붙이기</button>
            <p className="note">이 사진: 상자 {p.boxes.length}개, 글자 붙인 상자 {Object.keys(p.labels).length}개</p>
          </div>
        </div>
      )}

      <div className="actions draw-finish">
        <button className="btn primary" disabled={!canFinish || !!busy} onClick={finish}>고른 한글 {total + prevCount}자로 다듬기</button>
      </div>
      {!canFinish && <p className="note">한글을 10자 이상 고르면 다음 단계로 갈 수 있어요. 고르지 못한 자모는 기준 글꼴 모양으로 채워져요.</p>}
    </main>
  )
}
