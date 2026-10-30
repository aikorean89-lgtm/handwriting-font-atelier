// 최소 TrueType 작성기: 단순 글리프(2차 곡선) + 복합 글리프(자모 참조 + 크기·위치 변환)

export interface TPoint { x: number; y: number; on: boolean }
export interface TComponent { glyph: number; sx: number; sy: number; dx: number; dy: number }
export interface TGlyph {
  advance: number
  unicodes?: number[]
  contours?: TPoint[][] // 정수 좌표, 바깥 시계 방향(y 위로)
  components?: TComponent[]
}
export interface FontInfo {
  family: string
  postscript: string
  version: string
  copyright: string
  license: string
  ascender: number
  descender: number
  lineGap: number
  typoAscender: number
  typoDescender: number
  typoLineGap: number
  xHeight: number
  capHeight: number
}

class W {
  buf = new Uint8Array(1024)
  len = 0
  private ensure(n: number) {
    if (this.len + n <= this.buf.length) return
    let cap = this.buf.length * 2
    while (cap < this.len + n) cap *= 2
    const nb = new Uint8Array(cap); nb.set(this.buf.subarray(0, this.len)); this.buf = nb
  }
  u8(v: number) { this.ensure(1); this.buf[this.len++] = v & 0xff }
  u16(v: number) { this.ensure(2); this.buf[this.len++] = (v >> 8) & 0xff; this.buf[this.len++] = v & 0xff }
  i16(v: number) { this.u16(v < 0 ? v + 0x10000 : v) }
  u32(v: number) { this.u16((v >>> 16) & 0xffff); this.u16(v & 0xffff) }
  i32(v: number) { this.u32(v >>> 0) }
  f2dot14(v: number) { this.i16(Math.round(Math.max(-2, Math.min(1.99993, v)) * 16384)) }
  bytes(b: Uint8Array) { this.ensure(b.length); this.buf.set(b, this.len); this.len += b.length }
  tag(s: string) { for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i)) }
  pad4() { while (this.len % 4) this.u8(0) }
  out() { return this.buf.slice(0, this.len) }
}

