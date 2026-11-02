import { useMemo, useState } from 'react'
import { Head } from '../ui/common'
import type { BuildOptions, BuildResult } from '../engine/build'
import { cleanSuppChars, makeSupplementPdf } from '../engine/supplement'
import { SUPP_BASE, SUPP_MAX } from '../engine/template'
import { SaveDeclined, saveFile } from '../platform'
import type { Bitmap } from '../engine/bitmap'
import { GlyphEditor } from '../ui/GlyphEditor'

const SAMPLE = '다람쥐 헌 쳇바퀴에 타고파.\n오늘 하루도 수고했어요. 내일은 더 맑을 거예요.'
const COMMON = '가나다라마바사아자차카타파하강남동서울김이박최정민수영희진호준우현지은서윤도시학교선생님친구사랑행복감사편지바람구름하늘별달꽃나무물불땅길집문창책글말눈귀손발몸맘봄여름가을겨울아침점심저녁밤낮시간오늘내일어제주말공부시험숙제급식운동놀이그림노래춤'

const WEIGHT_LABEL: Record<number, string> = { [-3]: '아주 가늘게', [-2]: '가늘게', [-1]: '조금 가늘게', 0: '쓴 그대로', 1: '조금 굵게', 2: '굵게', 3: '굵게', 4: '아주 굵게', 5: '아주 굵게', 6: '가장 굵게' }

