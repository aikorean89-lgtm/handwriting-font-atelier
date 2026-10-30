import { useMemo, useState } from 'react'
import { Head } from '../ui/common'
import { CellCanvas, SLOT_COLORS } from '../ui/CellCanvas'
import { allCells, type Cell, type Project } from '../state'
import { decompose, isHangul, CHO, JUNG, JONG } from '../engine/hangul'
import { cycleRegion, segmentScored } from '../engine/segment'

/** 의심스러운 분리: 배치 비용이 높거나, 한 자모가 잉크의 4% 미만 (고친 글자는 제외) */
export const COST_FLAG = 0.62
export function suspicious(c: Cell): boolean {
  if (!c.labels || !c.char || c.labelsEdited) return false
  if ((c.segCost ?? 0) > COST_FLAG) return true
  const s = decompose(c.char)
  const n = [0, 0, 0, 0]
  let tot = 0
  for (let i = 0; i < c.labels.length; i++) if (c.bitmap.data[i]) { n[c.labels[i]]++; tot++ }
  const slots = s.jong ? [1, 2, 3] : [1, 2]
  return slots.some((k) => n[k] < tot * 0.04)
}

export function JamoScreen({ project, onCell, onNext, onBack }: {
  project: Project; onCell: (index: number, patch: Partial<Cell>) => void; onNext: () => void; onBack: () => void
}) {
  const cells = useMemo(() => allCells(project).filter((c) => c.include && c.char && isHangul(c.char) && c.labels), [project])
  const odd = cells.filter(suspicious).sort((a, b) => (b.segCost ?? 0) - (a.segCost ?? 0))
  const [filter, setFilter] = useState<'odd' | 'all'>(odd.length ? 'odd' : 'all')
  const [open, setOpen] = useState<number | null>(null)
  const shown = filter === 'odd' ? odd : cells
  const cur = open != null ? cells.find((c) => c.index === open) : undefined
  const sCur = cur?.char ? decompose(cur.char) : null

  return (
    <main className="wrap screen">
      <Head n="04" title={odd.length ? `자모를 확인할 글자 ${odd.length}개` : '자모를 모두 나눴어요'}>
        색으로 초성·중성·종성을 나눴습니다. 색이 틀린 획을 누르면 다음 자모로 넘어갑니다. 여기서 나눈 자모로 나머지 글자를 조합해요.
      </Head>
      <div className="legend" aria-hidden>
        <span><i style={{ background: SLOT_COLORS[1] }} />초성</span>
        <span><i style={{ background: SLOT_COLORS[2] }} />중성</span>
        <span><i style={{ background: SLOT_COLORS[3] }} />종성</span>
      </div>
      <div className="filters" role="group" aria-label="보기">
        <button className="chip" aria-pressed={filter === 'odd'} onClick={() => setFilter('odd')}>확인할 글자 {odd.length}</button>
        <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>전체 {cells.length}</button>
      </div>
      {shown.length === 0 ? <p className="note">확인할 글자가 없어요. 전체를 눌러 훑어봐도 좋아요.</p> : (
        <div className="grid">
          {shown.map((c) => (
            <button key={c.index} className={`cell ${suspicious(c) ? 'flag' : ''}`} onClick={() => setOpen(c.index)} aria-label={`${c.char} 자모 보기`}>
              <CellCanvas bitmap={c.bitmap} labels={c.labels} />
              <span className="lbl"><b>{c.char}</b>{c.labelsEdited && <span>고침</span>}</span>
            </button>
          ))}
        </div>
      )}
      <div className="actions sticky">
        <button className="btn primary" onClick={onNext} disabled={!cells.length}>폰트 만들기</button>
        <button className="btn quiet" onClick={onBack}>칸 검수로</button>
      </div>

      {cur && sCur && (
        <div className="sheet-modal" role="dialog" aria-modal aria-label={`${cur.char} 자모 나누기`} onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div>
            <h2>{cur.char}</h2>
            <p className="note" style={{ marginTop: 0 }}>
              초성 {CHO[sCur.cho]}, 중성 {JUNG[sCur.jung]}{sCur.jong ? `, 종성 ${JONG[sCur.jong]}` : ''}. 색이 틀린 획을 누르세요.
            </p>
            <CellCanvas
              bitmap={cur.bitmap} labels={cur.labels} label={`${cur.char} 자모 색 구분`}
              onTap={(x, y) => {
                const next = cycleRegion(cur.bitmap, cur.labels!, x, y, sCur.jong ? 3 : 2)
                if (next) onCell(cur.index, { labels: next, labelsEdited: true })
              }}
            />
            <div className="legend" aria-hidden>
              <span><i style={{ background: SLOT_COLORS[1] }} />초성 {CHO[sCur.cho]}</span>
              <span><i style={{ background: SLOT_COLORS[2] }} />중성 {JUNG[sCur.jung]}</span>
              {sCur.jong > 0 && <span><i style={{ background: SLOT_COLORS[3] }} />종성 {JONG[sCur.jong]}</span>}
            </div>
            <div className="actions">
              <button className="btn primary" onClick={() => setOpen(null)}>됐어요</button>
              <button className="btn quiet" onClick={() => { const r = segmentScored(cur.bitmap, cur.char!); onCell(cur.index, { labels: r.labels, segCost: r.cost, labelsEdited: false }) }}>자동으로 다시 나누기</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
