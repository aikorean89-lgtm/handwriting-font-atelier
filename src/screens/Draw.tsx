// 화면에 직접 쓰기: 종이·사진 없이 칸마다 펜(손가락)으로 써서 시트 결과를 만든다
import { useEffect, useMemo, useRef, useState } from 'react'
import { Head } from '../ui/common'
import { DrawPad, type DrawPadHandle } from '../ui/DrawPad'
import type { Bitmap } from '../engine/bitmap'
import { PX_PER_MM, TEMPLATE_VERSION, TIERS, sheetDef, sheetLabel } from '../engine/template'
import { isHangul } from '../engine/hangul'
import { ensureRefFont } from '../engine/refmask'
import { segmentScored } from '../engine/segment'
import type { Cell, Project, Sheet } from '../state'

interface Item { no: number; index: number; char: string; n: number }

function inkOf(bm: Bitmap) { let s = 0; for (let i = 0; i < bm.data.length; i++) s += bm.data[i]; return s }

/** 쓴 글자를 작은 격자 그림으로 (찍기 화면의 썸네일) */
function thumb(items: Item[], drawn: Map<number, Bitmap>): string {
  const cols = 10, s = 40
  const rows = Math.ceil(items.length / cols)
  const c = document.createElement('canvas'); c.width = cols * s; c.height = rows * s
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.strokeStyle = '#cfe3ff'
  items.forEach((it, i) => {
    const x = (i % cols) * s, y = Math.floor(i / cols) * s
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1)
    const bm = drawn.get(it.index)
    if (!bm) return
    const img = ctx.createImageData(bm.w, bm.h)
    for (let k = 0; k < bm.data.length; k++) if (bm.data[k]) img.data[k * 4 + 3] = 255
    const t = document.createElement('canvas'); t.width = bm.w; t.height = bm.h
    t.getContext('2d')!.putImageData(img, 0, 0)
    ctx.drawImage(t, x + 2, y + 2, s - 4, s - 4)
  })
  return c.toDataURL('image/png')
}

