import { useEffect, useRef, useState } from 'react'
import { Head } from '../ui/common'
import { writeFont, type BuildResult } from '../engine/build'
import { SaveDeclined, saveFile } from '../platform'
import { type GalleryFont, gallery, rememberSpace, savedSpace } from '../gallery/backend'
import { makePreview } from '../gallery/preview'
import { TagPicker } from './Gallery'
import { InstallGuide } from '../ui/InstallGuide'
import { addRecord } from '../history'

type Pub = { k: 'idle' } | { k: 'busy' } | { k: 'done'; font: GalleryFont } | { k: 'error'; msg: string } | { k: 'removed' }

export function ExportScreen({ result, name, onName, onGallery, onGrowth }: {
  result: BuildResult; name: string; onName: (n: string) => void; onGallery: () => void; onGrowth: () => void
}) {
  const [share, setShare] = useState(true)
  // 갤러리 저장소가 연결돼 있는지 미리 본다 (연결 안 됐으면 공개를 끄고 이유를 알려 준다)
  const [galleryOk, setGalleryOk] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    gallery().canPublish().then((ok) => { if (!live) return; setGalleryOk(ok); if (ok === false) setShare(false) }).catch(() => {})
    return () => { live = false }
  }, [])
  const [author, setAuthor] = useState(() => { try { return localStorage.getItem('fontgongbang.author') ?? '' } catch { return '' } })
  const [pub, setPub] = useState<Pub>({ k: 'idle' })
  const [draft, setDraft] = useState(name || '')
  const [sealed, setSealed] = useState<{ blob: Blob; file: string; family: string } | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [pressing, setPressing] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [where, setWhere] = useState<'all' | 'space'>(() => (savedSpace() ? 'space' : 'all'))
  const [space, setSpace] = useState(() => savedSpace())
  const [rec, setRec] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const timer = useRef(0)
  const family = draft.trim() || '내 손글씨'


  const seal = () => {
    const ttf = writeFont(result.glyphs, family)
    const blob = new Blob([ttf as BlobPart], { type: 'font/ttf' })
    const file = `${family.replace(/[\\/:*?"<>|]/g, '')}.ttf`
    setSealed({ blob, file, family }); setSaveMsg(null)
    onName(family)
    if (share) publish(ttf, blob)
  }
  const publish = async (ttf: Uint8Array, blob: Blob) => {
    setPub({ k: 'busy' })
    try { localStorage.setItem('fontgongbang.author', author.trim()) } catch { /* */ }
    try {
      const preview = await makePreview(ttf)
      const sp = where === 'space' && space.trim().length >= 2 ? space.trim() : undefined
      if (sp) rememberSpace(sp)
      const font = await gallery().publish({ name: family, author: author.trim(), ttf: blob, preview, direct: result.directHangul, tags, space: sp })
      setPub({ k: 'done', font })
    } catch (e) { setPub({ k: 'error', msg: (e as Error).message || '갤러리에 올리지 못했어요.' }) }
  }
  const unpublish = async () => {
    if (pub.k !== 'done') return
    try { await gallery().remove(pub.font.id); setPub({ k: 'removed' }) } catch (e) { setPub({ k: 'error', msg: (e as Error).message }) }
  }
  const start = () => { setPressing(true); timer.current = window.setTimeout(() => { setPressing(false); seal() }, 700) }
  const cancel = () => { setPressing(false); clearTimeout(timer.current) }

  return (
    <main className="wrap screen">
      <Head n="05" title="이름을 짓고 낙관을 찍으세요">폰트 메뉴에 보일 이름입니다. 낙관 버튼을 길게 누르면 TTF 파일이 만들어집니다.</Head>

      <section className="specimen" aria-label="폰트 견본">
        {sealed && <div className="stamp" aria-hidden>{family.slice(0, 2)}</div>}
        <p className="name">{family}</p>
        <p className="sample">가나다라마바사 아자차카타파하<br />다람쥐 헌 쳇바퀴에 타고파 0123456789</p>
        <div className="meta">
          <div><b className="count">11,172</b>한글 음절</div>
          <div><b className="count">{result.directHangul}</b>직접 쓴 한글</div>
          <div><b className="count">{result.extraChars}</b>숫자·영문·기호</div>
          <div><b className="count">{Math.round(result.ttf.length / 1024).toLocaleString('ko-KR')}KB</b>파일 크기</div>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 32, alignItems: 'end', flexWrap: 'wrap' }}>
        <div className="name-field" style={{ flex: '1 1 320px' }}>
          <label htmlFor="fname">폰트 이름</label>
          <input id="fname" value={draft} maxLength={24} placeholder="예: 쪼아쌤 손글씨" onChange={(e) => { setDraft(e.target.value); setSealed(null) }} />
          <span className="note">24자까지. 한글 이름도 됩니다.</span>
        </div>
        <div className="name-field" style={{ flex: '0 1 220px' }}>
          <label htmlFor="fauthor">만든 사람 (갤러리에 보임)</label>
          <input id="fauthor" value={author} maxLength={20} placeholder="예: 쪼아쌤" onChange={(e) => setAuthor(e.target.value)} />
          <span className="note">비워 두면 이름 없이 올라가요.</span>
        </div>
        <button
          className={`seal-btn ${pressing ? 'pressing' : ''}`} onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); seal() } }}
          aria-label="낙관 찍기: 길게 누르면 폰트 파일을 만듭니다"
        >
          <span className="fill" aria-hidden />
          <span>낙관<small>길게 누르기</small></span>
        </button>
      </div>

      <label className="share-opt">
        <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} disabled={!!sealed || galleryOk === false} />
        <span><b>갤러리에 공개하기</b> 낙관을 찍으면 이 폰트 파일과 견본이 글씨체 갤러리에 올라가, 다른 사람도 보고 내려받을 수 있어요. 원본 사진은 올라가지 않아요. 언제든 내릴 수 있어요.</span>
      </label>
      {galleryOk === false && (
        <p className="note gallery-off" role="status">지금은 이 사이트에 <b>갤러리 저장소가 연결되지 않아</b> 갤러리에 올릴 수 없어요. 폰트 파일 내려받기와 성장 기록 저장은 그대로 돼요. (관리자가 Vercel에서 Blob 저장소를 연결하면 바로 열려요)</p>
      )}
      {share && !sealed && (
        <div className="tag-field">
          <span className="note">내 글씨를 설명하는 태그 (3개까지, 갤러리에서 찾을 때 쓰여요)</span>
          <TagPicker value={tags} onChange={setTags} />
          <div className="seg" role="group" aria-label="공개 범위">
            <button aria-pressed={where === 'all'} onClick={() => setWhere('all')}>모두에게 공개</button>
            <button aria-pressed={where === 'space'} onClick={() => setWhere('space')}>🏫 우리 학교 공간에만</button>
          </div>
          {where === 'space' && (
            <label className="space-field">
              <span className="note">공간 코드 (선생님이 정해 준 코드, 2–30자). 같은 코드를 넣은 사람만 갤러리에서 볼 수 있어요.</span>
              <input value={space} maxLength={30} placeholder="예: 남성현초2026" onChange={(e) => setSpace(e.target.value)} />
            </label>
          )}
        </div>
      )}

      {result.autoPunct.length > 0 && (
        <p className="note">쓰지 않은 문장부호 {result.autoPunct.length}개({result.autoPunct.join(' ')})는 내 펜 굵기에 맞춰 자동으로 그렸어요.</p>
      )}

      {result.missingJamo.length > 0 && (
        <p className="note" style={{ color: 'var(--warn)' }}>
          직접 받지 못한 자모({result.missingJamo.join(', ')})는 기준 글꼴 모양으로 채웠어요. 해당 칸을 다시 찍으면 바뀝니다.
        </p>
      )}

      {sealed && (
        <div className="actions">
          <button className="btn primary" onClick={async () => {
            setSaveMsg(null)
            try { await saveFile(sealed.file, sealed.blob); setSaveMsg('내려받았어요. 아래 설치 방법을 따라 설치하세요.') } catch (e) { setSaveMsg(e instanceof SaveDeclined ? null : (e as Error).message) }
          }}>{sealed.file} 내려받기</button>
          <button className="btn quiet" disabled={rec === 'busy' || rec === 'done'} onClick={async () => {
            setRec('busy')
            try {
              await addRecord({ name: sealed.family, label: sealed.family, direct: result.directHangul, ttf: new Uint8Array(await sealed.blob.arrayBuffer()) })
              setRec('done')
            } catch { setRec('error') }
          }}>{rec === 'done' ? '성장 기록에 저장됨' : '성장 기록에 저장'}</button>
          {rec === 'done' && <button className="linkish" style={{ alignSelf: 'center' }} onClick={onGrowth}>기록 보기 →</button>}
          {rec === 'error' && <span className="note" role="alert" style={{ alignSelf: 'center' }}>기록을 저장하지 못했어요.</span>}
          {saveMsg && <span className="note" role="status" style={{ alignSelf: 'center' }}>{saveMsg}</span>}
        </div>
      )}
      {sealed && pub.k !== 'idle' && (
        <div className={`pub pub-${pub.k}`} role="status" aria-live="polite">
          {pub.k === 'busy' && <span>갤러리에 올리는 중…</span>}
          {pub.k === 'done' && <><span><b>갤러리에 올렸어요.</b> {where === 'space' && space.trim().length >= 2 ? `‘${space.trim()}’ 공간에서 “${pub.font.name}” 글씨체를 볼 수 있어요.` : `이제 다른 사람도 “${pub.font.name}” 글씨체를 볼 수 있어요.`}</span><button className="btn small" onClick={onGallery}>갤러리 보기</button><button className="btn small quiet" onClick={unpublish}>갤러리에서 내리기</button></>}
          {pub.k === 'removed' && <><span>갤러리에서 내렸어요. 내 컴퓨터에 받은 파일은 그대로예요.</span><button className="btn small quiet" onClick={() => publish(writeFont(result.glyphs, sealed.family), sealed.blob)}>다시 올리기</button></>}
          {pub.k === 'error' && <><span>{pub.msg}</span><button className="btn small quiet" onClick={() => publish(writeFont(result.glyphs, sealed.family), sealed.blob)}>다시 시도</button></>}
        </div>
      )}
      {sealed && !share && pub.k === 'idle' && galleryOk !== false && (
        <p className="note">갤러리에 올리지 않았어요. <button className="linkish" onClick={() => { setShare(true); publish(writeFont(result.glyphs, sealed.family), sealed.blob) }}>지금 올리기</button></p>
      )}

      <InstallGuide family={sealed?.family ?? family} getTtf={async () => (sealed ? new Uint8Array(await sealed.blob.arrayBuffer()) : writeFont(result.glyphs, family))} />
    </main>
  )
}

