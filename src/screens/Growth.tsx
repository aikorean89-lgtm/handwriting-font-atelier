// 글씨 성장 기록: 저장한 폰트들을 같은 문장으로 나란히 비교하고 그림으로 저장
import { useEffect, useMemo, useRef, useState } from 'react'
import { type Record, addRecord, listRecords, removeRecord, renameRecord } from '../history'
import { SaveDeclined, saveFile } from '../platform'

const fmt = (t: number) => new Date(t).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
let seq = 0

export function GrowthScreen({ onMake }: { onMake: () => void }) {
  const [recs, setRecs] = useState<Record[] | null>(null)
  const [pick, setPick] = useState<string[]>([])
  const [text, setText] = useState('나는 날마다 조금씩 자라요.')
  const [fams, setFams] = useState<Map<string, string>>(new Map())
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [delAsk, setDelAsk] = useState<string | null>(null)
  const faces = useRef(new Map<string, FontFace>())
  const fileRef = useRef<HTMLInputElement>(null)
  // 다른 기기에서 만들었거나 예전에 받은 TTF도 기록에 넣을 수 있다
  const importTtf = async (f: File | undefined) => {
    if (!f) return
    setMsg(null)
    try {
      const ttf = new Uint8Array(await f.arrayBuffer())
      if (!(ttf[0] === 0 && ttf[1] === 1 && ttf[2] === 0 && ttf[3] === 0) && String.fromCharCode(...ttf.slice(0, 4)) !== 'true') throw new Error()
      await new FontFace('FontGongbangCheck', ttf.slice().buffer).load()
      const label = f.name.replace(/\.ttf$/i, '').slice(0, 30) || '불러온 폰트'
      const r = await addRecord({ name: label, label, direct: 0, ttf })
      await load()
      setPick((p) => (p.includes(r.id) ? p : [...p.slice(-3), r.id]))
      setMsg(`‘${label}’ 폰트를 기록에 넣었어요. ‘이름 바꾸기’로 날짜나 학기를 적어 두세요.`)
    } catch { setMsg('TTF 폰트 파일만 넣을 수 있어요.') }
  }

  const load = () => listRecords().then((r) => {
    setRecs(r)
    setPick((p) => (p.length ? p.filter((id) => r.some((x) => x.id === id)) : r.slice(0, 2).map((x) => x.id).reverse()))
  })
  useEffect(() => { load() }, [])
  useEffect(() => () => { for (const f of faces.current.values()) document.fonts.delete(f) }, [])

  // 고른 기록의 폰트를 불러온다
  useEffect(() => {
    for (const id of pick) {
      if (faces.current.has(id)) continue
      const r = recs?.find((x) => x.id === id)
      if (!r) continue
      const fam = `FontGongbangGrowth${++seq}`
      const f = new FontFace(fam, r.ttf.slice().buffer)
      faces.current.set(id, f)
      f.load().then((ff) => { document.fonts.add(ff); setFams((m) => new Map(m).set(id, fam)) }).catch(() => {})
    }
  }, [pick, recs])

  const chosen = useMemo(() => (recs ?? []).filter((r) => pick.includes(r.id)).sort((a, b) => a.createdAt - b.createdAt), [recs, pick])
  const toggle = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 4 ? p : [...p, id]))

  const saveImage = async () => {
    setMsg(null)
    const W = 1600, pad = 60, rowH = 200
    const c = document.createElement('canvas'); c.width = W; c.height = pad * 2 + 70 + rowH * chosen.length
    const x = c.getContext('2d')!
    x.fillStyle = '#fbfbf8'; x.fillRect(0, 0, c.width, c.height)
    x.fillStyle = '#1b1a1f'; x.font = '700 40px "Pretendard Variable", sans-serif'; x.fillText('글씨 성장 기록', pad, pad + 36)
    chosen.forEach((r, i) => {
      const y = pad + 70 + i * rowH
      x.strokeStyle = '#dfe2dc'; x.beginPath(); x.moveTo(pad, y + 10); x.lineTo(W - pad, y + 10); x.stroke()
      x.fillStyle = '#767a72'; x.font = '26px "Pretendard Variable", sans-serif'; x.fillText(`${r.label} · ${fmt(r.createdAt)}`, pad, y + 50)
      x.fillStyle = '#1b1a1f'
      let size = 84
      const fam = fams.get(r.id) ?? 'serif'
      x.font = `${size}px "${fam}"`
      while (x.measureText(text).width > W - pad * 2 && size > 30) { size -= 4; x.font = `${size}px "${fam}"` }
      x.fillText(text, pad, y + 150)
    })
    try {
      const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error())), 'image/png'))
      await saveFile('글씨-성장-기록.png', blob); setMsg('그림으로 저장했어요.')
    } catch (e) { if (!(e instanceof SaveDeclined)) setMsg('저장하지 못했어요.') }
  }

  return (
    <main className="wrap screen growth">
      <div className="gallery-head">
        <div>
          <p className="eyebrow">글씨 성장 기록</p>
          <h1>내 글씨가 어떻게 바뀌었을까요</h1>
          <p className="lede">폰트를 만들 때마다 ‘성장 기록에 저장’을 누르면 여기에 쌓여요. 학기 초와 학기 말 글씨를 같은 문장으로 나란히 비교해 보세요. 기록은 이 기기에만 저장돼요.</p>
        </div>
        <div className="row">
          <button className="btn primary" onClick={onMake}>새 폰트 만들기</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>TTF 파일로 기록 추가</button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".ttf,font/ttf" hidden data-testid="growth-file" onChange={(e) => { importTtf(e.target.files?.[0]); e.target.value = '' }} />
      {msg && !recs?.length && <p className="note" role="status">{msg}</p>}

      {recs && recs.length === 0 && (
        <div className="gallery-empty">
          <span className="seal-big" aria-hidden>글</span>
          <p><b>아직 저장한 기록이 없어요.</b><br />폰트를 만들고 마지막 단계에서 ‘성장 기록에 저장’을 누르거나, 예전에 받은 TTF 파일을 넣어 보세요.</p>
        </div>
      )}

      {recs && recs.length > 0 && (
        <>
          <h2 className="sub">비교할 기록 고르기 <span className="note">(4개까지)</span></h2>
          <ul className="rec-list">
            {recs.map((r) => (
              <li key={r.id} className={pick.includes(r.id) ? 'on' : ''}>
                <label className="check">
                  <input type="checkbox" checked={pick.includes(r.id)} onChange={() => toggle(r.id)} disabled={!pick.includes(r.id) && pick.length >= 4} />
                  {editing === r.id
                    ? <input className="rec-label" value={label} maxLength={30} autoFocus onChange={(e) => setLabel(e.target.value)} onKeyDown={async (e) => { if (e.key === 'Enter') { await renameRecord(r.id, label.trim() || r.label); setEditing(null); load() } }} />
                    : <span><b>{r.label}</b> <span className="note">{fmt(r.createdAt)}{r.direct ? ` · 직접 쓴 한글 ${r.direct}자` : ' · 파일에서 불러옴'}</span></span>}
                </label>
                <span className="row">
                  {editing === r.id
                    ? <button className="btn small" onClick={async () => { await renameRecord(r.id, label.trim() || r.label); setEditing(null); load() }}>저장</button>
                    : <button className="btn small quiet" onClick={() => { setEditing(r.id); setLabel(r.label) }}>이름 바꾸기</button>}
                  {delAsk === r.id
                    ? <><button className="btn small danger" onClick={async () => { await removeRecord(r.id); setDelAsk(null); load() }}>정말 지우기</button><button className="btn small quiet" onClick={() => setDelAsk(null)}>취소</button></>
                    : <button className="btn small quiet" onClick={() => setDelAsk(r.id)}>지우기</button>}
                </span>
              </li>
            ))}
          </ul>

          <label className="note" htmlFor="gtext">비교할 문장</label>
          <input id="gtext" className="supp-input" value={text} maxLength={40} onChange={(e) => setText(e.target.value)} />
          <div className="compare" aria-label="나란히 비교">
            {chosen.map((r) => (
              <div key={r.id} className="compare-row">
                <span className="note">{r.label} · {fmt(r.createdAt)}</span>
                <p style={{ fontFamily: fams.get(r.id) ? `'${fams.get(r.id)}'` : undefined }}>{fams.get(r.id) ? text : '불러오는 중…'}</p>
              </div>
            ))}
            {chosen.length === 0 && <p className="note">위에서 기록을 골라 주세요.</p>}
          </div>
          <div className="actions">
            <button className="btn" onClick={saveImage} disabled={!chosen.length || chosen.some((r) => !fams.get(r.id))}>비교 그림 저장 (PNG)</button>
            {msg && <span className="note" role="status" style={{ alignSelf: 'center' }}>{msg}</span>}
          </div>
        </>
      )}
    </main>
  )
}
