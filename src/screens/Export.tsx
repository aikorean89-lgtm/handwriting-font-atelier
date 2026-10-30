import { useRef, useState } from 'react'
import { Head } from '../ui/common'
import { writeFont, type BuildResult } from '../engine/build'
import { SaveDeclined, saveFile } from '../platform'
import { type GalleryFont, gallery } from '../gallery/backend'
import { makePreview } from '../gallery/preview'

type Os = 'win' | 'mac' | 'hwp' | 'web' | 'phone'

type Pub = { k: 'idle' } | { k: 'busy' } | { k: 'done'; font: GalleryFont } | { k: 'error'; msg: string } | { k: 'removed' }

export function ExportScreen({ result, name, onName, onGallery }: {
  result: BuildResult; name: string; onName: (n: string) => void; onGallery: () => void
}) {
  const [share, setShare] = useState(true)
  const [author, setAuthor] = useState(() => { try { return localStorage.getItem('fontgongbang.author') ?? '' } catch { return '' } })
  const [pub, setPub] = useState<Pub>({ k: 'idle' })
  const [draft, setDraft] = useState(name || '')
  const [sealed, setSealed] = useState<{ blob: Blob; file: string; family: string } | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [pressing, setPressing] = useState(false)
  const [tab, setTab] = useState<Os>('win')
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
      const font = await gallery().publish({ name: family, author: author.trim(), ttf: blob, preview, direct: result.directHangul })
      setPub({ k: 'done', font })
    } catch (e) { setPub({ k: 'error', msg: (e as Error).message || '갤러리에 올리지 못했어요.' }) }
  }
  const unpublish = async () => {
    if (pub.k !== 'done') return
    try { await gallery().remove(pub.font.id); setPub({ k: 'removed' }) } catch (e) { setPub({ k: 'error', msg: (e as Error).message }) }
  }
  const start = () => { setPressing(true); timer.current = window.setTimeout(() => { setPressing(false); seal() }, 700) }
  const cancel = () => { setPressing(false); clearTimeout(timer.current) }

  const css = `@font-face {\n  font-family: '${family}';\n  src: url('${sealed?.file ?? `${family}.ttf`}') format('truetype');\n  font-display: swap;\n}\nbody { font-family: '${family}', sans-serif; }`
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
        <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} disabled={!!sealed} />
        <span><b>갤러리에 공개하기</b> 낙관을 찍으면 이 폰트 파일과 견본이 글씨체 갤러리에 올라가, 다른 사람도 보고 내려받을 수 있어요. 원본 사진은 올라가지 않아요. 언제든 내릴 수 있어요.</span>
      </label>

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
          {saveMsg && <span className="note" role="status" style={{ alignSelf: 'center' }}>{saveMsg}</span>}
        </div>
      )}
      {sealed && pub.k !== 'idle' && (
        <div className={`pub pub-${pub.k}`} role="status" aria-live="polite">
          {pub.k === 'busy' && <span>갤러리에 올리는 중…</span>}
          {pub.k === 'done' && <><span><b>갤러리에 올렸어요.</b> 이제 다른 사람도 “{pub.font.name}” 글씨체를 볼 수 있어요.</span><button className="btn small" onClick={onGallery}>갤러리 보기</button><button className="btn small quiet" onClick={unpublish}>갤러리에서 내리기</button></>}
          {pub.k === 'removed' && <><span>갤러리에서 내렸어요. 내 컴퓨터에 받은 파일은 그대로예요.</span><button className="btn small quiet" onClick={() => publish(writeFont(result.glyphs, sealed.family), sealed.blob)}>다시 올리기</button></>}
          {pub.k === 'error' && <><span>{pub.msg}</span><button className="btn small quiet" onClick={() => publish(writeFont(result.glyphs, sealed.family), sealed.blob)}>다시 시도</button></>}
        </div>
      )}
      {sealed && !share && pub.k === 'idle' && (
        <p className="note">갤러리에 올리지 않았어요. <button className="linkish" onClick={() => { setShare(true); publish(writeFont(result.glyphs, sealed.family), sealed.blob) }}>지금 올리기</button></p>
      )}

      <div className="tabs" role="tablist" aria-label="설치 방법">
        {([['win', 'Windows'], ['mac', 'macOS'], ['hwp', '한글·오피스'], ['web', '웹사이트'], ['phone', '휴대폰']] as [Os, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="tab-body" role="tabpanel">
        {tab === 'win' && <ol><li>내려받은 TTF 파일을 마우스 오른쪽 버튼으로 누릅니다.</li><li>설치(또는 모든 사용자용으로 설치)를 누릅니다.</li><li>열려 있던 프로그램은 다시 켜야 목록에 보입니다.</li></ol>}
        {tab === 'mac' && <ol><li>TTF 파일을 두 번 눌러 서체 관리자를 엽니다.</li><li>서체 설치를 누릅니다.</li><li>Keynote·Pages 같은 앱을 다시 열면 목록에 보입니다.</li></ol>}
        {tab === 'hwp' && <ol><li>먼저 컴퓨터에 폰트를 설치합니다.</li><li>한글·Word·PowerPoint를 완전히 닫았다가 다시 엽니다.</li><li>글꼴 목록에서 “{family}”를 검색합니다.</li></ol>}
        {tab === 'web' && <><p>TTF 파일을 사이트 폴더에 올리고 CSS에 붙여 넣으세요.</p><div className="code">{css}</div></>}
        {tab === 'phone' && <p>iOS와 안드로이드는 직접 만든 TTF를 시스템 글꼴로 바꾸는 기능을 기본으로 지원하지 않아요. 폰트 파일은 컴퓨터로 옮겨 쓰거나, 폰트 설치를 지원하는 앱에서 열어 쓰세요.</p>}
      </div>
    </main>
  )
}

