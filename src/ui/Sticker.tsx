// 손글씨 스티커: 내 글씨로 쓴 낱말을 배경 없는 PNG로 (캔바·패들렛·프로필에 붙이기)
import { useEffect, useRef, useState } from 'react'
import { SaveDeclined, saveFile } from '../platform'
import { safeFile } from '../engine/webfont'

const COLORS: [string, string][] = [['#1b1a1f', '검정'], ['#c8321b', '빨강'], ['#1f5fbf', '파랑'], ['#1f7a52', '초록'], ['#6b3fa0', '보라'], ['#e2861b', '주황'], ['#ffffff', '흰색']]
const SIZES: [number, string][] = [[140, '작게'], [220, '보통'], [320, '크게']]

/** 글씨를 투명 바탕 캔버스에 그리고 여백을 잘라 낸다 */
export function renderSticker(text: string, family: string, o: { color: string; size: number; outline: boolean; shadow: boolean }): HTMLCanvasElement {
  const lines = text.split('\n').map((l) => l.trimEnd()).filter((l, i, a) => l || i < a.length - 1).slice(0, 4)
  const pad = Math.round(o.size * 0.25)
  const lh = o.size * 1.15
  const m = document.createElement('canvas').getContext('2d')!
  m.font = `${o.size}px "${family}"`
  const w = Math.ceil(Math.max(1, ...lines.map((l) => m.measureText(l).width))) + pad * 2
  const h = Math.ceil(lh * lines.length) + pad * 2
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const x = c.getContext('2d')!
  x.font = `${o.size}px "${family}"`; x.textBaseline = 'middle'; x.lineJoin = 'round'
  const edge = o.color === '#ffffff' ? '#1b1a1f' : '#ffffff'
  lines.forEach((l, i) => {
    const y = pad + lh * (i + 0.5)
    if (o.shadow) { x.save(); x.shadowColor = 'rgba(0,0,0,0.28)'; x.shadowBlur = o.size * 0.08; x.shadowOffsetY = o.size * 0.04; x.fillStyle = edge; x.strokeStyle = edge; x.lineWidth = o.outline ? o.size * 0.16 : 1; if (o.outline) x.strokeText(l, pad, y); x.fillText(l, pad, y); x.restore() }
    if (o.outline) { x.strokeStyle = edge; x.lineWidth = o.size * 0.16; x.strokeText(l, pad, y) }
    x.fillStyle = o.color; x.fillText(l, pad, y)
  })
  // 투명 여백 잘라 내기
  const d = x.getImageData(0, 0, w, h).data
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (d[(yy * w + xx) * 4 + 3] > 8) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy }
  if (x1 < 0) return c
  const m2 = Math.round(o.size * 0.06)
  const out = document.createElement('canvas')
  out.width = x1 - x0 + 1 + m2 * 2; out.height = y1 - y0 + 1 + m2 * 2
  out.getContext('2d')!.drawImage(c, x0 - m2, y0 - m2, out.width, out.height, 0, 0, out.width, out.height)
  return out
}

export function StickerMaker({ family, fontName }: { family: string | null; fontName: string }) {
  const [text, setText] = useState('참 잘했어요!')
  const [color, setColor] = useState(COLORS[0][0])
  const [size, setSize] = useState(SIZES[1][0])
  const [outline, setOutline] = useState(true)
  const [shadow, setShadow] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!family || !box.current) return
    const c = renderSticker(text || ' ', family, { color, size, outline, shadow })
    c.className = 'sticker-canvas'
    c.setAttribute('role', 'img'); c.setAttribute('aria-label', `스티커 미리보기: ${text}`)
    box.current.replaceChildren(c)
  }, [family, text, color, size, outline, shadow])

  const blob = () => new Promise<Blob>((res, rej) => renderSticker(text, family!, { color, size, outline, shadow }).toBlob((b) => (b ? res(b) : rej(new Error())), 'image/png'))
  const save = async () => {
    setMsg(null)
    try { await saveFile(`${safeFile(fontName)}-${safeFile(text.replace(/\s+/g, ' ').slice(0, 12))}.png`, await blob()); setMsg('PNG로 저장했어요.') } catch (e) { if (!(e instanceof SaveDeclined)) setMsg('저장하지 못했어요.') }
  }
  const copy = async () => {
    setMsg(null)
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob() })]); setMsg('복사했어요. 캔바·패들렛에 붙여 넣으세요.') } catch { setMsg('이 화면에서는 복사가 안 돼요. PNG로 저장해 주세요.') }
  }

  return (
    <section className="sticker" aria-label="손글씨 스티커 만들기">
      <h3>손글씨 스티커 만들기</h3>
      <p className="note">내 글씨로 쓴 낱말을 배경 없는 그림(PNG)으로 저장해요. 칭찬 도장, 이름표, 캔바·패들렛 꾸미기에 쓰세요.</p>
      <div className="sticker-grid">
        <div className="sticker-opts">
          <label className="note" htmlFor="stk">쓸 글 (줄 바꿈 가능)</label>
          <textarea id="stk" value={text} maxLength={60} rows={2} onChange={(e) => setText(e.target.value)} />
          <div className="chips" role="group" aria-label="글씨 색">
            {COLORS.map(([c, l]) => <button key={c} className={`swatch ${color === c ? 'on' : ''}`} style={{ background: c }} aria-label={l} aria-pressed={color === c} onClick={() => setColor(c)} />)}
          </div>
          <div className="seg" role="group" aria-label="크기">
            {SIZES.map(([s, l]) => <button key={s} aria-pressed={size === s} onClick={() => setSize(s)}>{l}</button>)}
          </div>
          <label className="check"><input type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} /> 스티커 테두리</label>
          <label className="check"><input type="checkbox" checked={shadow} onChange={(e) => setShadow(e.target.checked)} /> 그림자</label>
        </div>
        <div className="sticker-preview" ref={box}>{!family && <span className="note">글씨체를 불러오는 중…</span>}</div>
      </div>
      <div className="actions">
        <button className="btn" onClick={save} disabled={!family || !text.trim()}>PNG 저장</button>
        <button className="btn quiet" onClick={copy} disabled={!family || !text.trim()}>그림 복사</button>
        {msg && <span className="note" role="status" style={{ alignSelf: 'center' }}>{msg}</span>}
      </div>
    </section>
  )
}
