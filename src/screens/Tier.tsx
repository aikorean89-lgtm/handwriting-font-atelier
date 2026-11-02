import { useState } from 'react'
import { Head } from '../ui/common'
import { TIERS, type Tier } from '../engine/template'

export function TierScreen({ initial, onPick }: { initial?: Tier; onPick: (t: Tier) => void }) {
  const [tier, setTier] = useState<Tier>(initial ?? 'quick')
  return (
    <main className="wrap screen">
      <Head n="01" title="얼마나 쓸지 고르세요">두 모드 모두 11,172자를 만듭니다. 차이는 직접 쓰는 글자 수입니다. 일반 모드는 빠른 모드 시트를 그대로 1번 시트로 쓰니, 나중에 올려도 다시 쓸 필요가 없어요.</Head>
      <div className="tiers" role="group" aria-label="폰트 등급">
        {(Object.keys(TIERS) as Tier[]).map((k) => {
          const t = TIERS[k]
          return (
            <button key={k} className="tier" aria-pressed={tier === k} onClick={() => setTier(k)}>
              <h2>{t.label}</h2>
              <dl>
                <dt>시트</dt><dd>A4 {t.sheets.length}장</dd>
                <dt>직접 쓰는 한글</dt><dd>{t.hangul}자</dd>
                <dt>쓰는 시간</dt><dd>약 {t.minutes}분</dd>
                <dt>영문·기호</dt><dd>{k === 'quick' ? '숫자만' : '영문 52자, 기호 32자'}</dd>
              </dl>
              <p>{t.desc}</p>
            </button>
          )
        })}
      </div>
      <div className="actions">
        <button className="btn primary" onClick={() => onPick(tier)}>{TIERS[tier].label}로 하기</button>
      </div>
    </main>
  )
}
