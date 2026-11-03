import { useEffect, useRef, useState } from 'react'
import { Head } from '../ui/common'
import { Viewfinder } from './Viewfinder'
import { CornerEditor } from './CornerEditor'
import { fileToCanvas, processSheet, type Pt } from '../engine/sheet'
import { LAYOUT, TEMPLATE_VERSION, TIERS, isSupplement, sheetDef, sheetLabel, suppLabel, type Tier } from '../engine/template'
import { loadCV } from '../engine/cv'
import { isHangul } from '../engine/hangul'
import { ensureRefFont } from '../engine/refmask'
import { segmentScored } from '../engine/segment'
import { type Cell, type Project, type Sheet, suppNos } from '../state'
import { canUseLiveCamera } from '../platform'
import { EngineStatus } from '../ui/EngineStatus'

const sheetName = (n: number) => sheetLabel(n)
/** 이름 끝 글자에 맞는 을/를 (숫자로 끝나면 읽는 소리로) */
const eul = (name: string) => {
  const last = name.at(-1) ?? ''
  if (/[0-9]/.test(last)) return name + ('013678'.includes(last) ? '을' : '를')
  const cp = last.codePointAt(0)! - 0xac00
  return name + (cp >= 0 && cp < 11172 && cp % 28 ? '을' : '를')
}

type Mode =
  | { k: 'idle' }
  | { k: 'camera'; slot: number }
  | { k: 'processing'; slot: number; msg: string }
  | { k: 'corners'; slot: number; canvas: HTMLCanvasElement }
  | { k: 'pick'; slot: number; canvas: HTMLCanvasElement; corners?: Pt[] }

