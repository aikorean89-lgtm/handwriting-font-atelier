import { useMemo, useState } from 'react'
import { Head } from '../ui/common'
import { CellCanvas } from '../ui/CellCanvas'
import { allCells, type Cell, type Project } from '../state'

const STATE_TEXT: Record<string, string> = { ok: '읽음', overflow: '칸 밖으로 나감', empty: '빈 칸', skip: '건너뛰기 표시' }

export function ReviewScreen({ project, onCell, onNext, onBack }: {
  project: Project; onCell: (index: number, patch: Partial<Cell>) => void; onNext: () => void; onBack: () => void
}) {
  const cells = useMemo(() => allCells(project).filter((c) => c.char), [project])
  const needs = cells.filter((c) => c.state !== 'ok')
  const [filter, setFilter] = useState<'needs' | 'all' | 'off'>(needs.length ? 'needs' : 'all')
  const [open, setOpen] = useState<number | null>(null)
  const shown = filter === 'needs' ? needs : filter === 'off' ? cells.filter((c) => !c.include) : cells
  const cur = open != null ? cells.find((c) => c.index === open) : undefined
  const used = cells.filter((c) => c.include).length

  return (
    <main className="wrap screen">
      <Head n="04" title={needs.length ? `확인할 칸 ${needs.length}개` : '모든 칸을 읽었어요'}>
        칸을 눌러 크게 보고, 폰트에 쓸지 정하세요. 빼낸 칸의 글자는 다른 글씨에서 뽑은 자모로 조합합니다.
      </Head>
      <div className="filters" role="group" aria-label="보기">
        <button className="chip" aria-pressed={filter === 'needs'} onClick={() => setFilter('needs')}>확인할 칸 {needs.length}</button>
        <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>전체 {cells.length}</button>
        <button className="chip" aria-pressed={filter === 'off'} onClick={() => setFilter('off')}>뺀 칸 {cells.length - used}</button>
      </div>
      {shown.length === 0 ? (
        <p className="note">여기에 보여줄 칸이 없어요.</p>
      ) : (
        <div className="grid">
          {shown.map((c) => (
            <button key={c.index} className={`cell ${c.include ? '' : 'excluded'} ${c.state !== 'ok' ? 'flag' : ''}`} onClick={() => setOpen(c.index)} aria-label={`${c.index}번 칸 ${c.char}, ${STATE_TEXT[c.state]}${c.include ? '' : ', 뺌'}`}>
              <CellCanvas bitmap={c.bitmap} />
              <span className="lbl"><b>{c.char}</b><span className="count">{String(c.index).padStart(3, '0')}</span></span>
            </button>
          ))}
        </div>
      )}
      <div className="actions sticky">
        <button className="btn primary" onClick={onNext} disabled={used === 0}>자모 확인하기</button>
        <button className="btn quiet" onClick={onBack}>시트 다시 찍기</button>
      </div>

      {cur && (
        <div className="sheet-modal" role="dialog" aria-modal aria-label={`${cur.char} 칸`} onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div>
            <h2>{cur.char}</h2>
            <p className="note" style={{ marginTop: 0 }}>{String(cur.index).padStart(3, '0')}번 칸, {STATE_TEXT[cur.state]}</p>
            <CellCanvas bitmap={cur.bitmap} label={`${cur.char} 손글씨`} />
            {cur.state === 'overflow' && <p className="note">획 일부가 칸 경계에 걸렸어요. 잘린 부분이 없으면 그대로 써도 됩니다.</p>}
            {cur.state === 'skip' && <p className="note">○가 칠해져 있어 건너뛴 칸이에요. 글씨가 괜찮다면 쓰기로 바꿀 수 있어요.</p>}
            <div className="actions">
              {cur.state !== 'empty' && (
                <button className="btn primary" onClick={() => { onCell(cur.index, { include: !cur.include }); setOpen(null) }}>
                  {cur.include ? '이 칸 빼기' : '이 칸 쓰기'}
                </button>
              )}
              <button className="btn quiet" onClick={() => setOpen(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
