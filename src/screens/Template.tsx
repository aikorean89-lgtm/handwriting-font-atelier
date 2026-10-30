import { Head } from '../ui/common'
import { TIERS, type Tier } from '../engine/template'
import { TemplateButton } from '../ui/TemplateButton'

export function TemplateScreen({ tier, onNext }: { tier: Tier; onNext: () => void }) {
  const t = TIERS[tier]
  return (
    <main className="wrap screen">
      <Head n="02" title="템플릿을 인쇄해 쓰세요">
        {tier === 'quick' ? 'PDF의 1쪽만 인쇄하면 됩니다.' : 'PDF 1–4쪽을 모두 인쇄하세요.'} 인쇄 설정에서 반드시 실제 크기(100%)를 고르세요. 페이지에 맞춤을 쓰면 칸이 작아져 인식이 흔들립니다.
      </Head>
      <div className="tpl">
        <div className="tpl-sheet">
          <img src={`${import.meta.env.BASE_URL}template/sheet-1.png`} alt="빠른 폰트 시트 미리보기: 네 모서리에 검은 마커, 하늘색 칸 100개" />
        </div>
        <div>
          <ol className="tips">
            <li><div><b>검정 펜 하나로</b><span>0.5mm 이상 펜이 가장 잘 읽힙니다. 연필과 파란 펜은 피하세요.</span></div></li>
            <li><div><b>평소 크기, 평소 속도로</b><span>예쁘게 쓰려 하지 않아야 결과가 내 글씨를 닮습니다.</span></div></li>
            <li><div><b>하늘색 십자 가운데에</b><span>칸 밖으로 나가지 않게 쓰세요. 하늘색 선은 찍은 뒤 자동으로 지워집니다.</span></div></li>
            <li><div><b>초성·중성·종성은 살짝 띄우기</b><span>획이 붙지 않으면 자모를 더 정확히 나눕니다.</span></div></li>
            <li><div><b>틀린 칸은 ○를 칠하기</b><span>칠한 칸은 건너뛰고, 그 글자는 다른 글씨에서 조합합니다.</span></div></li>
            <li><div><b>낯선 글자도 모양만</b><span>곬, 읔 같은 글자는 특정 받침 모양을 얻기 위한 글자예요.</span></div></li>
          </ol>
          <div className="actions">
            <TemplateButton label="템플릿 PDF 받기" />
            <button className="btn primary" onClick={onNext}>다 썼어요, 찍으러 가기</button>
          </div>
          <p className="note">{t.label}: A4 {t.sheets.length}장, 쓰는 데 약 {t.minutes}분</p>
        </div>
      </div>
    </main>
  )
}
