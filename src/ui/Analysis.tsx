// 내 글씨 분석 리포트
import { useState } from 'react'
import { type Report, analyzeHandwriting } from '../engine/analyze'
import type { SourceCell } from '../engine/model'

const STARS = ['', '●○○', '●●○', '●●●']
const LABEL = ['', '연습해요', '보통', '잘해요']

export function AnalysisPanel({ cells, onPractice }: { cells: SourceCell[]; onPractice?: (chars: string[]) => void }) {
  const [rep, setRep] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = async () => {
    setBusy(true); setErr(null)
    await new Promise((r) => setTimeout(r, 30))
    try {
      const r = await analyzeHandwriting(cells)
      if (!r) setErr('직접 쓴 한글이 8자 이상 있어야 분석할 수 있어요.')
      setRep(r)
    } catch { setErr('분석하지 못했어요.') } finally { setBusy(false) }
  }
  return (
    <section className="analysis" aria-label="내 글씨 분석">
      <h3>내 글씨 분석</h3>
      <p className="note">직접 쓴 한글 {cells.length}자로 크기·줄 맞춤·기울기·굵기·비율을 재서, 잘하는 점과 연습할 점을 알려 드려요. 글씨 교정 수업이나 상담 자료로 써 보세요.</p>
      {!rep && <button className="btn" onClick={run} disabled={busy || cells.length < 8}>{busy ? '분석하는 중…' : '분석하기'}</button>}
      {err && <p className="note" role="alert" style={{ color: 'var(--warn)' }}>{err}</p>}
      {rep && (
        <div className="report">
          <div className="report-sum">
            {rep.best.length > 0 && <p><b>잘하는 점</b> {rep.best.map((m) => m.say).join(' ')}</p>}
            {rep.work.length > 0 && <p><b>연습할 점</b> {rep.work.map((m) => m.say).join(' ')}</p>}
          </div>
          <ul className="metrics">
            {rep.metrics.map((m) => (
              <li key={m.key} className={`metric s${m.score}`}>
                <div className="metric-head"><b>{m.title}</b><span className="stars" aria-label={LABEL[m.score]}>{STARS[m.score]} <small>{LABEL[m.score]}</small></span></div>
                <p>{m.say} <span className="note">({m.value})</span></p>
                {m.score < 3 && m.tip && <p className="tip">💡 {m.tip}</p>}
              </li>
            ))}
          </ul>
          {rep.practice.length > 0 && (
            <div className="practice">
              <b>연습할 글자</b>
              <div className="practice-chars">{rep.practice.map((c) => <span key={c}>{c}</span>)}</div>
              {onPractice && <button className="btn small quiet" onClick={() => onPractice(rep.practice)}>보충 시트에 넣기</button>}
            </div>
          )}
          <div className="actions"><button className="btn small quiet" onClick={() => window.print()}>인쇄하기</button><button className="btn small quiet" onClick={() => setRep(null)}>다시 분석</button></div>
        </div>
      )}
    </section>
  )
}
