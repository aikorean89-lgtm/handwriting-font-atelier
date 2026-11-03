import { useMemo, useState } from 'react'
import { HeroGlyph } from '../ui/HeroGlyph'
import { usePwa } from '../pwa'
import { Mosaic } from '../ui/Mosaic'
import { SCOUNT } from '../engine/hangul'
import type { Project } from '../state'
import { LAYOUT, TIERS } from '../engine/template'
import { TemplateButton } from '../ui/TemplateButton'

const QUICK_CHARS = LAYOUT.sheets[0].cells.map((c) => c.char ?? '').join('')

export function Home({ work, onStartNew, onResume, onGallery, onGrowth }: { work: Project | null; onStartNew: () => void; onResume: () => void; onGallery: () => void; onGrowth: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const pwa = usePwa()
  const [installHelp, setInstallHelp] = useState(false)
  // 빠른 모드 90자가 11,172자 중 어디에 놓이는지 보여주는 모자이크
  const direct = useMemo(() => new Set([...QUICK_CHARS].map((c) => c.codePointAt(0)! - 0xac00)), [])
  const sheets = work ? Object.keys(work.sheets).length : 0
  const total = work ? TIERS[work.tier].sheets.length : 0

  return (
    <>
      <div className="graph-paper">
        <main className="wrap">
          <section className="hero">
            <div className="hero-copy">
              {work && (
                <div className="resume" role="region" aria-label="만들던 폰트">
                  <p>
                    <b>{TIERS[work.tier].label}</b>로 폰트를 만드는 중이에요.{' '}
                    {sheets > 0 ? `시트 ${total}장 중 ${sheets}장을 찍었어요.` : '아직 시트를 찍지 않았어요.'}
                  </p>
                  {!confirm ? (
                    <div className="row">
                      <button className="btn small primary" onClick={onResume}>이어서 하기</button>
                      <button className="btn small quiet" onClick={() => (sheets > 0 ? setConfirm(true) : onStartNew())}>새로 시작</button>
                    </div>
                  ) : (
                    <>
                      <p className="warn-text" role="alert">찍은 사진과 고친 자모가 모두 지워져요.</p>
                      <div className="row">
                        <button className="btn small danger" onClick={onStartNew}>지우고 새로 시작</button>
                        <button className="btn small quiet" onClick={() => setConfirm(false)}>취소</button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <h1>종이에 쓴 내 글씨가 폰트가 됩니다</h1>
              <p>템플릿 한 장에 90자를 쓰고 휴대폰으로 찍으세요. 현대 한글 11,172자가 모두 들어간 TTF 파일이 나옵니다.</p>
              <p className="hero-privacy">사진은 이 기기 밖으로 나가지 않아요.</p>
              <div className="actions">
                {!work && <button className="btn primary" onClick={onStartNew}>폰트 만들기 시작</button>}
                <TemplateButton className={work ? 'btn' : 'btn quiet'} label="템플릿만 받기" />
              </div>
              <nav className="hub" aria-label="더 둘러보기">
                <button className="hub-tab accent" onClick={onGallery}>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="2" y="2" width="5" height="5" /><rect x="9" y="2" width="5" height="5" /><rect x="2" y="9" width="5" height="5" /><rect x="9" y="9" width="5" height="5" /></svg>
                  <span><b>글씨체 갤러리</b><small>다른 사람들이 만든 글씨</small></span>
                </button>
                <button className="hub-tab" onClick={onGrowth}>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M2 13.5h12M3.5 11l3-3.5 2.5 2 4-5" /><path d="M10.5 4.5H13V7" /></svg>
                  <span><b>내 글씨 성장 기록</b><small>날짜별로 나란히 비교</small></span>
                </button>
                {pwa.supported && (
                  <button className="hub-tab" aria-expanded={installHelp} onClick={async () => {
                    if (pwa.installed) { setInstallHelp((v) => !v); return }
                    if (pwa.canInstall && (await pwa.install())) return
                    setInstallHelp((v) => !v)
                  }}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="4" y="1.5" width="8" height="13" rx="1.5" /><path d="M8 4.5v5M5.8 7.5 8 9.7l2.2-2.2M7 12.5h2" /></svg>
                    <span><b>{pwa.installed ? '앱으로 설치됨' : '앱으로 설치하기'}</b><small>{pwa.installed ? '인터넷 없이도 열려요' : '인터넷 없는 교실에서도'}</small></span>
                  </button>
                )}
              </nav>
              {pwa.supported && installHelp && (
                <div className="install-help" role="region" aria-label="앱 설치 방법">
                  {pwa.installed ? (
                    <p>이 기기에 앱으로 설치되어 있어요. 인터넷이 없어도 시트 찍기부터 폰트 만들기까지 할 수 있어요. (갤러리는 인터넷이 필요해요)</p>
                  ) : (
                    <ul>
                      <li><b>아이폰·아이패드 (Safari)</b> 아래쪽 공유 단추 → <b>홈 화면에 추가</b></li>
                      <li><b>안드로이드 (크롬·삼성 인터넷)</b> 오른쪽 위 메뉴 → <b>앱 설치</b> 또는 <b>홈 화면에 추가</b></li>
                      <li><b>컴퓨터 (크롬·엣지)</b> 주소창 오른쪽의 설치 아이콘 → <b>설치</b></li>
                    </ul>
                  )}
                </div>
              )}
            </div>
            <HeroGlyph ch="한" />
          </section>
        </main>
      </div>

      <div className="home-lower">
        <div className="wrap">
          <section className="mosaic-band" aria-label="직접 쓰는 글자와 만들어지는 글자">
            <Mosaic direct={direct} upTo={SCOUNT} cols={266} label="11,172자 가운데 직접 쓰는 90자 위치" />
            <div className="mosaic-caption">
              <span>빨간 점 90개는 직접 쓰는 글자, 나머지 11,082자는 그 글씨에서 뽑은 자모로 조합합니다.</span>
              <span className="count">가 → 힣</span>
            </div>
          </section>

          <section className="how" aria-label="만드는 순서">
            <div><b>01</b><h3>고르기</h3><p>빠른 모드(1장) 또는 일반 모드(4장)</p></div>
            <div><b>02</b><h3>쓰기</h3><p>칸 위 글자를 평소 글씨로 따라 쓰기</p></div>
            <div><b>03</b><h3>찍기</h3><p>네 모서리 마커가 보이게 촬영</p></div>
            <div><b>04</b><h3>다듬기</h3><p>잘못 잘린 칸과 자모만 고치기</p></div>
            <div><b>05</b><h3>완성</h3><p>문장으로 확인하고 TTF 내려받기</p></div>
          </section>
        </div>
      </div>
    </>
  )
}