export function PlayScreen({ result, flagged, settings, rebuilding, supps, edits, onFlag, onRebuild, onSupp, onEdit, onCapture, onNext, onRedo }: {
  result: BuildResult; flagged: string[]; settings: BuildOptions; rebuilding: number | null; supps: Record<number, string[]>; edits: Record<string, Bitmap>
  onFlag: (f: string[]) => void; onRebuild: (s: BuildOptions) => void; onSupp: (s: Record<number, string[]>) => void
  onEdit: (ch: string, bm: Bitmap | null) => void
  onCapture: () => void; onNext: () => void; onRedo: () => void
}) {
  const [text, setText] = useState(SAMPLE)
  const [weight, setWeight] = useState(settings.weight ?? 0)
  const [tracking, setTracking] = useState(settings.tracking ?? 0)
  const [extra, setExtra] = useState('')
  const [suppMsg, setSuppMsg] = useState<string | null>(null)
  const [making, setMaking] = useState(false)
  const [editCh, setEditCh] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editMsg, setEditMsg] = useState<string | null>(null)
  const openEditor = (raw: string) => {
    const ch = [...raw.trim()][0]
    if (!ch) return
    const cp = ch.codePointAt(0)!
    const ok = (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x21 && cp <= 0x7e)
    if (!ok) { setEditMsg('한글 완성형 글자와 영문·숫자·기호만 손볼 수 있어요.'); return }
    setEditMsg(null); setEditing(ch)
  }
  const editedChars = Object.keys(edits)
  // 직접 쓰지 않은(=조합된) 흔한 글자에서 40자를 골라 어색한 글자 찾기
  const odd = useMemo(() => {
    const pool = [...new Set(COMMON)].filter((c) => !result.directChars.includes(c))
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    return pool.sort(() => rnd() - 0.5).slice(0, 40)
  }, [result])
  const toggle = (c: string) => onFlag(flagged.includes(c) ? flagged.filter((x) => x !== c) : [...flagged, c])
  const dirty = weight !== (settings.weight ?? 0) || tracking !== (settings.tracking ?? 0)
  const suppChars = cleanSuppChars(flagged.join('') + extra)
  const suppNos = Object.keys(supps).map(Number)
  const nextNo = (suppNos.length ? Math.max(...suppNos) : SUPP_BASE) + 1

  const makeSupp = async () => {
    if (!suppChars.length) return
    setMaking(true); setSuppMsg(null)
    try {
      const firstN = nextNo - SUPP_BASE
      const { blob, sheets } = await makeSupplementPdf(suppChars, firstN)
      const add: Record<number, string[]> = {}
      for (let i = 0; i < sheets; i++) add[nextNo + i] = suppChars.slice(i * SUPP_MAX, (i + 1) * SUPP_MAX)
      onSupp({ ...supps, ...add })
      await saveFile(`폰트공방-보충시트-${firstN}${sheets > 1 ? `-${firstN + sheets - 1}` : ''}.pdf`, blob)
      setSuppMsg(`보충 시트 ${sheets}장을 받았어요. 인쇄해서 쓰고 찍기 단계에서 올리세요.`)
    } catch (e) {
      if (e instanceof SaveDeclined) setSuppMsg('저장을 취소했어요. 찍기 단계에는 이미 자리가 생겼으니 다시 받아도 돼요.')
      else setSuppMsg((e as Error).message || '보충 시트를 만들지 못했어요.')
    } finally { setMaking(false) }
  }

  return (
    <main className="wrap screen">
      <Head n="05" title="문장으로 써 보세요">이 화면의 제목도 방금 만든 폰트로 바뀌었어요. 아래에 아무 문장이나 쳐 보세요.</Head>
      <label htmlFor="play" className="note">미리보기 문장</label>
      <textarea id="play" className="play-input" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div className="waterfall" aria-label="크기별 미리보기">
        {[12, 16, 24, 36, 56].map((s) => (
          <div key={s}><span className="count">{s}px</span><p style={{ fontSize: s }}>{text.split('\n')[0] || SAMPLE}</p></div>
        ))}
      </div>

      <section className="tune" aria-label="굵기와 자간">
        <div className="tune-row">
          <label htmlFor="w">굵기 <b>{WEIGHT_LABEL[weight]}</b></label>
          <input id="w" type="range" min={-3} max={6} step={1} value={weight} onChange={(e) => setWeight(+e.target.value)} />
        </div>
        <div className="tune-row">
          <label htmlFor="t">자간 <b>{tracking === 0 ? '기본' : tracking > 0 ? `넓게 ${tracking}` : `좁게 ${-tracking}`}</b></label>
          <input id="t" type="range" min={-60} max={120} step={10} value={tracking} onChange={(e) => setTracking(+e.target.value)} />
        </div>
        <div className="tune-act">
          <button className="btn" disabled={!dirty || rebuilding != null} onClick={() => onRebuild({ weight, tracking })}>
            {rebuilding != null ? `다시 만드는 중 ${Math.round(rebuilding * 100)}%` : '이 설정으로 다시 만들기'}
          </button>
          {dirty && rebuilding == null && <button className="btn quiet small" onClick={() => { setWeight(settings.weight ?? 0); setTracking(settings.tracking ?? 0) }}>되돌리기</button>}
          <span className="note">펜이 가늘었다면 굵게, 글자가 붙어 보이면 자간을 넓게 해 보세요.</span>
        </div>
      </section>
      {result.autoPunct.length > 0 && <p className="note">쓰지 않은 문장부호 {result.autoPunct.length}개({result.autoPunct.join(' ')})는 내 펜 굵기에 맞춰 자동으로 그렸어요.</p>}

      <hr className="rule" />
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 30, margin: '0 0 8px' }}>어색한 글자를 눌러 표시하세요</h2>
      <p className="note" style={{ marginTop: 0 }}>조합으로 만든 글자 40자입니다. 표시한 글자는 아래 보충 시트에 들어갑니다.</p>
      <div className="odd-grid">
        {odd.map((c) => <button key={c} aria-pressed={flagged.includes(c)} onClick={() => toggle(c)}>{c}</button>)}
      </div>

      <section className="fix" aria-label="글자 하나씩 손보기">
        <h3>글자 하나씩 손보기</h3>
        <p className="note">어색한 글자를 화면에서 펜으로 바로 고쳐요. 위에서 표시한 글자를 누르거나 고칠 글자를 적으세요. 고친 글자는 굵기를 바꿔도 그대로예요.</p>
        <div className="fix-row">
          <input value={editCh} maxLength={2} onChange={(e) => setEditCh(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') openEditor(editCh) }} placeholder="예: 쳇" aria-label="손볼 글자" />
          <button className="btn" onClick={() => openEditor(editCh)} disabled={!editCh.trim() || rebuilding != null}>이 글자 손보기</button>
        </div>
        {flagged.length > 0 && (
          <div className="chips" aria-label="표시한 글자">
            {flagged.map((c) => <button key={c} className="chip" onClick={() => openEditor(c)} disabled={rebuilding != null}>{c}</button>)}
          </div>
        )}
        {editedChars.length > 0 && (
          <p className="note">손본 글자 {editedChars.length}개: {editedChars.map((c) => <button key={c} className="linkish fix-done" onClick={() => openEditor(c)}>{c}</button>)}</p>
        )}
        {editMsg && <p className="note" role="status">{editMsg}</p>}
      </section>
      {editing && (
        <GlyphEditor
          ch={editing} result={result} existing={edits[editing]}
          onSave={(bm) => { onEdit(editing, bm); setEditing(null); setEditMsg(`‘${editing}’ 글자를 고쳤어요. 폰트를 다시 만들고 있어요.`) }}
          onRevert={edits[editing] ? () => { onEdit(editing, null); setEditing(null); setEditMsg(`‘${editing}’ 글자를 손보기 전으로 되돌렸어요.`) } : undefined}
          onClose={() => setEditing(null)}
        />
      )}

      <section className="supp" aria-label="보충 시트">
        <div>
          <h3>보충 시트로 다시 쓰기</h3>
          <p className="note">표시한 글자와 더 쓰고 싶은 글자를 한 장에 모아 드려요. 쓰고 찍으면 그 글자만 새 글씨로 바뀌고, 같은 자모를 쓰는 다른 글자도 좋아져요.</p>
          <label htmlFor="extra" className="note">더 넣을 글자 (이름, 자주 쓰는 낱말)</label>
          <input id="extra" className="supp-input" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="예: 쪼아쌤 꿈뜰 학급" />
        </div>
        <div className="supp-chars" aria-live="polite">
          {suppChars.length ? suppChars.slice(0, 120).map((c) => <span key={c}>{c}</span>) : <span className="note">위에서 어색한 글자를 누르거나 글자를 적어 주세요.</span>}
        </div>
        <div className="actions">
          <button className="btn" disabled={!suppChars.length || making} onClick={makeSupp}>
            {making ? '시트 만드는 중…' : `보충 시트 PDF 받기${suppChars.length ? ` (${suppChars.length}자, ${Math.ceil(suppChars.length / SUPP_MAX)}장)` : ''}`}
          </button>
          {suppNos.length > 0 && <button className="btn quiet" onClick={onCapture}>보충 시트 찍으러 가기</button>}
          {suppMsg && <span className="note" role="status" style={{ alignSelf: 'center' }}>{suppMsg}</span>}
        </div>
      </section>

      <div className="actions sticky">
        <button className="btn primary" onClick={onNext} disabled={rebuilding != null}>이름 짓고 내려받기</button>
        <button className="btn quiet" onClick={onRedo}>자모 다시 고치기</button>
      </div>
      <p className="note">조합 {result.composed.toLocaleString('ko-KR')}자, 직접 쓴 한글 {result.directHangul}자{result.refFallback ? `, 기준 글꼴로 채운 자모가 쓰인 글자 ${result.refFallback.toLocaleString('ko-KR')}자` : ''}.</p>
    </main>
  )
}
