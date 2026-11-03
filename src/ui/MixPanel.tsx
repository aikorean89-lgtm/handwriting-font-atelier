// 두 글씨 섞기: 초성·중성·받침을 나와 다른 사람의 글씨에서 골라 '가족 폰트'를 만든다
import { useEffect, useState } from 'react'
import { type BuildCell, type BuildOptions, type BuildResult, buildFont } from '../engine/build'
import { fontToCells, medianFrame } from '../engine/fontcells'
import { isHangul } from '../engine/hangul'
import { LAYOUT } from '../engine/template'
import { type GalleryFont, gallery } from '../gallery/backend'
import { type Record, listRecords } from '../history'
import { SaveDeclined, saveFile } from '../platform'
import { safeFile } from '../engine/webfont'

type Who = 'A' | 'B'
type Parts = { cho: Who; jung: Who; jong: Who }
const PARTS: [keyof Parts, string][] = [['cho', '초성 (첫소리)'], ['jung', '중성 (모음)'], ['jong', '받침']]
// 상대 글씨에서 뽑을 글자: 일반 모드 시트의 한글 (자모 모양을 고루 담고 있다)
const PARTNER_CHARS = LAYOUT.sheets.filter((s) => s.sheet >= 1 && s.sheet <= 4).flatMap((s) => s.cells.map((c) => c.char ?? '')).filter(isHangul)
let seq = 0