export function CaptureScreen({ project, onSheet, onNext, onDraw }: { project: Project; onSheet: (s: Sheet) => void; onNext: () => void; onDraw: () => void }) {
  const tier: Tier = project.tier
  const supps = suppNos(project)
  const slots = [...TIERS[tier].sheets, ...supps]
  const first = TIERS[tier].sheets[0]
  const [mode, setMode] = useState<Mode>({ k: 'idle' })
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [focus, setFocus] = useState<number | null>(null)
  const [oldSheet, setOldSheet] = useState(false) // 수동 선택: 예전(v1) 시트인지
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingSlot = useRef(1)
  const live = canUseLiveCamera()

  useEffect(() => { loadCV().catch(() => {}) }, []) // 미리 받기

  const process = async (canvas: HTMLCanvasElement, slot: number, corners?: Pt[], forceSheet?: number, forceVer?: number) => {
    setErr(null); setInfo(null)
    setMode({ k: 'processing', slot, msg: '시트를 펴고 있어요' })
    try {
      await new Promise((r) => setTimeout(r, 30))
      const res = await processSheet(canvas, { manualCorners: corners, forceSheet, forceVer })
      if (res.sheetNo == null || !sheetDef(res.sheetNo, res.ver)) { setMode({ k: 'pick', slot, canvas, corners }); return }
      setMode({ k: 'processing', slot, msg: '자모를 나누고 있어요' })
      const chars = res.cells.map((c) => c.char ?? '').join('')
      await ensureRefFont(chars)
      const cells: Cell[] = res.cells.map((c) => {
        const use = c.state === 'ok' || c.state === 'overflow'
        const seg = c.char && isHangul(c.char) && use ? segmentScored(c.bitmap, c.char) : null
        return { index: c.index, char: c.char, state: c.state, include: use, bitmap: c.bitmap, labels: seg?.labels, segCost: seg?.cost }
      })
      onSheet({ no: res.sheetNo, ver: res.ver, preview: res.preview, sharpness: res.sharpness, capturedAt: Date.now(), cells })
      if (res.suppChars) setInfo(`${eul(suppLabel(res.sheetNo))} 읽었어요. 여기 쓴 ${res.suppChars.length}자는 폰트를 다시 만들 때 이 글씨로 바뀌어요.`)
      else if (slot > 0 && res.sheetNo !== slot) setInfo(`QR을 읽어 보니 ${sheetName(res.sheetNo)}예요. 그 자리에 넣었어요.`)
      if (res.markersFound.length === 3) setInfo('마커 3개로 폈어요. 결과가 어긋나 보이면 다시 찍어 주세요.')
      setFocus(res.sheetNo)
      setMode({ k: 'idle' })
    } catch (e) {
      const ex = e as Error & { found?: number[] }
      if (ex.message === 'NEED_CORNERS') { setMode({ k: 'corners', slot, canvas }); return }
      setErr(ex.message || '사진을 처리하지 못했어요. 다시 찍어 주세요.')
      setMode({ k: 'idle' })
    }
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    try { const c = await fileToCanvas(f); process(c, pendingSlot.current) } catch (e) { setErr((e as Error).message) }
  }

  const captured = slots.filter((n) => project.sheets[n])
  const focused = focus != null ? project.sheets[focus] : null

  return (
    <main className="wrap screen">
      <Head n="03" title="시트를 찍으세요">시트를 평평한 곳에 놓고, 네 모서리 검은 마커가 화면에 다 들어오게 찍으세요. 마커가 잡히면 빨간 표시가 붙고 자동으로 찍힙니다. 갤러리 사진을 올려도 됩니다.</Head>

      <p className="note">종이 대신 화면에 바로 쓰고 싶다면 <button className="linkish" onClick={onDraw}>화면에 직접 쓰기</button>로 가세요. 찍은 시트와 화면에 쓴 글자를 함께 쓸 수 있어요.</p>
      {!live && <p className="note">이 화면에서는 실시간 카메라를 쓸 수 없어요. 찍어서 올리기를 누르면 휴대폰에서는 카메라나 앨범을 고를 수 있어요.</p>}
      {err && <div className="error" role="alert">{err}</div>}
      {info && <div className="error" role="status" style={{ borderLeftColor: 'var(--warn)' }}>{info}</div>}

      {mode.k === 'corners' && (
        <CornerEditor canvas={mode.canvas} onCancel={() => setMode({ k: 'idle' })} onDone={(pts) => process(mode.canvas, mode.slot, pts)} />
      )}
      {mode.k === 'pick' && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>몇 번 시트인가요?</h2>
          <p className="note">오른쪽 위 QR 코드를 읽지 못했어요. 시트 오른쪽 위에 적힌 번호를 골라 주세요.</p>
          <label className="share-opt">
            <input type="checkbox" checked={oldSheet} onChange={(e) => setOldSheet(e.target.checked)} />
            <span>예전에 받은 시트예요 <small>(제목 아래에 TEMPLATE v1.0이라고 적혀 있으면 체크)</small></span>
          </label>
          <div className="actions">
            {[...LAYOUT.sheets.map((s) => s.sheet), ...supps].map((no) => (
              <button key={no} className="btn" onClick={() => process(mode.canvas, mode.slot, mode.corners, no, isSupplement(no) ? undefined : oldSheet ? 1 : TEMPLATE_VERSION)}>{sheetName(no)}</button>
            ))}
          </div>
        </div>
      )}
      {mode.k === 'processing' && (
        <div className="panel" role="status" aria-live="polite">
          <b>{mode.slot > 0 ? sheetName(mode.slot) : '보충 시트'}</b>: {mode.msg}…
          <EngineStatus />
        </div>
      )}
      {mode.k !== 'processing' && <EngineStatus />}

      <div className="slots" style={{ marginTop: 24 }}>
        {slots.map((n) => {
          const s = project.sheets[n]
          const warn = s ? s.cells.filter((c) => c.state === 'overflow' || c.state === 'empty').length : 0
          return (
            <div className="slot" key={n}>
              <button className="slot-thumb" style={{ cursor: s ? 'pointer' : 'default' }} onClick={() => s && setFocus(n)} aria-label={s ? `${sheetName(n)} 결과 보기` : `${sheetName(n)} 아직 없음`}>
                {s ? <img src={s.preview} alt="" /> : <span aria-hidden>{isSupplement(n) ? `S${n - 100}` : n}</span>}
              </button>
              <h3>{sheetName(n)} {n === 1 ? '(빠른 모드)' : n >= 11 && n <= 12 ? '' : isSupplement(n) ? `(${sheetDef(n)?.cells.length ?? 0}자)` : '(일반 모드 추가)'}</h3>
              <span className="tag">
                <span className={`dot ${s ? (warn ? 'warn' : 'ok') : 'off'}`} />
                {s ? (s.drawn ? `화면에 쓴 글자 ${s.cells.filter((c) => c.state === 'ok').length}자` : warn ? `확인할 칸 ${warn}개` : '모든 칸 읽음') : '아직 안 찍음'}
              </span>
              <div className="row">
                {live && <button className="btn small" onClick={() => setMode({ k: 'camera', slot: n })} disabled={mode.k === 'processing'}>카메라로 찍기</button>}
                <button className={`btn small ${live ? 'quiet' : ''}`} onClick={() => { pendingSlot.current = n; fileRef.current?.click() }} disabled={mode.k === 'processing'}>{live ? '사진 올리기' : '찍어서 올리기'}</button>
              </div>
            </div>
          )
        })}
      </div>
      {project.sheets[first] && (
        <p className="note supp-row">
          보충 시트를 찍었나요? 위 칸에 없어도 QR로 알아봐요.{' '}
          <button className="btn small quiet" onClick={() => { pendingSlot.current = 0; fileRef.current?.click() }} disabled={mode.k === 'processing'}>보충 시트 올리기</button>
        </p>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} data-testid="sheet-file" />

      {focused && <SheetCheck sheet={focused} />}

      <div className="actions sticky">
        <button className="btn primary" disabled={!project.sheets[first]} onClick={onNext}>
          {captured.length < slots.length && project.sheets[first] ? `찍은 ${captured.length}장으로 다듬기` : '다듬으러 가기'}
        </button>
      </div>

      {mode.k === 'camera' && (
        <Viewfinder
          sheetLabel={sheetName(mode.slot)}
          onClose={() => setMode({ k: 'idle' })}
          onCapture={(c) => process(c, mode.slot)}
        />
      )}
    </main>
  )
}