function checksum(b: Uint8Array): number {
  let sum = 0
  const n = Math.ceil(b.length / 4) * 4
  for (let i = 0; i < n; i += 4) {
    const v = ((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)
    sum = (sum + (v >>> 0)) >>> 0
  }
  return sum >>> 0
}

interface BBox { xMin: number; yMin: number; xMax: number; yMax: number }

export function buildTTF(glyphs: TGlyph[], info: FontInfo): Uint8Array {
  const n = glyphs.length
  // 1) 단순 글리프 경계 상자 / 점 수
  const bbox: (BBox | null)[] = new Array(n).fill(null)
  const pts: number[] = new Array(n).fill(0)
  const ctrs: number[] = new Array(n).fill(0)
  glyphs.forEach((g, i) => {
    if (!g.contours || !g.contours.length) return
    let b: BBox = { xMin: Infinity, yMin: Infinity, xMax: -Infinity, yMax: -Infinity }
    for (const c of g.contours) for (const p of c) {
      b = { xMin: Math.min(b.xMin, p.x), yMin: Math.min(b.yMin, p.y), xMax: Math.max(b.xMax, p.x), yMax: Math.max(b.yMax, p.y) }
    }
    bbox[i] = b
    pts[i] = g.contours.reduce((s, c) => s + c.length, 0)
    ctrs[i] = g.contours.length
  })
  // 2) 복합 글리프 경계 상자
  let maxCompPts = 0, maxCompCtrs = 0, maxCompEl = 0
  glyphs.forEach((g, i) => {
    if (!g.components) return
    let b: BBox | null = null
    let p = 0, c = 0
    for (const comp of g.components) {
      const cb = bbox[comp.glyph]
      if (glyphs[comp.glyph].components) throw new Error('복합 글리프는 한 단계만 지원')
      p += pts[comp.glyph]; c += ctrs[comp.glyph]
      if (!cb) continue
      const xs = [cb.xMin * comp.sx + comp.dx, cb.xMax * comp.sx + comp.dx]
      const ys = [cb.yMin * comp.sy + comp.dy, cb.yMax * comp.sy + comp.dy]
      const t = { xMin: Math.floor(Math.min(...xs)), xMax: Math.ceil(Math.max(...xs)), yMin: Math.floor(Math.min(...ys)), yMax: Math.ceil(Math.max(...ys)) }
      b = b ? { xMin: Math.min(b.xMin, t.xMin), yMin: Math.min(b.yMin, t.yMin), xMax: Math.max(b.xMax, t.xMax), yMax: Math.max(b.yMax, t.yMax) } : t
    }
    bbox[i] = b
    maxCompPts = Math.max(maxCompPts, p); maxCompCtrs = Math.max(maxCompCtrs, c)
    maxCompEl = Math.max(maxCompEl, g.components.length)
  })

  // 3) glyf + loca
  const glyf = new W()
  const loca: number[] = []
  glyphs.forEach((g, i) => {
    loca.push(glyf.len)
    const b = bbox[i]
    if (!b) return
    if (g.components) {
      glyf.i16(-1); glyf.i16(b.xMin); glyf.i16(b.yMin); glyf.i16(b.xMax); glyf.i16(b.yMax)
      g.components.forEach((c, k) => {
        let flags = 0x0001 | 0x0002 | 0x0040 | 0x1000 // WORDS, XY_VALUES, X_AND_Y_SCALE, UNSCALED_OFFSET
        if (k < g.components!.length - 1) flags |= 0x0020 // MORE_COMPONENTS
        if (k === 0) flags |= 0x0400 // OVERLAP_COMPOUND
        glyf.u16(flags); glyf.u16(c.glyph)
        glyf.i16(Math.round(c.dx)); glyf.i16(Math.round(c.dy))
        glyf.f2dot14(c.sx); glyf.f2dot14(c.sy)
      })
    } else {
      const cs = g.contours!
      glyf.i16(cs.length); glyf.i16(b.xMin); glyf.i16(b.yMin); glyf.i16(b.xMax); glyf.i16(b.yMax)
      let end = -1
      for (const c of cs) { end += c.length; glyf.u16(end) }
      glyf.u16(0) // instructionLength
      let first = true
      for (const c of cs) for (const p of c) { glyf.u8((p.on ? 1 : 0) | (first ? 0x40 : 0)); first = false }
      let px = 0
      for (const c of cs) for (const p of c) { glyf.i16(p.x - px); px = p.x }
      let py = 0
      for (const c of cs) for (const p of c) { glyf.i16(p.y - py); py = p.y }
    }
    glyf.pad4()
  })
  loca.push(glyf.len)
  const locaW = new W()
  for (const o of loca) locaW.u32(o)

  // 4) hmtx
  const hmtx = new W()
  let advMax = 0, minLsb = Infinity, minRsb = Infinity, maxExt = -Infinity
  let gxMin = Infinity, gyMin = Infinity, gxMax = -Infinity, gyMax = -Infinity
  glyphs.forEach((g, i) => {
    const b = bbox[i]
    const lsb = b ? b.xMin : 0
    hmtx.u16(Math.round(g.advance)); hmtx.i16(lsb)
    advMax = Math.max(advMax, g.advance)
    if (b) {
      minLsb = Math.min(minLsb, b.xMin)
      minRsb = Math.min(minRsb, g.advance - b.xMax)
      maxExt = Math.max(maxExt, b.xMax)
      gxMin = Math.min(gxMin, b.xMin); gyMin = Math.min(gyMin, b.yMin); gxMax = Math.max(gxMax, b.xMax); gyMax = Math.max(gyMax, b.yMax)
    }
  })
  if (!isFinite(gxMin)) { gxMin = gyMin = gxMax = gyMax = 0; minLsb = minRsb = maxExt = 0 }

  // 5) cmap (format 4)
  const map: [number, number][] = []
  glyphs.forEach((g, i) => (g.unicodes ?? []).forEach((u) => { if (u <= 0xffff) map.push([u, i]) }))
  map.sort((a, b) => a[0] - b[0])
  const cmap = buildCmap4(map)

  // 6) OS/2, hhea, maxp, head, name, post
  const advs = glyphs.filter((g) => g.advance > 0).map((g) => g.advance)
  const avg = Math.round(advs.reduce((s, v) => s + v, 0) / Math.max(1, advs.length))
  const winAsc = Math.max(info.ascender, gyMax), winDesc = Math.max(-info.descender, -gyMin)
  const os2 = new W()
  os2.u16(4); os2.i16(avg); os2.u16(400); os2.u16(5); os2.u16(0)
  os2.i16(650); os2.i16(600); os2.i16(0); os2.i16(75); os2.i16(650); os2.i16(600); os2.i16(0); os2.i16(350)
  os2.i16(50); os2.i16(300); os2.i16(0)
  for (let i = 0; i < 10; i++) os2.u8(0)
  os2.u32(1 << 0); os2.u32((1 << 20) | (1 << 24)); os2.u32(0); os2.u32(0) // Basic Latin, Hangul Compat Jamo, Hangul Syllables
  os2.tag('JAGK')
  os2.u16(0x0040)
  os2.u16(map.length ? map[0][0] : 0x20); os2.u16(map.length ? map[map.length - 1][0] : 0x20)
  os2.i16(info.typoAscender); os2.i16(info.typoDescender); os2.i16(info.typoLineGap)
  os2.u16(winAsc); os2.u16(winDesc)
  os2.u32((1 << 0) | (1 << 19)); os2.u32(0)
  os2.i16(info.xHeight); os2.i16(info.capHeight); os2.u16(0); os2.u16(32); os2.u16(2)

  const hhea = new W()
  hhea.u32(0x00010000); hhea.i16(info.ascender); hhea.i16(info.descender); hhea.i16(info.lineGap)
  hhea.u16(advMax); hhea.i16(minLsb); hhea.i16(minRsb); hhea.i16(maxExt)
  hhea.i16(1); hhea.i16(0); hhea.i16(0); for (let i = 0; i < 4; i++) hhea.i16(0)
  hhea.i16(0); hhea.u16(n)

  const maxp = new W()
  maxp.u32(0x00010000); maxp.u16(n)
  maxp.u16(Math.max(0, ...pts)); maxp.u16(Math.max(0, ...ctrs)); maxp.u16(maxCompPts); maxp.u16(maxCompCtrs)
  maxp.u16(2); maxp.u16(0); maxp.u16(0); maxp.u16(0); maxp.u16(0); maxp.u16(0); maxp.u16(0)
  maxp.u16(maxCompEl); maxp.u16(maxCompEl ? 1 : 0)

  const now = Math.floor(Date.now() / 1000) + 2082844800
  const head = new W()
  head.u32(0x00010000); head.u32(0x00010000); head.u32(0); head.u32(0x5f0f3cf5)
  head.u16(0x000b); head.u16(1000)
  head.u32(Math.floor(now / 2 ** 32)); head.u32(now >>> 0); head.u32(Math.floor(now / 2 ** 32)); head.u32(now >>> 0)
  head.i16(gxMin); head.i16(gyMin); head.i16(gxMax); head.i16(gyMax)
  head.u16(0); head.u16(8); head.i16(2); head.i16(1); head.i16(0)

  const name = buildName(info)
  const post = new W()
  post.u32(0x00030000); post.u32(0); post.i16(-75); post.i16(50); post.u32(0); post.u32(0); post.u32(0); post.u32(0); post.u32(0)

  const tables: [string, Uint8Array][] = [
    ['OS/2', os2.out()], ['cmap', cmap], ['glyf', glyf.out()], ['head', head.out()], ['hhea', hhea.out()],
    ['hmtx', hmtx.out()], ['loca', locaW.out()], ['maxp', maxp.out()], ['name', name], ['post', post.out()],
  ]
  tables.sort((a, b) => (a[0] < b[0] ? -1 : 1))
  return assemble(tables)
}

function assemble(tables: [string, Uint8Array][]): Uint8Array {
  const num = tables.length
  let es = 0
  while (1 << (es + 1) <= num) es++
  const sr = (1 << es) * 16
  const dir = new W()
  dir.u32(0x00010000); dir.u16(num); dir.u16(sr); dir.u16(es); dir.u16(num * 16 - sr)
  let offset = 12 + num * 16
  const body = new W()
  let headOffset = 0
  for (const [tag, data] of tables) {
    dir.tag(tag); dir.u32(checksum(data)); dir.u32(offset); dir.u32(data.length)
    if (tag === 'head') headOffset = offset
    body.bytes(data); body.pad4()
    offset += Math.ceil(data.length / 4) * 4
  }
  const out = new Uint8Array(dir.len + body.len)
  out.set(dir.out(), 0); out.set(body.out(), dir.len)
  const adj = (0xb1b0afba - checksum(out)) >>> 0
  out[headOffset + 8] = (adj >>> 24) & 0xff; out[headOffset + 9] = (adj >>> 16) & 0xff
  out[headOffset + 10] = (adj >>> 8) & 0xff; out[headOffset + 11] = adj & 0xff
  return out
}

function buildCmap4(map: [number, number][]): Uint8Array {
  interface Seg { start: number; end: number; gids: number[] }
  const segs: Seg[] = []
  for (const [u, g] of map) {
    const last = segs[segs.length - 1]
    if (last && u === last.end + 1) { last.end = u; last.gids.push(g) } else segs.push({ start: u, end: u, gids: [g] })
  }
  segs.push({ start: 0xffff, end: 0xffff, gids: [0] })
  const segCount = segs.length
  const glyphIdArray: number[] = []
  const deltas: number[] = [], ranges: number[] = []
  segs.forEach((s, i) => {
    const consecutive = s.gids.every((g, k) => g - s.start - k === s.gids[0] - s.start)
    if (s.start === 0xffff) { deltas.push(1); ranges.push(0); return }
    if (consecutive) { deltas.push((s.gids[0] - s.start + 0x10000) % 0x10000); ranges.push(0) } else {
      deltas.push(0)
      ranges.push(2 * (segCount - i) + 2 * glyphIdArray.length)
      glyphIdArray.push(...s.gids)
    }
  })
  let es = 0
  while (1 << (es + 1) <= segCount) es++
  const sr = 2 * (1 << es)
  const sub = new W()
  const length = 16 + segCount * 8 + glyphIdArray.length * 2
  sub.u16(4); sub.u16(length); sub.u16(0)
  sub.u16(segCount * 2); sub.u16(sr); sub.u16(es); sub.u16(segCount * 2 - sr)
  segs.forEach((s) => sub.u16(s.end)); sub.u16(0)
  segs.forEach((s) => sub.u16(s.start))
  deltas.forEach((d) => sub.u16(d))
  ranges.forEach((r) => sub.u16(r))
  glyphIdArray.forEach((g) => sub.u16(g))
  const w = new W()
  w.u16(0); w.u16(2)
  w.u16(0); w.u16(3); w.u32(20)
  w.u16(3); w.u16(1); w.u32(20)
  w.bytes(sub.out())
  return w.out()
}

function utf16be(s: string): Uint8Array {
  const out = new Uint8Array(s.length * 2)
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); out[i * 2] = c >> 8; out[i * 2 + 1] = c & 0xff }
  return out
}

