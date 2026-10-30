import { useEffect, useMemo, useRef, useState } from 'react'
import { type GalleryFont, GalleryError, gallery } from '../gallery/backend'
import { PREVIEW_LINES } from '../gallery/preview'
import { SaveDeclined, saveFile } from '../platform'

const fmtDate = (t: number) => new Date(t).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

export function GalleryScreen({ onMake }: { onMake: () => void }) {
  const [fonts, setFonts] = useState<GalleryFont[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<GalleryFont | null>(null)
  const [mod, setMod] = useState(false)

  const load = () => {
    setErr(null)
    gallery().list().then(setFonts).catch((e) => { setErr(e instanceof GalleryError ? e.message : '갤러리를 불러오지 못했어요.'); setFonts([]) })
  }
  useEffect(() => {
    // 관리자 열쇠: 주소 끝에 #gallery?admin=열쇠 를 한 번 붙여 열면 이 브라우저에 기억한다
    const m = /admin=([^&]+)/.exec(location.hash)
    if (m) { try { localStorage.setItem('fontgongbang.admin', decodeURIComponent(m[1])) } catch { /* */ } history.replaceState(null, '', '#gallery') }
    load()
    gallery().canModerate().then(setMod).catch(() => {})
  }, [])

  const shown = useMemo(() => {
    const t = q.trim()
    return (fonts ?? []).filter((f) => !t || f.name.includes(t) || f.author.includes(t))
  }, [fonts, q])

  return (
    <main className="wrap screen gallery">
      <div className="gallery-head">
        <div>
          <p className="eyebrow">글씨체 갤러리</p>
          <h1>다른 사람의 손글씨를 둘러보세요</h1>
          <p className="lede">폰트공방에서 만들고 공개한 글씨체입니다. 눌러서 문장을 써 보고, 마음에 들면 내려받을 수 있어요.</p>
        </div>
        <button className="btn primary" onClick={onMake}>내 글씨로 만들기</button>
      </div>

      <div className="gallery-tools">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="글씨체 이름이나 만든 사람" aria-label="글씨체 찾기" />
        <span className="note count" aria-live="polite">{fonts ? `${shown.length}개` : '불러오는 중'}</span>
      </div>

      {err && <div className="error" role="alert">{err} <button className="btn small quiet" onClick={load}>다시 불러오기</button></div>}

      {fonts && !err && fonts.length === 0 && (
        <div className="gallery-empty">
          <span className="seal-big" aria-hidden>글</span>
          <p><b>아직 올라온 글씨체가 없어요.</b><br />처음으로 내 손글씨를 올려 보세요. 마지막 단계에서 공개를 고르면 여기에 보여요.</p>
          <button className="btn primary" onClick={onMake}>폰트 만들기</button>
        </div>
      )}

      <ul className="gallery-grid" aria-label="글씨체 목록">
        {fonts == null && Array.from({ length: 6 }, (_, i) => <li key={i} className="gcard skeleton" aria-hidden />)}
        {shown.map((f) => (
          <li key={f.id} className="gcard">
            <button onClick={() => setOpen(f)} aria-label={`${f.name} 자세히 보기`}>
              <span className="gcard-img">{f.previewUrl ? <img src={f.previewUrl} alt="" loading="lazy" /> : <span className="note">미리보기 없음</span>}</span>
              <span className="gcard-meta">
                <b>{f.name}</b>
                <span>{f.author || '이름 없이'} · {fmtDate(f.createdAt)}</span>
              </span>
              {f.mine && <span className="mine">내 글씨</span>}
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <FontDetail
          font={open} canRemove={open.mine || mod}
          onClose={() => setOpen(null)}
          onRemoved={() => { setFonts((fs) => (fs ?? []).filter((x) => x.id !== open.id)); setOpen(null) }}
        />
      )}
    </main>
  )
}

let detailSeq = 0

function FontDetail({ font, canRemove, onClose, onRemoved }: { font: GalleryFont; canRemove: boolean; onClose: () => void; onRemoved: () => void }) {
  const [fam, setFam] = useState<string | null>(null)
  const [fail, setFail] = useState(false)
  const [text, setText] = useState(PREVIEW_LINES.join('\n'))
  const [msg, setMsg] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal?.()
    let face: FontFace | null = null
    const name = `FontGongbangGallery${++detailSeq}`
    fetch(font.ttfUrl).then((r) => { if (!r.ok) throw new Error(); return r.arrayBuffer() })
      .then((buf) => { face = new FontFace(name, buf); return face.load() })
      .then((f) => { document.fonts.add(f); setFam(name) })
      .catch(() => setFail(true))
    return () => { if (face) document.fonts.delete(face) }
  }, [font])

  const download = async () => {
    setMsg(null)
    try {
      const r = await fetch(font.ttfUrl)
      if (!r.ok) throw new Error('파일을 받지 못했어요.')
      await saveFile(`${font.name.replace(/[\\/:*?"<>|]/g, '') || '손글씨'}.ttf`, new Blob([await r.arrayBuffer()], { type: 'font/ttf' }))
      setMsg('내려받았어요.')
    } catch (e) { if (!(e instanceof SaveDeclined)) setMsg((e as Error).message) }
  }
  const remove = async () => {
    try { await gallery().remove(font.id); onRemoved() } catch (e) { setMsg((e as Error).message) }
  }

  return (
    <dialog ref={ref} className="gdetail" onClose={onClose} onCancel={onClose} aria-label={`${font.name} 글씨체`}>
      <div className="gdetail-head">
        <div>
          <h2>{font.name}</h2>
          <p className="note">{font.author || '이름 없이'} · {fmtDate(font.createdAt)} · 직접 쓴 한글 {font.direct}자 · {font.sizeKB.toLocaleString('ko-KR')}KB</p>
        </div>
        <button className="btn small quiet" onClick={() => { ref.current?.close(); onClose() }} aria-label="닫기">닫기</button>
      </div>
      {fail && <p className="note" style={{ color: 'var(--warn)' }}>글씨체를 불러오지 못해 견본 그림만 보여요.</p>}
      {fam ? (
        <>
          <textarea className="play-input" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} style={{ fontFamily: `'${fam}'` }} aria-label="써 볼 문장" />
          <div className="waterfall" aria-label="크기별 미리보기">
            {[16, 28, 48].map((s) => <div key={s}><span className="count">{s}px</span><p style={{ fontSize: s, fontFamily: `'${fam}'` }}>{text.split('\n')[0]}</p></div>)}
          </div>
        </>
      ) : !fail ? <p className="note" role="status">글씨체를 불러오는 중…</p> : font.previewUrl && <img className="gdetail-img" src={font.previewUrl} alt={`${font.name} 견본`} />}
      <div className="actions">
        <button className="btn primary" onClick={download}>TTF 내려받기</button>
        {canRemove && !confirm && <button className="btn quiet" onClick={() => setConfirm(true)}>갤러리에서 내리기</button>}
        {confirm && <button className="btn danger" onClick={remove}>정말 내리기</button>}
        {msg && <span className="note" role="status" style={{ alignSelf: 'center' }}>{msg}</span>}
      </div>
      <p className="note">갤러리의 글씨체는 쓴 사람의 것이에요. 개인 문서나 수업 자료에 쓰고, 다시 팔거나 다른 이름으로 퍼뜨리지 마세요.</p>
    </dialog>
  )
}