function SheetCheck({ sheet }: { sheet: Sheet }) {
  const def = sheetDef(sheet.no, sheet.ver ?? 1)
  if (!def || sheet.drawn) return null
  const by = (st: string) => sheet.cells.filter((c) => c.state === st).length
  const [W, H] = LAYOUT.page
  return (
    <section className="check" style={{ marginTop: 40 }} aria-label={`${sheetName(sheet.no)} 확인`}>
      <div className="check-sheet">
        <img src={sheet.preview} alt={`${sheet.no}번 시트를 반듯하게 편 모습`} />
        {sheet.cells.map((c, i) => {
          if (c.state === 'ok') return null
          const d = def.cells[i].cell
          return <span key={c.index} className={`m ${c.state === 'skip' ? 'skip' : 'warn'}`} style={{ left: `${((d[0] + d[2] / 2) / W) * 100}%`, top: `${((d[1] + d[3] / 2) / H) * 100}%` }} />
        })}
      </div>
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, margin: '0 0 8px' }}>{eul(sheetName(sheet.no))} 읽었어요</h2>
        <div className="stats">
          <div><b className="count">{by('ok')}</b><span>읽은 칸</span></div>
          <div><b className="count">{by('overflow')}</b><span>칸 밖으로 나감</span></div>
          <div><b className="count">{by('empty')}</b><span>빈 칸</span></div>
          <div><b className="count">{by('skip')}</b><span>건너뛰기 표시</span></div>
        </div>
        <p className="note">노란 점은 확인할 칸, 회색 점은 ○를 칠한 칸입니다. 다음 단계에서 하나씩 볼 수 있어요. 시트가 비뚤게 펴졌다면 다시 찍으세요.</p>
        {sheet.sharpness < 60 && <p className="note" style={{ color: 'var(--warn)' }}>사진이 조금 흐려요. 글자 가장자리가 뭉개질 수 있으니 다시 찍는 것을 권해요.</p>}
      </div>
    </section>
  )
}
