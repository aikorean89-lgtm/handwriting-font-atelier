// 글자 하나씩 손보기: 지금 폰트의 글자를 펜·지우개로 고쳐 그 글자만 바꾼다
import { useEffect, useRef, useState } from 'react'
import type { BuildResult } from '../engine/build'
import { type Bitmap, newBitmap } from '../engine/bitmap'
import { isHangul } from '../engine/hangul'
import { penWidth } from '../engine/punct'
import { DrawPad, type DrawPadHandle } from './DrawPad'

export const EDIT_N = 180

const faces = new WeakMap<BuildResult, Promise<string>>()
let seq = 0
export function fontOf(r: BuildResult): Promise<string> {
  let p = faces.get(r)
  if (!p) {
    const fam = `FontGongbangEdit${++seq}`
    const buf = r.ttf.buffer.slice(r.ttf.byteOffset, r.ttf.byteOffset + r.ttf.byteLength) as ArrayBuffer
    p = new FontFace(fam, buf).load().then((f) => { document.fonts.add(f); return fam })
    faces.set(r, p)
  }
  return p
}

/** 폰트의 글자를 칸 좌표(build의 frame)로 되돌려 N×N 비트맵으로 그린다 */
export async function renderGlyph(r: BuildResult, ch: string, n = EDIT_N): Promise<Bitmap> {
  const fam = await fontOf(r)
  const { k, cX, cY } = r.frame
  const c = document.createElement('canvas'); c.width = n; c.height = n
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const F = (1000 * n) / k
  ctx.font = `${F}px "${fam}"`
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#000'
  const ox = isHangul(ch) ? (-n * cX) / k : n * 0.12 - (60 * n) / k
  ctx.fillText(ch, ox, (n * cY) / k)
  const d = ctx.getImageData(0, 0, n, n).data
  const bm = newBitmap(n, n)
  for (let i = 0; i < n * n; i++) bm.data[i] = d[i * 4 + 3] >= 128 ? 1 : 0
  return bm
}

export function GlyphEditor({ ch, result, existing, onSave, onRevert, onClose }: {
  ch: string; result: BuildResult; existing?: Bitmap; onSave: (bm: Bitmap) => void; onRevert?: () => void; onClose: () => void
}) {
  const [initial, setInitial] = useState<Bitmap | null>(null)
  const [pen, setPen] = useState(EDIT_N * 0.045)
  const [err, setErr] = useState<string | null>(null)
  const pad = useRef<DrawPadHandle>(null)
  const dlg = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dlg.current
    if (d && !d.open) d.showModal?.()
    let live = true
    const go = async () => {
      const bm = existing ?? await renderGlyph(result, ch)
      if (!live) return
      const w = penWidth([bm])
      if (w > 1) setPen(Math.min(EDIT_N * 0.09, Math.max(EDIT_N * 0.02, w)))
      setInitial(bm)
    }
    go().catch(() => setErr('글자를 불러오지 못했어요.'))
    return () => { live = false }
  }, [ch, result, existing])

  const save = () => {
    const bm = pad.current?.getBitmap()
    if (!bm) return
    let ink = 0
    for (let i = 0; i < bm.data.length; i++) ink += bm.data[i]
    if (ink < 20) { setErr('글자가 비어 있어요. 펜으로 써 주세요.'); return }
    onSave(bm)
  }

  return (
    <dialog ref={dlg} className="gdetail editor" onClose={onClose} onCancel={onClose} aria-label={`‘${ch}’ 손보기`}>
      <div className="gdetail-head">
        <div>
          <h2>‘{ch}’ 손보기</h2>
          <p className="note">펜으로 덧쓰고 지우개로 지워 고치세요. ‘모두 지우기’ 후 새로 써도 돼요. 저장하면 폰트를 다시 만들어 이 글자만 바뀌어요.</p>
        </div>
        <button className="btn small quiet" onClick={() => { dlg.current?.close(); onClose() }}>닫기</button>
      </div>
      {err && <p className="note" role="alert" style={{ color: 'var(--warn)' }}>{err}</p>}
      {initial ? <DrawPad ref={pad} n={EDIT_N} pen={pen} initial={initial} label={`${ch} 글자 그림판`} onStroke={() => setErr(null)} />
        : !err && <p className="note" role="status">글자를 불러오는 중…</p>}
      <div className="actions" style={{ justifyContent: 'center' }}>
        <button className="btn primary" onClick={save} disabled={!initial}>저장하고 다시 만들기</button>
        <button className="btn quiet" onClick={() => pad.current?.clear()} disabled={!initial}>모두 지우기</button>
        <button className="btn quiet" onClick={() => pad.current?.reset()} disabled={!initial}>처음 모양으로</button>
        {onRevert && <button className="btn quiet" onClick={onRevert}>손보기 전으로 되돌리기</button>}
      </div>
    </dialog>
  )
}
