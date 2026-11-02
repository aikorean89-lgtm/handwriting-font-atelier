// 실제 사용자 폰트의 직접 쓴 글자를 칸 그림으로 되돌려, 자모 분리·조합을 다시 돌려 보는 시험대
import { segmentScored } from '../src/engine/segment'
import { ensureRefFont, refMasks, REF, persistDebug } from '../src/engine/refmask'
import { buildFont } from '../src/engine/build'
import { Library } from '../src/engine/model'
import { isHangul } from '../src/engine/hangul'
import type { Bitmap } from '../src/engine/bitmap'
declare global { interface Window { runReal: (url: string, chars: string, opts?: { picks?: string }) => Promise<any>; realReady: boolean } }
const N = 180
function cellOf(ch: string, fam: string): Bitmap {
  const c = document.createElement('canvas'); c.width = N; c.height = N
  const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, N, N); x.fillStyle = '#000'
  x.font = `${N}px "${fam}"`; x.textBaseline = 'alphabetic'; x.fillText(ch, 0, N * 0.88)
  const d = x.getImageData(0, 0, N, N).data; const out = new Uint8Array(N * N)
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] < 128 ? 1 : 0
  return { w: N, h: N, data: out }
}
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s) }
window.runReal = async (url, chars, opts = {}) => {
  const face = new FontFace('UserHand', await (await fetch(url)).arrayBuffer()); await face.load(); document.fonts.add(face)
  const arr = [...chars].filter(isHangul)
  await ensureRefFont(arr.join(''))
  const cells = arr.map((ch, i) => { const bm = cellOf(ch, 'UserHand'); const s = segmentScored(bm, ch); return { index: i + 1, char: ch, bitmap: bm, labels: s.labels, segCost: s.cost } })
  const t0 = performance.now()
  const r = await buildFont(cells, '시험', () => {}, {})
  const out: any = { ms: Math.round(performance.now() - t0), ttf: b64(r.ttf), direct: r.directHangul }
  if (opts.picks) {
    const lib = new Library(cells as any)
    const name = (sm: any) => arr[+sm.key.split(':')[0] - 1] ?? 'ref'
    const grp = (slot: string, j: number) => lib.samples.filter((x) => x.slot === slot && x.jamo === j).sort((a, b) => a.cons! - b.cons!).map((x) => `${name(x)}${x.outlier ? '✗' : ''}${x.cons!.toFixed(2)}`).join(' ')
    out.groups = { 'cho ㄴ': grp('cho', 2), 'cho ㄹ': grp('cho', 5), 'cho ㅎ': grp('cho', 18), 'jong ㄷ': grp('jong', 7), 'jung ㅏ': grp('jung', 0), 'jung ㅓ': grp('jung', 4), 'cho ㅌ': grp('cho', 16) }
    out.outliers = lib.outliers().map((x) => `${x.slot}:${name(x)}`).join(' ')
    out.picks = [...opts.picks].map((ch) => ({ ch, parts: lib.plan(ch).parts.map((p) => `${p.sample.slot}:${p.sample.key}:${arr[+p.sample.key.split(':')[0] - 1] ?? 'ref'}`) }))
  }
  return out
}
window.realReady = true
const COL = [[255, 255, 255], [194, 80, 47], [47, 138, 115], [176, 132, 26]]
;(window as any).segSheet = async (url: string, chars: string, opts: any = {}) => {
  setRefine(!opts.noRefine); setRefineAbove(opts.above ?? 0.62)
  if (!(window as any).__uh) { const f = new FontFace('UserHand', await (await fetch(url)).arrayBuffer()); await f.load(); document.fonts.add(f); (window as any).__uh = 1 }
  const arr = [...chars]; await ensureRefFont(chars)
  const cols = 10, rows = Math.ceil(arr.length / cols)
  const cv = document.createElement('canvas'); cv.width = cols * (N + 4); cv.height = rows * (N + 22)
  const ctx = cv.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height)
  arr.forEach((ch, j) => {
    const bm = cellOf(ch, 'UserHand'); const s = segmentScored(bm, ch)
    const img = ctx.createImageData(N, N)
    for (let i = 0; i < N * N; i++) img.data.set([...(bm.data[i] ? COL[s.labels[i]] : COL[0]), 255], i * 4)
    const x = (j % cols) * (N + 4), y = Math.floor(j / cols) * (N + 22)
    ctx.putImageData(img, x, y + 20); ctx.fillStyle = '#000'; ctx.font = '16px sans-serif'; ctx.fillText(`${ch} ${s.cost.toFixed(2)}`, x + 4, y + 16)
    ctx.strokeStyle = '#ddd'; ctx.strokeRect(x, y + 20, N, N)
  })
  return cv.toDataURL()
}

