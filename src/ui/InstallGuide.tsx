import { useState } from 'react'
import { safeFile, toWoff2, webfontCss } from '../engine/webfont'
import { SaveDeclined, saveFile } from '../platform'

type Tab = 'win' | 'mac' | 'office' | 'canva' | 'ipad' | 'google' | 'phone' | 'web'
const TABS: [Tab, string][] = [
  ['win', 'Windows'], ['mac', 'macOS'], ['office', '한글·워드·PPT'], ['canva', '캔바'],
  ['ipad', '아이패드'], ['google', '구글 문서·슬라이드'], ['phone', '휴대폰'], ['web', '웹사이트'],
]

/** 폰트 설치·사용 안내 (내보내기 화면과 갤러리에서 함께 쓴다) */
export function InstallGuide({ family, getTtf }: { family: string; getTtf: () => Promise<Uint8Array> }) {
  const [tab, setTab] = useState<Tab>('win')
  return (
    <section className="guide" aria-label="폰트 설치와 사용 방법">
      <h2>설치하고 쓰는 방법</h2>
      <div className="tabs" role="tablist" aria-label="설치 방법">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="tab-body" role="tabpanel">
        {tab === 'win' && (
          <ol>
            <li>내려받은 <b>.ttf</b> 파일을 마우스 오른쪽 버튼으로 누릅니다. (압축 파일이면 먼저 압축을 풉니다)</li>
            <li><b>설치</b> 또는 <b>모든 사용자용으로 설치</b>를 누릅니다. 학교 컴퓨터에서 막혀 있으면 파일을 두 번 눌러 열고 위쪽의 설치 단추를 눌러 보세요.</li>
            <li>열려 있던 한글·파워포인트 같은 프로그램은 <b>완전히 닫았다가 다시 열어야</b> 글꼴 목록에 보입니다.</li>
            <li>글꼴 목록에서 “{family}”를 찾습니다. 이름으로 검색하면 빨라요.</li>
          </ol>
        )}
        {tab === 'mac' && (
          <ol>
            <li>.ttf 파일을 두 번 누르면 <b>서체 관리자</b>가 열립니다.</li>
            <li><b>설치</b>를 누릅니다.</li>
            <li>Keynote·Pages·한글 같은 앱을 다시 열면 목록에 “{family}”가 보입니다.</li>
          </ol>
        )}
        {tab === 'office' && (
          <>
            <ol>
              <li>먼저 Windows나 macOS 방법으로 컴퓨터에 설치합니다.</li>
              <li>한글·Word·PowerPoint를 완전히 닫았다가 다시 엽니다.</li>
              <li>글꼴 상자에서 “{family}”를 고릅니다.</li>
            </ol>
            <p className="note"><b>다른 사람에게 보낼 때:</b> 받는 컴퓨터에 이 글꼴이 없으면 기본 글꼴로 바뀌어 보여요.</p>
            <ul>
              <li><b>가장 확실한 방법:</b> PDF로 저장해서 보내세요. 글씨 모양이 그대로 남아요.</li>
              <li><b>PowerPoint(Windows):</b> 파일 → 옵션 → 저장 → “파일의 글꼴 포함”을 켜고 저장하면, 받는 사람도 볼 수 있어요.</li>
              <li><b>한글:</b> 받는 사람도 같은 폰트를 설치하거나, PDF로 보내세요.</li>
            </ul>
          </>
        )}
        {tab === 'canva' && (
          <>
            <ol>
              <li>캔바 왼쪽 메뉴에서 <b>브랜드</b>를 엽니다.</li>
              <li><b>글꼴</b> → <b>글꼴 업로드</b>를 누르고 .ttf 파일을 고릅니다.</li>
              <li>디자인의 글꼴 목록 맨 위 ‘업로드한 글꼴’에서 “{family}”를 고릅니다.</li>
            </ol>
            <p className="note">글꼴 올리기는 캔바 Pro·교육용(Canva for Education)·팀 계정에서 됩니다. 교육용 계정은 선생님 계정에서 올려 주세요.</p>
          </>
        )}
        {tab === 'ipad' && (
          <>
            <ol>
              <li>.ttf 파일을 ‘파일’ 앱에 저장합니다.</li>
              <li>App Store에서 글꼴 설치 앱(예: iFont)을 받아 파일을 불러온 뒤 <b>설치</b>를 누르고, 안내에 따라 설정에서 프로필을 설치합니다.</li>
              <li>설정 → 일반 → 서체에서 “{family}”가 보이면 Keynote·Pages·굿노트 등에서 쓸 수 있어요.</li>
            </ol>
            <p className="note">Procreate처럼 앱 안에서 직접 글꼴을 불러오는 앱은 그 앱의 ‘글꼴 가져오기’로 .ttf를 고르면 됩니다.</p>
          </>
        )}
        {tab === 'google' && (
          <>
            <p>구글 문서·슬라이드는 직접 만든 글꼴 파일을 올리는 기능이 없어요. 대신 이렇게 쓰세요.</p>
            <ul>
              <li>컴퓨터의 한글·파워포인트·캔바에서 내 글씨로 쓴 뒤 <b>이미지(PNG)로 저장</b>해 슬라이드에 넣습니다.</li>
              <li>폰트공방의 ‘써 보기’ 화면에서 문장을 써서 화면을 캡처해도 됩니다.</li>
            </ul>
          </>
        )}
        {tab === 'phone' && (
          <p>아이폰과 안드로이드는 직접 만든 글꼴을 휴대폰 전체 글꼴로 바꾸는 기능을 기본으로 지원하지 않아요. 파일은 컴퓨터로 옮겨 설치하거나, 글꼴 불러오기를 지원하는 앱(필기·디자인 앱)에서 열어 쓰세요.</p>
        )}
        {tab === 'web' && <WebfontBox family={family} getTtf={getTtf} />}
      </div>
    </section>
  )
}

