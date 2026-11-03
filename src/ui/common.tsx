import type { ReactNode } from 'react'
import type { Step } from '../state'

export const FLOW: { step: Step; n: string; label: string }[] = [
  { step: 'tier', n: '01', label: '고르기' },
  { step: 'template', n: '02', label: '쓰기' },
  { step: 'capture', n: '03', label: '찍기' },
  { step: 'review', n: '04', label: '다듬기' },
  { step: 'build', n: '05', label: '완성' },
]
export const GROUP: Record<Step, number> = { home: -1, tier: 0, template: 1, capture: 2, draw: 2, letter: 2, review: 3, jamo: 3, build: 4, play: 4, export: 4, gallery: -1, growth: -1 }

/** canStep(i): i번째 단계로 갈 수 있는지 (이미 지나온 단계, 또는 다녀온 다음 단계) */
export function TopBar({ step, onHome, onGallery, onStep, canStep }: {
  step: Step; onHome: () => void; onGallery: () => void; onStep?: (i: number) => void; canStep?: (i: number) => boolean
}) {
  const g = GROUP[step]
  const home = step !== 'home'
  return (
    <header className={`topbar ${g >= 0 ? 'has-steps' : ''}`}>
      <div className="wrap topbar-in">
        <button className="brand" onClick={onHome} aria-label="폰트공방 처음 화면">
          <span className="brand-seal" aria-hidden>글</span>
          <span className="brand-name">폰트공방</span>
        </button>
        {g >= 0 && (
          <ol className="steps" aria-label="진행 단계">
            {FLOW.map((f, i) => {
              const can = i !== g && !!onStep && !!canStep?.(i)
              return (
                <li key={f.n} className={`${i === g ? 'on' : i < g ? 'done' : ''} ${can ? 'can' : ''}`} aria-current={i === g ? 'step' : undefined}>
                  {can ? (
                    <button onClick={() => onStep!(i)} title={`${f.n} ${f.label}${i < g ? '(으)로 돌아가기' : '(으)로 가기'}`} aria-label={`${f.n} ${f.label} 단계로 ${i < g ? '돌아가기' : '가기'}`}>
                      <b>{f.n}</b><span>{f.label}</span>
                    </button>
                  ) : <><b>{f.n}</b><span>{f.label}</span></>}
                </li>
              )
            })}
          </ol>
        )}
        <div className="topbar-right">
        {step !== 'gallery' && (
          <button className="gallery-btn" onClick={onGallery} aria-label="글씨체 갤러리 둘러보기">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="2" y="2" width="5" height="5" /><rect x="9" y="2" width="5" height="5" /><rect x="2" y="9" width="5" height="5" /><rect x="9" y="9" width="5" height="5" /></svg>
            <span>갤러리</span>
          </button>
        )}
        {home && (
          <button className="home-btn" onClick={onHome} aria-label="처음으로 돌아가기 (작업은 저장돼요)">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M2 7.5 8 2.5l6 5M3.8 6.3V13.5h8.4V6.3" /></svg>
            <span>처음으로</span>
          </button>
        )}
        </div>
      </div>
    </header>
  )
}

export function Head({ n, title, children }: { n: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="head">
      <div className="head-num" aria-hidden>{n}</div>
      <div>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
    </div>
  )
}