;(window as any).refSheet = async (chars: string) => {
  const arr = [...chars]; await ensureRefFont(chars)
  const cv = document.createElement('canvas'); cv.width = arr.length * (REF + 4); cv.height = REF + 22
  const ctx = cv.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height)
  arr.forEach((ch, j) => {
    const m = refMasks(ch); const img = ctx.createImageData(REF, REF)
    for (let i = 0; i < REF * REF; i++) { const k = m.slot.cho[i] ? 1 : m.slot.jung[i] ? 2 : m.slot.jong?.[i] ? 3 : 0; img.data.set([...COL[k], 255], i * 4) }
    ctx.putImageData(img, j * (REF + 4), 20); ctx.fillStyle = '#000'; ctx.font = '16px sans-serif'; ctx.fillText(ch, j * (REF + 4) + 4, 16)
  })
  return cv.toDataURL()
}

;(window as any).persist = async (chars: string) => {
  await ensureRefFont(chars); const out: Record<string, string[]> = {}
  for (const ch of chars) { persistDebug.on = true; persistDebug.log = []; refMasks(ch); persistDebug.on = false; out[ch] = persistDebug.log.slice() }
  return out
}
import { strokeUnits, strokeDebug, strokeOpts } from '../src/engine/strokes'
;(window as any).unitSheet = async (url: string, chars: string) => {
  if (!(window as any).__uh) { const f = new FontFace('UserHand', await (await fetch(url)).arrayBuffer()); await f.load(); document.fonts.add(f); (window as any).__uh = 1 }
  const arr = [...chars]
  const cols = 10, rows = Math.ceil(arr.length / cols)
  const cv = document.createElement('canvas'); cv.width = cols * (N + 4); cv.height = rows * (N + 22)
  const ctx = cv.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height)
  const pal = [[230, 25, 75], [60, 180, 75], [0, 130, 200], [245, 130, 48], [145, 30, 180], [70, 200, 200], [240, 50, 230], [128, 128, 0], [0, 128, 128], [170, 110, 40], [128, 0, 0], [0, 0, 128], [100, 100, 100], [200, 200, 0], [0, 200, 100], [255, 120, 160], [90, 60, 200], [40, 40, 40]]
  arr.forEach((ch, j) => {
    const bm = cellOf(ch, 'UserHand'); strokeDebug.maxTurn = 0; strokeDebug.lens = []; const U = strokeUnits(bm); console.log(ch, strokeDebug.lens.join(' '))
    const img = ctx.createImageData(N, N)
    for (let i = 0; i < N * N; i++) img.data.set([...(bm.data[i] ? pal[(U.unit[i] - 1) % pal.length] : [255, 255, 255]), 255], i * 4)
    const x = (j % cols) * (N + 4), y = Math.floor(j / cols) * (N + 22)
    ctx.putImageData(img, x, y + 20); ctx.fillStyle = '#000'; ctx.font = '16px sans-serif'; ctx.fillText(`${ch} n=${U.n} c=${strokeDebug.cuts}/${strokeDebug.paths} t=${strokeDebug.maxTurn.toFixed(2)}`, x + 4, y + 16)
  })
  return cv.toDataURL()
}
import { segDebug, setVoteWeight, setRefine, setRefineAbove } from '../src/engine/segment'
;(window as any).setVW = (v: number) => setVoteWeight(v)
;(window as any).segDbg = async (url: string, ch: string) => {
  if (!(window as any).__uh) { const f = new FontFace('UserHand', await (await fetch(url)).arrayBuffer()); await f.load(); document.fonts.add(f); (window as any).__uh = 1 }
  await ensureRefFont(ch)
  const bm = cellOf(ch, 'UserHand'); segDebug.on = true; segDebug.log = []
  const r = segmentScored(bm, ch); segDebug.on = false
  const cnt = [0, 0, 0, 0]; for (let i = 0; i < r.labels.length; i++) if (bm.data[i]) cnt[r.labels[i]]++
  const alt = (window as any).__try ? (window as any).__try.map((t: string) => `${t}=${(segDebug as any).evalUnits?.(t)?.toFixed(3)}`) : []
  return { cost: r.cost, cnt, log: segDebug.log.slice(-4).concat(alt) }
}
;(window as any).groupSheet = async (url: string, chars: string, groups: [string, number][]) => {
  if (!(window as any).__uh) { const f = new FontFace('UserHand', await (await fetch(url)).arrayBuffer()); await f.load(); document.fonts.add(f); (window as any).__uh = 1 }
  const arr = [...chars]; await ensureRefFont(chars)
  const cells = arr.map((ch, i) => { const bm = cellOf(ch, 'UserHand'); const s = segmentScored(bm, ch); return { index: i + 1, char: ch, bitmap: bm, labels: s.labels, segCost: s.cost } })
  const lib = new Library(cells as any)
  const S = 72, rowsOut: any[] = []
  for (const [slot, j] of groups) rowsOut.push(lib.samples.filter((x) => x.slot === slot && x.jamo === j).sort((a, b) => a.cons! - b.cons!))
  const W = Math.max(...rowsOut.map((r) => r.length)) * (S + 6)
  const cv = document.createElement('canvas'); cv.width = W; cv.height = rowsOut.length * (S + 20)
  const ctx = cv.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height)
  rowsOut.forEach((row, r) => row.forEach((sm: any, k: number) => {
    const N = sm.bitmap.w, img = ctx.createImageData(N, N)
    for (let i = 0; i < N * N; i++) { const on = sm.bitmap.data[i] && sm.mask[i] === sm.want; const any = sm.bitmap.data[i]; img.data.set(on ? [0, 0, 0, 255] : any ? [210, 210, 210, 255] : [255, 255, 255, 255], i * 4) }
    const tmp = document.createElement('canvas'); tmp.width = N; tmp.height = N; tmp.getContext('2d')!.putImageData(img, 0, 0)
    const x = k * (S + 6), y = r * (S + 20)
    ctx.drawImage(tmp, x, y + 18, S, S); ctx.fillStyle = sm.outlier ? '#c00' : '#000'; ctx.font = '12px sans-serif'
    ctx.fillText(`${arr[+sm.key.split(':')[0] - 1]} ${sm.cons.toFixed(2)}`, x + 2, y + 13)
  }))
  return cv.toDataURL()
}