export function DrawScreen({ project, onSheet, onNext, onBack }: { project: Project; onSheet: (s: Sheet) => void; onNext: () => void; onBack: () => void }) {
  const items = useMemo<Item[]>(() => TIERS[project.tier].sheets.flatMap((no) => {
    const def = sheetDef(no, TEMPLATE_VERSION)
    if (!def) return []
    return def.cells.filter((c) => c.char).map((c) => ({ no, index: c.index, char: c.char!, n: Math.round(c.cell[2] * PX_PER_MM) }))
  }), [project.tier])

  // 이미 쓴 글자 (이어서 쓰기)
  const [drawn, setDrawn] = useState<Map<number, Bitmap>>(() => {
    const m = new Map<number, Bitmap>()
    for (const s of Object.values(project.sheets)) if (s.drawn) for (const c of s.cells) if (c.state === 'ok') m.set(c.index, c.bitmap)
    return m
  })
  const [at, setAt] = useState(() => Math.max(0, items.findIndex((it) => !drawn.has(it.index))))
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const pad = useRef<DrawPadHandle>(null)
  const cur = items[at]

  useEffect(() => { ensureRefFont(items.map((i) => i.char).join('')).catch(() => {}).finally(() => setReady(true)) }, [items])

  // 한 시트 분량을 프로젝트에 저장 (자모 나누기 포함)
  const commitSheet = (no: number, map: Map<number, Bitmap>) => {
    const def = sheetDef(no, TEMPLATE_VERSION)
    if (!def) return
    const sheetItems = items.filter((i) => i.no === no)
    const prev = project.sheets[no]?.drawn ? project.sheets[no] : undefined
    // 쓴 칸만 담는다 (안 쓴 글자는 다른 글씨의 자모로 조합)
    const cells: Cell[] = def.cells.filter((c) => c.char && map.has(c.index)).map((c) => {
      const bm = map.get(c.index)!
      const old = prev?.cells.find((x) => x.index === c.index)
      if (old && old.bitmap === bm) return old
      const seg = isHangul(c.char!) ? segmentScored(bm, c.char!) : null
      return { index: c.index, char: c.char, state: 'ok', include: true, bitmap: bm, labels: seg?.labels, segCost: seg?.cost }
    })
    onSheet({ no, ver: TEMPLATE_VERSION, drawn: true, preview: thumb(sheetItems, map), sharpness: 100, capturedAt: Date.now(), cells })
  }

  const saveCurrent = (): Map<number, Bitmap> => {
    if (!cur || !pad.current) return drawn
    const next = new Map(drawn)
    if (pad.current.isEmpty()) next.delete(cur.index)
    else {
      const bm = pad.current.getBitmap()
      if (inkOf(bm) < 12) next.delete(cur.index); else next.set(cur.index, bm)
    }
    const changed = next.get(cur.index) !== drawn.get(cur.index)
    setDrawn(next)
    if (changed) commitSheet(cur.no, next)
    return next
  }
  const goTo = (i: number) => { saveCurrent(); setAt(Math.max(0, Math.min(items.length - 1, i))) }
  const next = () => {
    const m = saveCurrent()
    // 다음으로 안 쓴 칸
    for (let k = 1; k <= items.length; k++) {
      const j = (at + k) % items.length
      if (!m.has(items[j].index)) { setAt(j); return }
    }
    setAt(Math.min(items.length - 1, at + 1))
  }
  const skip = () => {
    const m = new Map(drawn); m.delete(cur.index); setDrawn(m); commitSheet(cur.no, m)
    setAt(Math.min(items.length - 1, at + 1))
  }
  const finish = async () => {
    setBusy(true)
    await new Promise((r) => setTimeout(r, 30))
    const m = saveCurrent()
    // 아직 저장되지 않은 시트도 한 번씩 확정
    for (const no of TIERS[project.tier].sheets) if (items.some((i) => i.no === no && m.has(i.index)) && !project.sheets[no]?.drawn) commitSheet(no, m)
    setBusy(false)
    onNext()
  }

  const first = TIERS[project.tier].sheets[0]
  const firstSheetDone = items.filter((i) => i.no === first && drawn.has(i.index)).length
  const total = drawn.size
  if (!cur) return null
  const need = TIERS[project.tier].minDraw
  const canFinish = firstSheetDone >= need

  return (
    <main className="wrap screen draw">
      <Head n="03" title="화면에 직접 쓰세요">종이와 사진 없이 칸에 바로 써요. 평소 크기·속도로, 하늘색 십자 가운데에 칸의 70% 정도 크기로 쓰세요. 태블릿이면 펜이 가장 좋고, 손가락도 돼요.</Head>

      <div className="draw-top">
        <div className="draw-progress" aria-live="polite">
          <b className="count">{total}</b> / {items.length}자 · {TIERS[project.tier].label}
          <div className="engine-bar" aria-hidden><i style={{ width: `${Math.round((total / items.length) * 100)}%` }} /></div>
        </div>
      </div>

      <div className="draw-stage">
        <div className="draw-target">
          <span className="note">{at + 1}번째 칸 · {sheetLabel(cur.no)}</span>
          <b className="draw-char" aria-live="polite">{cur.char}</b>
          {drawn.has(cur.index) && <span className="tag"><span className="dot ok" />썼어요 · 고쳐 쓸 수 있어요</span>}
        </div>
        <DrawPad key={cur.index} ref={pad} n={cur.n} pen={cur.n * 0.045} initial={drawn.get(cur.index) ?? null} label={`‘${cur.char}’ 쓰는 칸`} />
        <div className="actions draw-nav">
          <button className="btn quiet" onClick={() => goTo(at - 1)} disabled={at === 0}>← 이전</button>
          <button className="btn quiet" onClick={() => pad.current?.clear()}>지우기</button>
          <button className="btn quiet" onClick={skip} disabled={!ready}>건너뛰기</button>
          <button className="btn primary" onClick={next} disabled={!ready}>{ready ? '다음 →' : '준비 중…'}</button>
        </div>
      </div>

      <details className="draw-all">
        <summary>전체 글자 보기 (눌러서 그 글자로 가기)</summary>
        <div className="odd-grid">
          {items.map((it, i) => (
            <button key={it.index} aria-pressed={drawn.has(it.index)} className={i === at ? 'here' : ''} onClick={() => goTo(i)} aria-label={`${it.char} ${drawn.has(it.index) ? '씀' : '안 씀'}`}>{it.char}</button>
          ))}
        </div>
      </details>

      <div className="actions draw-finish">
        <button className="btn primary" disabled={!canFinish || busy || !ready} onClick={finish}>{busy ? '정리하는 중…' : `쓴 ${total}자로 다듬기`}</button>
        <button className="btn quiet" onClick={() => { saveCurrent(); onBack() }}>종이에 쓰기로</button>
      </div>
      {!canFinish && <p className="note">첫 시트 글자를 {need}자 이상 쓰면 다음 단계로 갈 수 있어요. 많이 쓸수록 더 닮아요. 쓰다가 나가도 저장돼요.</p>}
    </main>
  )
}