/** 웹폰트(WOFF2) 내려받기 + 붙여 넣을 CSS */
export function WebfontBox({ family, getTtf }: { family: string; getTtf: () => Promise<Uint8Array> }) {
  const [state, setState] = useState<{ k: 'idle' } | { k: 'busy' } | { k: 'done'; kb: number } | { k: 'error'; msg: string }>({ k: 'idle' })
  const [copied, setCopied] = useState(false)
  const file = `${safeFile(family)}.woff2`
  const css = webfontCss(family, file)
  const make = async () => {
    setState({ k: 'busy' })
    try {
      const w2 = await toWoff2(await getTtf())
      await saveFile(file, new Blob([w2 as BlobPart], { type: 'font/woff2' }))
      setState({ k: 'done', kb: Math.round(w2.length / 1024) })
    } catch (e) {
      if (e instanceof SaveDeclined) { setState({ k: 'idle' }); return }
      setState({ k: 'error', msg: '웹폰트를 만들지 못했어요. 다시 시도해 주세요.' })
    }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(css); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { setCopied(false) }
  }
  return (
    <div className="webfont">
      <p>학급 홈페이지나 직접 만든 웹앱에서 이 글씨를 쓰려면 <b>WOFF2 웹폰트</b>를 받으세요. TTF보다 훨씬 작아 페이지가 빨리 열려요.</p>
      <div className="actions">
        <button className="btn" onClick={make} disabled={state.k === 'busy'}>{state.k === 'busy' ? '웹폰트 만드는 중…' : `${file} 받기`}</button>
        {state.k === 'done' && <span className="note" role="status" style={{ alignSelf: 'center' }}>내려받았어요 ({state.kb.toLocaleString('ko-KR')}KB).</span>}
        {state.k === 'error' && <span className="note" role="alert" style={{ alignSelf: 'center', color: 'var(--warn)' }}>{state.msg}</span>}
      </div>
      <ol>
        <li>받은 .woff2 파일을 사이트의 HTML 파일과 같은 폴더에 올립니다.</li>
        <li>아래 CSS를 스타일시트에 붙여 넣습니다.</li>
      </ol>
      <div className="code-wrap">
        <pre className="code" aria-label="붙여 넣을 CSS">{css}</pre>
        <button className="btn small quiet" onClick={copy}>{copied ? '복사했어요' : 'CSS 복사'}</button>
      </div>
    </div>
  )
}
