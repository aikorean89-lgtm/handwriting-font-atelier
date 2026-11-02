import { useMemo, useState } from 'react'
import { HeroGlyph } from '../ui/HeroGlyph'
import { Mosaic } from '../ui/Mosaic'
import { SCOUNT } from '../engine/hangul'
import type { Project } from '../state'
import { LAYOUT, TIERS } from '../engine/template'
import { TemplateButton } from '../ui/TemplateButton'

const QUICK_CHARS = LAYOUT.sheets[0].cells.map((c) => c.char ?? '').join('')

export function Home({ work, onStartNew, onResume, onGallery }: { work: Project | null; onStartNew: () => void; onResume: () => void; onGallery: () => void }) {
  const [confirm, setConfirm] = useState(false)
  // 빠른 폰트 90자가 11,172자 중 어디에 놓이는지 보여주는 모자이크
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
                    <b>{TIERS[work.tier].label}</b>를 만드는 중이에요.{' '}
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
              <p>템플릿 한 장에 90자를 쓰고 휴대폰으로 찍으세요. 현대 한글 11,172자가 모두 들어간 TTF 파일이 나옵니다. 사진은 이 기기 밖으로 나가지 않아요.</p>
              <div className="actions">
                {!work && <button className="btn primary" onClick={onStartNew}>폰트 만들기 시작</button>}
                <TemplateButton className={work ? 'btn' : 'btn quiet'} label="템플릿만 받기" />
              </div>
              <p className="hero-gallery">
                <button className="btn gallery-cta" onClick={onGallery}>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="2" y="2" width="5" height="5" /><rect x="9" y="2" width="5" height="5" /><rect x="2" y="9" width="5" height="5" /><rect x="9" y="9" width="5" height="5" /></svg>
                  다른 사람들이 만든 글씨체 갤러리
                </button>
              </p>
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
            <div><b>01</b><h3>고르기</h3><p>빠른 폰트(1장) 또는 표준 폰트(4장)</p></div>
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