function buildName(info: FontInfo): Uint8Array {
  const recs: [number, string][] = [
    [0, info.copyright], [1, info.family], [2, 'Regular'], [3, `${info.version};JAGK;${info.postscript}`],
    [4, info.family], [5, `Version ${info.version}`], [6, info.postscript], [13, info.license],
  ]
  const langs = [0x0409, 0x0412]
  const entries: { lang: number; id: number; data: Uint8Array }[] = []
  for (const lang of langs) for (const [id, s] of recs) entries.push({ lang, id, data: utf16be(s) })
  entries.sort((a, b) => a.lang - b.lang || a.id - b.id)
  const w = new W()
  w.u16(0); w.u16(entries.length); w.u16(6 + entries.length * 12)
  let off = 0
  for (const e of entries) { w.u16(3); w.u16(1); w.u16(e.lang); w.u16(e.id); w.u16(e.data.length); w.u16(off); off += e.data.length }
  for (const e of entries) w.bytes(e.data)
  return w.out()
}

/** 부호 있는 면적 (y 위로 좌표계에서 양수 = 반시계) */
export function signedArea(c: TPoint[]): number {
  let a = 0
  for (let i = 0; i < c.length; i++) { const p = c[i], q = c[(i + 1) % c.length]; a += p.x * q.y - q.x * p.y }
  return a / 2
}