;(window as any).metric = async (url: string, chars: string, opts: any) => {
  if (!(window as any).__uh) { const f = new FontFace('UserHand', await (await fetch(url)).arrayBuffer()); await f.load(); document.fonts.add(f); (window as any).__uh = 1 }
  Object.assign(strokeOpts, opts.strokes ?? {}); if (opts.vw != null) setVoteWeight(opts.vw); setRefine(!opts.noRefine); setRefineAbove(opts.above ?? 0.62)
  const arr = [...chars]; await ensureRefFont(chars)
  let segSum = 0
  const cells = arr.map((ch, i) => { const bm = cellOf(ch, 'UserHand'); const s = opts.noRefine ? segmentScored(bm, ch) : segmentScored(bm, ch); segSum += s.cost; return { index: i + 1, char: ch, bitmap: bm, labels: s.labels, segCost: s.cost } })
  const lib = new Library(cells as any)
  const groups = new Map<string, number[]>()
  for (const sm of lib.samples) { const k = sm.slot + sm.jamo; groups.set(k, [...(groups.get(k) ?? []), sm.cons!]) }
  let wsum = 0, n = 0
  for (const g of groups.values()) { if (g.length < 3) continue; const s = [...g].sort((a, b) => a - b); wsum += s[s.length >> 1] * g.length; n += g.length }
  return { seg: segSum / arr.length, cons: wsum / n, outliers: lib.outliers().length }
}
