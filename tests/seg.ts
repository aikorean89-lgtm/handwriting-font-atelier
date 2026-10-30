import { segment } from '../src/engine/segment'
import { ensureRefFont, refMasks, REF } from '../src/engine/refmask'
import type { Bitmap } from '../src/engine/bitmap'
declare global { interface Window { runSeg: (chars: string, font: string) => Promise<string>; segReady: boolean } }
const N = 160
function handBitmap(ch: string, font: string): Bitmap {
  const c = document.createElement('canvas'); c.width = N; c.height = N
  const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, N, N); x.fillStyle = '#000'
  x.font = `${N * 0.82}px "${font}"`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, N / 2, N / 2)
  const d = x.getImageData(0, 0, N, N).data; const out = new Uint8Array(N * N)
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] < 128 ? 1 : 0
  return { w: N, h: N, data: out }
}
const COL = [[255,255,255],[194,80,47],[62,138,115],[184,138,22]]
window.runSeg = async (chars, font) => {
  await document.fonts.load(`100px "${font}"`, chars)
  await ensureRefFont(chars)
  const arr = [...chars]
  const cv = document.createElement('canvas'); cv.width = arr.length * (N + REF + 8); cv.height = N
  const ctx = cv.getContext('2d')!
  arr.forEach((ch, j) => {
    const bm = handBitmap(ch, font); const lab = segment(bm, ch)
    const img = ctx.createImageData(N, N)
    for (let i = 0; i < N * N; i++) { const c = bm.data[i] ? COL[lab[i]] : COL[0]; img.data.set([...c, 255], i * 4) }
    ctx.putImageData(img, j * (N + REF + 8), 0)
    const m = refMasks(ch); const ri = ctx.createImageData(REF, REF)
    for (let i = 0; i < REF * REF; i++) { const k = m.slot.cho[i] ? 1 : m.slot.jung[i] ? 2 : m.slot.jong?.[i] ? 3 : 0; ri.data.set([...COL[k], 255], i * 4) }
    ctx.putImageData(ri, j * (N + REF + 8) + N, 0)
  })
  return cv.toDataURL()
}
window.segReady = true
import { refCharsFor } from '../src/engine/refmask'
;(window as any).dumpRef = async (ch: string) => {
  await ensureRefFont(ch)
  const cs = refCharsFor(ch)
  const c = document.createElement('canvas'); c.width = 128 * cs.length; c.height = 128
  const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, 128); x.fillStyle = '#000'
  x.font = `500 ${Math.round(128 * 0.86)}px "Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif`
  x.textAlign = 'center'; x.textBaseline = 'middle'
  cs.forEach((s, i) => x.fillText(s, 64 + i * 128, 64 + 128 * 0.02))
  return { chars: cs.join(''), url: c.toDataURL(), loaded: document.fonts.check(`500 100px "Pretendard Variable"`, cs.join('')) }
}
;(window as any).refStats = async (ch: string) => {
  await ensureRefFont(ch)
  const m = refMasks(ch)
  const cnt = (a: Uint8Array | null) => a ? a.reduce((s, v) => s + v, 0) : -1
  // 초성 영역의 행별 분포
  const rows: number[] = []
  for (let y = 0; y < REF; y += 8) { let n = 0; for (let yy = y; yy < y + 8; yy++) for (let x = 0; x < REF; x++) n += m.slot.cho[yy * REF + x]; rows.push(n) }
  return { all: cnt(m.all), cho: cnt(m.slot.cho), jung: cnt(m.slot.jung), jong: cnt(m.slot.jong), choRows: rows.join(',') }
}
import { splitForDisplay } from '../src/engine/refmask'
;(window as any).evalSeg = async (chars: string, font: string) => {
  const arr = [...chars]
  await document.fonts.load(`100px "${font}"`, chars + arr.map((c) => refCharsFor(c).join('')).join(''))
  await ensureRefFont(chars)
  const S = 160
  const res: [string, number][] = []
  for (const ch of arr) {
    const gt = splitForDisplay(ch, S, `${Math.round(S * 0.82)}px "${font}"`)
    const bm = { w: S, h: S, data: gt.all }
    const lab = segment(bm, ch)
    let ok = 0, n = 0
    for (let i = 0; i < S * S; i++) {
      if (!gt.all[i]) continue
      const g = gt.cho[i] ? 1 : gt.jung[i] ? 2 : gt.jong?.[i] ? 3 : 0
      if (!g) continue
      n++; if (lab[i] === g) ok++
    }
    res.push([ch, n ? ok / n : 1])
  }
  const mean = res.reduce((s, r) => s + r[1], 0) / res.length
  const good = res.filter((r) => r[1] >= 0.9).length / res.length
  return { mean, good, worst: res.sort((a, b) => a[1] - b[1]).slice(0, 25).map((r) => `${r[0]}${Math.round(r[1] * 100)}`).join(' ') }
}
;(window as any).showGT = async (chars: string, font: string) => {
  const arr = [...chars]; const S = 160
  await document.fonts.load(`100px "${font}"`, chars + arr.map((c) => refCharsFor(c).join('')).join(''))
  await ensureRefFont(chars)
  const c = document.createElement('canvas'); c.width = arr.length * S * 2; c.height = S
  const ctx = c.getContext('2d')!
  arr.forEach((ch, j) => {
    const gt = splitForDisplay(ch, S, `${Math.round(S * 0.82)}px "${font}"`)
    const lab = segment({ w: S, h: S, data: gt.all }, ch)
    const a = ctx.createImageData(S, S), b = ctx.createImageData(S, S)
    for (let i = 0; i < S * S; i++) {
      const g = gt.cho[i] ? 1 : gt.jung[i] ? 2 : gt.jong?.[i] ? 3 : 0
      a.data.set([...(gt.all[i] ? COL[g] : COL[0]), 255], i * 4)
      b.data.set([...(gt.all[i] ? COL[lab[i]] : COL[0]), 255], i * 4)
    }
    ctx.putImageData(a, j * 2 * S, 0); ctx.putImageData(b, j * 2 * S + S, 0)
  })
  return c.toDataURL()
}
import { segDebug } from '../src/engine/segment'
;(window as any).dbg = async (ch: string, font: string) => {
  await document.fonts.load(`100px "${font}"`, ch); await ensureRefFont(ch)
  segDebug.on = true; segDebug.log = []
  segment(handBitmap(ch, font), ch)
  segDebug.on = false
  return segDebug.log.slice(-1).concat(segDebug.log.slice(0, -1).sort((a, b) => +a.split(' ')[1] - +b.split(' ')[1]).slice(0, 6))
}
// 합성 정답: 기준 글꼴 자모를 자모마다 다르게 비틀어 다시 조립 (손글씨의 비율 차이를 흉내)
;(window as any).evalSynth = async (chars: string, seed: number) => {
  await ensureRefFont(chars)
  let sd = seed
  const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647 }
  const S = 160, res: [string, number][] = []
  const c = document.createElement('canvas'); c.width = S; c.height = S
  const x = c.getContext('2d', { willReadFrequently: true })!
  const src = document.createElement('canvas'); src.width = REF; src.height = REF
  const sx = src.getContext('2d')!
  for (const ch of chars) {
    const m = refMasks(ch)
    const masks = [m.slot.cho, m.slot.jung, m.slot.jong].filter(Boolean) as Uint8Array[]
    const labs = new Uint8Array(S * S), bm = new Uint8Array(S * S)
    const gs = 0.85 + rnd() * 0.2
    masks.forEach((mk, k) => {
      const img = sx.createImageData(REF, REF)
      for (let i = 0; i < mk.length; i++) if (mk[i]) img.data.set([0, 0, 0, 255], i * 4)
      sx.clearRect(0, 0, REF, REF); sx.putImageData(img, 0, 0)
      x.clearRect(0, 0, S, S); x.save()
      x.translate(S / 2 + (rnd() - 0.5) * S * 0.1, S / 2 + (rnd() - 0.5) * S * 0.1)
      x.rotate((rnd() - 0.5) * 0.14); x.scale(gs * (0.78 + rnd() * 0.44), gs * (0.78 + rnd() * 0.44))
      x.drawImage(src, -REF / 2 * 1.2, -REF / 2 * 1.2, REF * 1.2, REF * 1.2); x.restore()
      const d = x.getImageData(0, 0, S, S).data
      for (let i = 0; i < S * S; i++) if (d[i * 4 + 3] > 110 && !bm[i]) { bm[i] = 1; labs[i] = k + 1 }
    })
    const lab = segment({ w: S, h: S, data: bm }, ch)
    let ok = 0, n = 0
    for (let i = 0; i < S * S; i++) if (bm[i]) { n++; if (lab[i] === labs[i]) ok++ }
    res.push([ch, n ? ok / n : 1])
  }
  const mean = res.reduce((s, r) => s + r[1], 0) / res.length
  return { mean, good: res.filter((r) => r[1] >= 0.9).length / res.length, worst: res.sort((a, b) => a[1] - b[1]).slice(0, 20).map((r) => `${r[0]}${Math.round(r[1] * 100)}`).join(' ') }
}