export function MixPanel({ cells, myName, settings }: { cells: BuildCell[]; myName: string; settings: BuildOptions }) {
  const [src, setSrc] = useState<'gallery' | 'record' | 'file'>('gallery')
  const [gal, setGal] = useState<GalleryFont[] | null>(null)
  const [recs, setRecs] = useState<Record[] | null>(null)
  const [partner, setPartner] = useState<{ name: string; get: () => Promise<Uint8Array> } | null>(null)
  const [parts, setParts] = useState<Parts>({ cho: 'B', jung: 'A', jong: 'A' })
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [res, setRes] = useState<{ r: BuildResult; fam: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [text, setText] = useState('우리 가족 손글씨로 만든 폰트예요.')

  useEffect(() => {
    if (src === 'gallery' && !gal) gallery().list().then(setGal).catch(() => setGal([]))
    if (src === 'record' && !recs) listRecords().then(setRecs).catch(() => setRecs([]))
  }, [src, gal, recs])

  const make = async () => {
    if (!partner) return
    setErr(null); setRes(null)
    try {
      setBusy('상대 글씨를 불러오는 중')
      const ttf = await partner.get()
      setBusy('상대 글씨의 자모를 나누는 중')
      const b = await fontToCells(ttf, PARTNER_CHARS, 90001, 180, (d, t) => setBusy(`상대 글씨의 자모를 나누는 중 ${Math.round((d / t) * 100)}%`), medianFrame(cells))
      const a = cells.map((c) => ({ ...c, src: 'A' as const }))
      const family = name.trim() || `${myName}+${partner.name}`.slice(0, 24)
      setBusy('섞은 폰트를 만드는 중')
      const r = await buildFont([...a, ...b], family, (p) => setBusy(`섞은 폰트를 만드는 중 (${p.phase === 'compose' ? Math.round((p.done / p.total) * 100) + '%' : '준비'})`), settings,
        { keep: (c, slot) => (c.src ?? 'A') === parts[slot], noDirectHangul: true })
      const fam = `FontGongbangMixed${++seq}`
      const face = await new FontFace(fam, r.ttf.slice().buffer).load()
      document.fonts.add(face)
      setRes({ r, fam })
    } catch { setErr('섞은 폰트를 만들지 못했어요. 다른 글씨체로 해 보세요.') } finally { setBusy(null) }
  }
  const download = async () => {
    if (!res) return
    try { await saveFile(`${safeFile(res.r.family)}.ttf`, new Blob([res.r.ttf as BlobPart], { type: 'font/ttf' })) } catch (e) { if (!(e instanceof SaveDeclined)) setErr('저장하지 못했어요.') }
  }
  const same = parts.cho === parts.jung && parts.jung === parts.jong

  return (
    <section className="mix" aria-label="두 글씨 섞기">
      <h3>두 글씨 섞기</h3>
      <p className="note">초성은 엄마 글씨, 모음과 받침은 내 글씨처럼 두 사람의 글씨를 섞어 ‘가족 폰트’를 만들어요. 상대 글씨는 갤러리·성장 기록·TTF 파일에서 고를 수 있어요. 만든 폰트는 따로 내려받고, 지금 내 폰트는 그대로예요.</p>
      <div className="seg" role="group" aria-label="상대 글씨 가져올 곳">
        <button aria-pressed={src === 'gallery'} onClick={() => { setSrc('gallery'); setPartner(null) }}>갤러리</button>
        <button aria-pressed={src === 'record'} onClick={() => { setSrc('record'); setPartner(null) }}>성장 기록</button>
        <button aria-pressed={src === 'file'} onClick={() => { setSrc('file'); setPartner(null) }}>TTF 파일</button>
      </div>
      <div className="mix-pick">
        {src === 'gallery' && (gal == null ? <span className="note">갤러리를 불러오는 중…</span> : gal.length === 0 ? <span className="note">갤러리에 고를 글씨체가 없어요.</span> : (
          <select aria-label="갤러리 글씨체" value={partner?.name ?? ''} onChange={(e) => { const f = gal.find((x) => x.id === e.target.value); if (f) setPartner({ name: f.name, get: () => fetch(f.ttfUrl).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)) }) }}>
            <option value="">글씨체 고르기</option>
            {gal.map((f) => <option key={f.id} value={f.id}>{f.name}{f.author ? ` · ${f.author}` : ''}</option>)}
          </select>
        ))}
        {src === 'record' && (recs == null ? <span className="note">불러오는 중…</span> : recs.length === 0 ? <span className="note">저장한 성장 기록이 없어요.</span> : (
          <select aria-label="성장 기록" defaultValue="" onChange={(e) => { const r = recs.find((x) => x.id === e.target.value); if (r) setPartner({ name: r.label, get: async () => r.ttf }) }}>
            <option value="">기록 고르기</option>
            {recs.map((r) => <option key={r.id} value={r.id}>{r.label} · {new Date(r.createdAt).toLocaleDateString('ko-KR')}</option>)}
          </select>
        ))}
        {src === 'file' && (
          <input type="file" accept=".ttf,font/ttf" aria-label="상대 TTF 파일" onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) setPartner({ name: f.name.replace(/\.ttf$/i, '').slice(0, 12), get: () => f.arrayBuffer().then((b) => new Uint8Array(b)) })
          }} />
        )}
      </div>
      <div className="mix-parts">
        {PARTS.map(([k, l]) => (
          <div key={k} className="mix-part">
            <span>{l}</span>
            <div className="seg" role="group" aria-label={`${l} 가져올 글씨`}>
              <button aria-pressed={parts[k] === 'A'} onClick={() => setParts((p) => ({ ...p, [k]: 'A' }))}>내 글씨</button>
              <button aria-pressed={parts[k] === 'B'} onClick={() => setParts((p) => ({ ...p, [k]: 'B' }))}>{partner?.name || '상대 글씨'}</button>
            </div>
          </div>
        ))}
      </div>
      <div className="fix-row">
        <input className="mix-name" value={name} maxLength={24} placeholder={partner ? `${myName}+${partner.name}`.slice(0, 24) : '섞은 폰트 이름'} onChange={(e) => setName(e.target.value)} aria-label="섞은 폰트 이름" />
        <button className="btn" onClick={make} disabled={!partner || !!busy || same}>{busy ?? '섞은 폰트 만들기'}</button>
      </div>
      {same && <p className="note">한 사람 글씨만 고르면 섞을 게 없어요. 하나 이상을 다른 사람 글씨로 바꿔 주세요.</p>}
      {err && <p className="note" role="alert" style={{ color: 'var(--warn)' }}>{err}</p>}
      {res && (
        <div className="mix-result">
          <textarea className="play-input" value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: `'${res.fam}'`, minHeight: 120 }} aria-label="섞은 폰트로 써 보기" />
          <div className="actions"><button className="btn primary" onClick={download}>{safeFile(res.r.family)}.ttf 내려받기</button></div>
        </div>
      )}
    </section>
  )
}
