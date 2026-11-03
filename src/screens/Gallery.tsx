import { useEffect, useMemo, useRef, useState } from 'react'
import { type GalleryFont, GalleryError, gallery, rememberSpace, savedSpace } from '../gallery/backend'
import { PREVIEW_LINES } from '../gallery/preview'
import { MAX_TAGS, TAGS } from '../gallery/tags'
import { SaveDeclined, saveFile } from '../platform'
import { InstallGuide } from '../ui/InstallGuide'
import { StickerMaker } from '../ui/Sticker'

const fmtDate = (t: number) => new Date(t).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
type Sort = 'new' | 'popular'

/** 태그 고르기 (최대 3개) */
export function TagPicker({ value, onChange }: { value: string[]; onChange: (t: string[]) => void }) {
  return (
    <div className="chips" role="group" aria-label="태그 고르기">
      {TAGS.map((t) => {
        const on = value.includes(t)
        const full = !on && value.length >= MAX_TAGS
        return (
          <button key={t} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} disabled={full}
            onClick={() => onChange(on ? value.filter((x) => x !== t) : [...value, t])}>{t}</button>
        )
      })}
    </div>
  )
}

function Heart({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden width="16" height="16">
      <path d="M8 14s-5.5-3.4-5.5-7.2A3 3 0 0 1 8 4.6a3 3 0 0 1 5.5 2.2C13.5 10.6 8 14 8 14z" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export function GalleryScreen({ onMake }: { onMake: () => void }) {
  const [fonts, setFonts] = useState<GalleryFont[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [setup, setSetup] = useState(false) // 사이트에 저장소가 아직 연결되지 않음
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('new')
  const [tag, setTag] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [mod, setMod] = useState(false)
  // 관리자도 기본은 잠금: 잠금을 풀어야 다른 사람 글씨체를 내릴 수 있다 (이 화면에 있는 동안만)
  const [unlocked, setUnlocked] = useState(false)
  const [askUnlock, setAskUnlock] = useState(false)
  const [likeErr, setLikeErr] = useState<string | null>(null)
  // 우리 학교 공간: 코드를 넣으면 그 공간에 올린 글씨체만 보인다
  const [space, setSpace] = useState(() => savedSpace())
  const [spaceDraft, setSpaceDraft] = useState('')
  const [spaceOpen, setSpaceOpen] = useState(false)

  const load = (sp = space) => {
    setErr(null); setFonts(null)
    gallery().list(sp || undefined).then((f) => { setSetup(false); setFonts(f) }).catch((e) => {
      if (e instanceof GalleryError && e.setup) { setSetup(true); setFonts([]); return }
      setErr(e instanceof GalleryError ? e.message : '갤러리를 불러오지 못했어요.'); setFonts([])
    })
  }
  const enterSpace = (code: string) => {
    const c = code.trim()
    if (c && (c.length < 2 || c.length > 30)) { setErr('공간 코드는 2–30자예요.'); return }
    setSpace(c); rememberSpace(c); setSpaceOpen(false); setTag(null); load(c)
  }
  useEffect(() => {
    // 관리자 열쇠: 주소 끝에 #gallery?admin=열쇠 를 한 번 붙여 열면 이 브라우저에 기억한다
    const m = /admin=([^&]+)/.exec(location.hash)
    if (m) { try { localStorage.setItem('fontgongbang.admin', decodeURIComponent(m[1])) } catch { /* */ } history.replaceState(null, '', '#gallery') }
    load()
    gallery().canModerate().then(setMod).catch(() => {})
  }, [])

  const patch = (id: string, p: Partial<GalleryFont>) => setFonts((fs) => (fs ?? []).map((f) => (f.id === id ? { ...f, ...p } : f)))
  const toggleLike = async (f: GalleryFont) => {
    setLikeErr(null)
    const on = !f.liked
    patch(f.id, { liked: on, likes: Math.max(0, f.likes + (on ? 1 : -1)) })
    try { const n = await gallery().like(f.id, on); patch(f.id, { likes: n, liked: on }) } catch (e) {
      patch(f.id, { liked: f.liked, likes: f.likes })
      setLikeErr((e as Error).message)
    }
  }

  const tagCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of fonts ?? []) for (const t of f.tags) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  }, [fonts])

  const shown = useMemo(() => {
    const t = q.trim()
    const list = (fonts ?? []).filter((f) => (!t || f.name.includes(t) || f.author.includes(t)) && (!tag || f.tags.includes(tag)))
    return sort === 'popular' ? [...list].sort((a, b) => b.likes - a.likes || b.createdAt - a.createdAt) : list
  }, [fonts, q, tag, sort])
  const open = openId ? (fonts ?? []).find((f) => f.id === openId) ?? null : null

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
        <div className="seg" role="group" aria-label="정렬">
          <button aria-pressed={sort === 'new'} onClick={() => setSort('new')}>최신순</button>
          <button aria-pressed={sort === 'popular'} onClick={() => setSort('popular')}>인기순</button>
        </div>
        <span className="note count" aria-live="polite">{fonts ? `${shown.length}개` : '불러오는 중'}</span>
        {!space && !spaceOpen && <button className="btn small quiet space-btn" onClick={() => { setSpaceOpen(true); setSpaceDraft('') }}>🏫 우리 학교 공간</button>}
      </div>
      {spaceOpen && (
        <div className="space-bar">
          <span>학교·학급에서 정한 <b>공간 코드</b>를 넣으면, 그 공간에 올린 글씨체만 모아 볼 수 있어요. 공간의 글씨체는 전체 갤러리에는 보이지 않아요.</span>
          <input value={spaceDraft} maxLength={30} placeholder="예: 남성현초2026" aria-label="공간 코드" onChange={(e) => setSpaceDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') enterSpace(spaceDraft) }} />
          <button className="btn small primary" onClick={() => enterSpace(spaceDraft)} disabled={spaceDraft.trim().length < 2}>들어가기</button>
          <button className="btn small quiet" onClick={() => setSpaceOpen(false)}>취소</button>
        </div>
      )}
      {space && (
        <div className="space-bar in">
          <span>🏫 <b>{space}</b> 공간 · 이 공간에 올린 글씨체만 보여요. 올릴 때 같은 코드를 넣으면 여기에 모여요.</span>
          <button className="btn small" onClick={() => enterSpace('')}>전체 갤러리로</button>
        </div>
      )}
      <div className="chips tag-filter" role="group" aria-label="태그로 거르기">
        <button className={`chip ${tag == null ? 'on' : ''}`} aria-pressed={tag == null} onClick={() => setTag(null)}>전체</button>
        {TAGS.map((t) => (
          <button key={t} className={`chip ${tag === t ? 'on' : ''}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
            {t}{tagCount.get(t) ? <span className="count"> {tagCount.get(t)}</span> : null}
          </button>
        ))}
      </div>

      {mod && (
        <div className={`mod-bar ${unlocked ? 'open' : ''}`}>
          {!unlocked && !askUnlock && <><span>🔒 관리자 내리기 잠김 · 지금은 내가 올린 글씨체만 내릴 수 있어요.</span><button className="btn small quiet" onClick={() => setAskUnlock(true)}>잠금 풀기</button></>}
          {askUnlock && <><span>다른 사람이 올린 글씨체도 내릴 수 있게 잠금을 풀까요? 이 화면을 떠나면 다시 잠겨요.</span><button className="btn small danger" onClick={() => { setUnlocked(true); setAskUnlock(false) }}>잠금 풀기</button><button className="btn small quiet" onClick={() => setAskUnlock(false)}>취소</button></>}
          {unlocked && <><span>🔓 관리자 모드 · 모든 글씨체에 ‘내리기’가 보여요.</span><button className="btn small" onClick={() => setUnlocked(false)}>다시 잠그기</button></>}
        </div>
      )}

      {setup && (
        <div className="setup-box" role="status">
          <p><b>갤러리를 준비하고 있어요.</b> 이 사이트에 글씨체를 모아 둘 저장소가 아직 연결되지 않아, 지금은 갤러리를 볼 수도 올릴 수도 없어요. 폰트 만들기와 내려받기는 그대로 돼요.</p>
          <details>
            <summary>사이트 관리자라면: 저장소 연결 방법 (5분)</summary>
            <ol>
              <li>vercel.com에 로그인해 이 사이트의 프로젝트를 엽니다.</li>
              <li>위쪽 <b>Storage</b> 탭 → <b>Create Database</b> → <b>Blob</b>을 고르고 이름(예: fontgongbang-gallery)을 정해 만듭니다. 지역은 Seoul(icn1)이 좋아요.</li>
              <li>만든 저장소를 이 프로젝트에 <b>Connect</b>합니다. Production·Preview·Development를 모두 체크하세요.</li>
              <li><b>Deployments</b> 탭에서 가장 최근 배포의 ⋯ → <b>Redeploy</b>를 누릅니다. 연결은 새로 배포해야 적용돼요.</li>
              <li>이 화면을 새로 고치면 갤러리가 열려요.</li>
            </ol>
            <p className="note">공개(Public)·비공개(Private) 저장소 어느 쪽이든 돼요. 관리자 열쇠를 쓰려면 Settings → Environment Variables에 GALLERY_ADMIN_TOKEN을 넣으세요.</p>
          </details>
          <button className="btn small quiet" onClick={() => load()}>다시 확인</button>
        </div>
      )}

      {err && <div className="error" role="alert">{err} <button className="btn small quiet" onClick={() => load()}>다시 불러오기</button></div>}
      {likeErr && <div className="error" role="alert">{likeErr}</div>}

      {fonts && !err && !setup && fonts.length === 0 && (
        <div className="gallery-empty">
          <span className="seal-big" aria-hidden>글</span>
          <p><b>{space ? `‘${space}’ 공간에 아직 올라온 글씨체가 없어요.` : '아직 올라온 글씨체가 없어요.'}</b><br />{space ? '폰트를 만들고 마지막 단계에서 ‘우리 학교 공간에만’을 고른 뒤 같은 코드를 넣으세요.' : '처음으로 내 손글씨를 올려 보세요. 마지막 단계에서 공개를 고르면 여기에 보여요.'}</p>
          <button className="btn primary" onClick={onMake}>폰트 만들기</button>
        </div>
      )}
      {fonts && fonts.length > 0 && shown.length === 0 && <p className="note">조건에 맞는 글씨체가 없어요.</p>}

      <ul className="gallery-grid" aria-label="글씨체 목록">
        {fonts == null && Array.from({ length: 6 }, (_, i) => <li key={i} className="gcard skeleton" aria-hidden />)}
        {shown.map((f) => (
          <li key={f.id} className="gcard">
            <button onClick={() => setOpenId(f.id)} aria-label={`${f.name} 자세히 보기`}>
              <span className="gcard-img">{f.previewUrl ? <img src={f.previewUrl} alt="" loading="lazy" /> : <span className="note">미리보기 없음</span>}</span>
              <span className="gcard-meta">
                <b>{f.name}</b>
                <span>{f.author || '이름 없이'} · {fmtDate(f.createdAt)}</span>
                {f.tags.length > 0 && <span className="gcard-tags">{f.tags.map((t) => <i key={t}>#{t}</i>)}</span>}
              </span>
              {f.mine && <span className="mine">내 글씨</span>}
            </button>
            <button className={`like ${f.liked ? 'on' : ''}`} onClick={() => toggleLike(f)} aria-pressed={f.liked} aria-label={`${f.name} 좋아요 ${f.likes}개${f.liked ? ', 누름' : ''}`}>
              <Heart on={f.liked} /><span className="count">{f.likes}</span>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <FontDetail
          font={open} canRemove={open.mine || (mod && unlocked)} asAdmin={!open.mine && mod && unlocked}
          onLike={() => toggleLike(open)} onTags={(t) => patch(open.id, { tags: t })}
          onClose={() => setOpenId(null)}
          onRemoved={() => { setFonts((fs) => (fs ?? []).filter((x) => x.id !== open.id)); setOpenId(null) }}
        />
      )}
    </main>
  )
}

let detailSeq = 0

function FontDetail({ font, canRemove, asAdmin, onLike, onTags, onClose, onRemoved }: {
  font: GalleryFont; canRemove: boolean; asAdmin: boolean; onLike: () => void; onTags: (t: string[]) => void; onClose: () => void; onRemoved: () => void
}) {
  const [fam, setFam] = useState<string | null>(null)
  const [fail, setFail] = useState(false)
  const [text, setText] = useState(PREVIEW_LINES.join('\n'))
  const [msg, setMsg] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [editTags, setEditTags] = useState<string[] | null>(null)
  const [guide, setGuide] = useState(false)
  const [sticker, setSticker] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)
  const bytes = useRef<Promise<Uint8Array> | null>(null)
  const getTtf = () => {
    if (!bytes.current) bytes.current = fetch(font.ttfUrl).then((r) => { if (!r.ok) throw new Error('파일을 받지 못했어요.'); return r.arrayBuffer() }).then((b) => new Uint8Array(b))
    bytes.current.catch(() => { bytes.current = null })
    return bytes.current
  }

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal?.()
    let face: FontFace | null = null
    const name = `FontGongbangGallery${++detailSeq}`
    getTtf()
      .then((buf) => { face = new FontFace(name, buf.slice().buffer); return face.load() })
      .then((f) => { document.fonts.add(f); setFam(name) })
      .catch(() => setFail(true))
    return () => { if (face) document.fonts.delete(face) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [font.id])

  const download = async () => {
    setMsg(null)
    try {
      await saveFile(`${font.name.replace(/[\\/:*?"<>|]/g, '') || '손글씨'}.ttf`, new Blob([(await getTtf()) as BlobPart], { type: 'font/ttf' }))
      setMsg('내려받았어요. 아래 ‘설치 방법’을 보세요.'); setGuide(true)
    } catch (e) { if (!(e instanceof SaveDeclined)) setMsg((e as Error).message) }
  }
  const remove = async () => {
    try { await gallery().remove(font.id); onRemoved() } catch (e) { setMsg((e as Error).message) }
  }
  const saveTags = async () => {
    if (!editTags) return
    try { await gallery().setTags(font.id, editTags); onTags(editTags); setEditTags(null); setMsg('태그를 고쳤어요.') } catch (e) { setMsg((e as Error).message) }
  }

  return (
    <dialog ref={ref} className="gdetail" onClose={onClose} onCancel={onClose} aria-label={`${font.name} 글씨체`}>
      <div className="gdetail-head">
        <div>
          <h2>{font.name}</h2>
          <p className="note">{font.author || '이름 없이'} · {fmtDate(font.createdAt)} · 직접 쓴 한글 {font.direct}자 · {font.sizeKB.toLocaleString('ko-KR')}KB</p>
          {font.tags.length > 0 && !editTags && <p className="gcard-tags">{font.tags.map((t) => <i key={t}>#{t}</i>)}</p>}
        </div>
        <div className="row">
          <button className={`like big ${font.liked ? 'on' : ''}`} onClick={onLike} aria-pressed={font.liked} aria-label={`좋아요 ${font.likes}개${font.liked ? ', 누름' : ''}`}>
            <Heart on={font.liked} /><span className="count">{font.likes}</span>
          </button>
          <button className="btn small quiet" onClick={() => { ref.current?.close(); onClose() }} aria-label="닫기">닫기</button>
        </div>
      </div>
      {editTags && (
        <div className="tag-field">
          <TagPicker value={editTags} onChange={setEditTags} />
          <div className="row"><button className="btn small primary" onClick={saveTags}>태그 저장</button><button className="btn small quiet" onClick={() => setEditTags(null)}>취소</button></div>
        </div>
      )}
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
        <button className="btn quiet" onClick={() => setGuide((g) => !g)} aria-expanded={guide}>설치 방법·웹폰트</button>
        {fam && <button className="btn quiet" onClick={() => setSticker((g) => !g)} aria-expanded={sticker}>스티커 만들기</button>}
        {font.mine && !editTags && <button className="btn quiet" onClick={() => setEditTags(font.tags)}>태그 고치기</button>}
        {canRemove && !confirm && <button className="btn quiet" onClick={() => setConfirm(true)}>{asAdmin ? '관리자 권한으로 내리기' : '갤러리에서 내리기'}</button>}
        {confirm && <><button className="btn danger" onClick={remove}>정말 내리기</button><button className="btn quiet" onClick={() => setConfirm(false)}>취소</button></>}
        {msg && <span className="note" role="status" style={{ alignSelf: 'center' }}>{msg}</span>}
      </div>
      {sticker && fam && <StickerMaker family={fam} fontName={font.name} />}
      {guide && <InstallGuide family={font.name} getTtf={getTtf} />}
      <p className="note">갤러리의 글씨체는 쓴 사람의 것이에요. 개인 문서나 수업 자료에 쓰고, 다시 팔거나 다른 이름으로 퍼뜨리지 마세요.{!font.mine && ' 내리기는 글씨체를 올린 사람만 할 수 있어요.'}</p>
    </dialog>
  )
}
