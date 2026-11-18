// 폰트공방 글씨체 갤러리 API (Vercel Function, Vercel Blob 저장소)
//   GET    /api/fonts[?space=코드]     공개된 글씨체 목록 (공간 코드를 주면 그 공간의 글씨체만)
//   POST   /api/fonts                 multipart: direct, ttf, preview, tags, space → { font, key }
//                                      (개인정보 보호: 글씨체 이름·만든 사람은 받지도 저장하지도 않는다.
//                                       폰트 파일 속 이름도 '폰트공방 번호'로 바꿔 저장·전달한다)
//   DELETE /api/fonts?id=…&key=…      올린 브라우저의 열쇠 또는 x-admin-token(GALLERY_ADMIN_TOKEN)
//   PATCH  /api/fonts?id=…&key=…      { tags } 태그 고치기 (올린 브라우저의 열쇠 또는 관리자)
//   POST   /api/fonts?like=…&on=1|0   좋아요 (x-voter: 브라우저마다 만든 임의 번호)
//   GET    /api/fonts?health=1        저장소가 연결됐는지 (연결 안 됨: 503)
//   GET    /api/fonts?file=gallery/…  비공개(private) 저장소일 때 폰트·견본 파일을 대신 내려준다
// 저장소: Vercel 대시보드 › 프로젝트 › Storage에서 Blob 저장소를 연결하면 BLOB_READ_WRITE_TOKEN
// 또는 BLOB_STORE_ID(+ 자동 OIDC 인증)가 생긴다. 공개·비공개 저장소 모두 쓸 수 있다.
import { del, get, list, put } from '@vercel/blob'

/** 갤러리에 보이는 정보. 이름 대신 번호(no)만 쓴다 */
export interface PublicFont { id: string; no: string; name: string; author: ''; createdAt: number; ttfUrl: string; previewUrl: string; direct: number; sizeKB: number; tags?: string[]; likes?: number; liked?: boolean }
/** 저장하는 정보 (예전 기록에는 name·author가 남아 있을 수 있지만 밖으로 내보내지 않는다) */
interface Meta { id: string; createdAt: number; ttfUrl: string; previewUrl: string; direct: number; sizeKB: number; tags?: string[]; keyHash: string; spaceHash?: string; name?: string; author?: string }

export interface Store {
  put(path: string, body: Blob | string, contentType: string, overwrite?: boolean): Promise<{ url: string }>
  list(prefix: string): Promise<{ pathname: string; url: string; uploadedAt: number }[]>
  read(url: string): Promise<string | null>
  /** 주소 또는 경로(pathname)로 지운다 */
  del(urls: string[]): Promise<void>
  /** 비공개 저장소: 파일 주소로 바로 열 수 없어 /api/fonts?file= 로 대신 내려준다 */
  readonly private?: boolean
  readFile?(path: string): Promise<{ body: ReadableStream<Uint8Array> | Blob; type: string } | null>
}
const FILE_RE = /^gallery\/(fonts\/[a-z0-9]{8,32}\.ttf|previews\/[a-z0-9]{8,32}\.png)$/
const ttfPath = (id: string) => `gallery/fonts/${id}.ttf`
const pngPath = (id: string) => `gallery/previews/${id}.png`
// n=2: 폰트 속 이름을 가린 뒤의 주소 (예전에 받아 둔 캐시와 섞이지 않게)
const viaApi = (path: string) => `/api/fonts?file=${encodeURIComponent(path)}&n=2`
/** 글씨체 번호: id 끝 4자리 (예: A3F2) */
export const fontNo = (id: string) => id.slice(-4).toUpperCase()
export const galleryFamily = (id: string) => `폰트공방 ${fontNo(id)}`

const MAX_TTF = 3 * 1024 * 1024
const MAX_PNG = 800 * 1024
const MAX_LIST = 200
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})
const clean = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n)
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const sha = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
const isId = (s: string) => /^[a-z0-9]{8,32}$/.test(s)
/** 태그: 최대 3개, 각 10자 */
export function cleanTags(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(',')
  return [...new Set(arr.map((t) => clean(t, 10)).filter(Boolean))].slice(0, 3)
}
const voterOf = async (req: Request) => {
  const v = req.headers.get('x-voter') || ''
  return /^[A-Za-z0-9_-]{16,64}$/.test(v) ? (await sha('voter:' + v)).slice(0, 32) : null
}

/** 밖으로 내보낼 항목만 골라 담는다 (이름·만든 사람·열쇠 지문은 빠진다) */
function strip(m: Meta, isPrivate: boolean): PublicFont {
  return {
    // author: 앱에 저장된 예전 화면이 이 칸을 읽어서 늘 빈 값으로 둔다
    id: m.id, no: fontNo(m.id), name: galleryFamily(m.id), author: '', createdAt: m.createdAt,
    // 폰트 파일은 늘 API를 거쳐 내려준다: 예전에 올라온 파일도 속 이름을 가려서 준다
    ttfUrl: viaApi(ttfPath(m.id)), previewUrl: isPrivate ? viaApi(pngPath(m.id)) : m.previewUrl,
    direct: m.direct, sizeKB: m.sizeKB, tags: m.tags ?? [],
  }
}

// ── 폰트 파일 속 이름 바꾸기 (name 표만 새로 쓰고 나머지 표는 그대로) ─────────────
const be16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
function sum32(b: Uint8Array): number {
  let s = 0
  for (let i = 0; i < b.length; i += 4) s = (s + (((b[i] << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0)) >>> 0
  return s
}
function nameTable(recs: [number, string][]): Uint8Array {
  const enc = (s: string) => { const o = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); o[i * 2] = c >> 8; o[i * 2 + 1] = c & 0xff } return o }
  const entries: { lang: number; id: number; data: Uint8Array }[] = []
  for (const lang of [0x0409, 0x0412]) for (const [id, s] of recs) entries.push({ lang, id, data: enc(s) })
  const head = 6 + entries.length * 12
  const out = new Uint8Array(head + entries.reduce((n, e) => n + e.data.length, 0))
  const dv = new DataView(out.buffer)
  dv.setUint16(0, 0); dv.setUint16(2, entries.length); dv.setUint16(4, head)
  let off = 0
  entries.forEach((e, i) => {
    const p = 6 + i * 12
    dv.setUint16(p, 3); dv.setUint16(p + 2, 1); dv.setUint16(p + 4, e.lang); dv.setUint16(p + 6, e.id); dv.setUint16(p + 8, e.data.length); dv.setUint16(p + 10, off)
    out.set(e.data, head + off); off += e.data.length
  })
  return out
}
/** TTF 속 글꼴 이름·저작권 문구를 갤러리 번호 이름으로 바꾼다. 읽을 수 없는 파일이면 그대로 돌려준다 */
export function anonymizeTtf(src: Uint8Array, id: string): Uint8Array {
  try {
    if (src.length < 12 || be32(src, 0) !== 0x00010000) return src
    const num = be16(src, 4)
    if (12 + num * 16 > src.length) return src
    const tables: { tag: string; data: Uint8Array }[] = []
    for (let i = 0; i < num; i++) {
      const p = 12 + i * 16
      const tag = String.fromCharCode(src[p], src[p + 1], src[p + 2], src[p + 3])
      const off = be32(src, p + 8), len = be32(src, p + 12)
      if (off + len > src.length) return src
      tables.push({ tag, data: src.slice(off, off + len) })
    }
    const fam = galleryFamily(id), ps = `FontGongbang-${fontNo(id)}`
    const name = nameTable([
      [0, '© 폰트공방 갤러리'], [1, fam], [2, 'Regular'], [3, `1.000;JAGK;${ps}`], [4, fam], [5, 'Version 1.000'], [6, ps],
      [13, '이 폰트는 글씨를 쓴 사람의 것입니다. 폰트공방 갤러리에서 받았습니다.'],
    ])
    const rest = tables.filter((t) => t.tag !== 'name')
    rest.push({ tag: 'name', data: name })
    rest.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
    const n = rest.length
    let es = 0
    while (1 << (es + 1) <= n) es++
    const sr = (1 << es) * 16
    const total = 12 + n * 16 + rest.reduce((s, t) => s + Math.ceil(t.data.length / 4) * 4, 0)
    const out = new Uint8Array(total)
    const dv = new DataView(out.buffer)
    dv.setUint32(0, 0x00010000); dv.setUint16(4, n); dv.setUint16(6, sr); dv.setUint16(8, es); dv.setUint16(10, n * 16 - sr)
    let off = 12 + n * 16, headOff = -1
    rest.forEach((t, i) => {
      if (t.tag === 'head') { if (t.data.length < 12) throw new Error('head'); t.data[8] = t.data[9] = t.data[10] = t.data[11] = 0 }
      const p = 12 + i * 16
      for (let k = 0; k < 4; k++) out[p + k] = t.tag.charCodeAt(k)
      dv.setUint32(p + 4, sum32(t.data)); dv.setUint32(p + 8, off); dv.setUint32(p + 12, t.data.length)
      out.set(t.data, off)
      if (t.tag === 'head') headOff = off
      off += Math.ceil(t.data.length / 4) * 4
    })
    if (headOff >= 0) dv.setUint32(headOff + 8, (0xb1b0afba - sum32(out)) >>> 0)
    return out
  } catch { return src }
}
/** 공간 코드 → 저장용 지문 (코드 자체는 저장하지 않는다) */
export async function spaceKey(code: unknown): Promise<string | null> {
  const c = String(code ?? '').trim().toLowerCase()
  if (c.length < 2 || c.length > 30) return null
  return (await sha('space:' + c)).slice(0, 24)
}

/** 예전에 이름·만든 사람과 함께 올라온 글씨체: 기록과 폰트 파일 속 이름을 한 번 지워 둔다 */
async function scrub(store: Store, meta: Meta) {
  if (store.readFile) {
    const f = await store.readFile(ttfPath(meta.id))
    if (f) {
      const raw = new Uint8Array(await new Response(f.body).arrayBuffer())
      const out = anonymizeTtf(raw, meta.id)
      if (out !== raw) await store.put(ttfPath(meta.id), new Blob([out as BlobPart], { type: 'font/ttf' }), 'font/ttf', true)
    }
  }
  const { name: _n, author: _a, ...kept } = meta
  await store.put(`gallery/meta/${meta.id}.json`, JSON.stringify(kept), 'application/json', true)
}

async function readMeta(store: Store, id: string): Promise<{ meta: Meta; url: string } | null> {
  const hit = (await store.list(`gallery/meta/${id}.json`)).find((b) => b.pathname === `gallery/meta/${id}.json`)
  if (!hit) return null
  const txt = await store.read(hit.url)
  if (!txt) return null
  try { return { meta: JSON.parse(txt) as Meta, url: hit.url } } catch { return null }
}

export async function handle(req: Request, store: Store | null, env: { GALLERY_ADMIN_TOKEN?: string } = {}): Promise<Response> {
  if (!store) return json({ error: '갤러리 저장소가 아직 연결되지 않았어요.', setup: true }, 503)
  const url = new URL(req.url)

  if (req.method === 'GET' && url.searchParams.has('health')) return json({ ok: true, private: !!store.private })

  if (req.method === 'GET' && url.searchParams.has('file')) {
    const path = url.searchParams.get('file') || ''
    if (!FILE_RE.test(path) || !store.readFile) return json({ error: '잘못된 요청이에요.' }, 400)
    const f = await store.readFile(path)
    if (!f) return json({ error: '파일이 없어요.' }, 404)
    if (path.endsWith('.ttf')) {
      const id = path.slice('gallery/fonts/'.length, -4)
      const raw = new Uint8Array(await new Response(f.body).arrayBuffer())
      const ttf = anonymizeTtf(raw, id)
      return new Response(ttf as BodyInit, { headers: { 'content-type': 'font/ttf', 'cache-control': 'public, max-age=86400', 'content-disposition': `attachment; filename="FontGongbang-${fontNo(id)}.ttf"` } })
    }
    return new Response(f.body, { headers: { 'content-type': f.type, 'cache-control': 'public, max-age=86400' } })
  }

  if (req.method === 'GET') {
    const metas = (await store.list('gallery/meta/')).sort((a, b) => b.uploadedAt - a.uploadedAt).slice(0, MAX_LIST)
    const voter = await voterOf(req)
    const likes = new Map<string, number>(), mine = new Set<string>()
    for (const b of await store.list('gallery/likes/')) {
      const [, , fid, who] = b.pathname.split('/')
      if (!fid) continue
      likes.set(fid, (likes.get(fid) ?? 0) + 1)
      if (voter && who === `${voter}.txt`) mine.add(fid)
    }
    const space = url.searchParams.has('space') ? await spaceKey(url.searchParams.get('space')) : null
    if (url.searchParams.has('space') && !space) return json({ error: '공간 코드는 2–30자예요.' }, 400)
    const fonts = (await Promise.all(metas.map(async (m) => {
      const t = await store.read(m.url)
      try {
        const meta = t ? JSON.parse(t) as Meta : null
        if (!meta || !isId(meta.id)) return null
        if (meta.name !== undefined || meta.author !== undefined) await scrub(store, meta).catch(() => {})
        if ((meta.spaceHash ?? null) !== space) return null
        return strip(meta, !!store.private)
      } catch { return null }
    }))).filter((x): x is PublicFont => !!x)
      .map((f) => ({ ...f, likes: likes.get(f.id) ?? 0, liked: mine.has(f.id) }))
      .sort((a, b) => b.createdAt - a.createdAt)
    return json({ fonts })
  }

  if (req.method === 'POST' && url.searchParams.has('like')) {
    const id = url.searchParams.get('like') || ''
    if (!isId(id)) return json({ error: '잘못된 요청이에요.' }, 400)
    const voter = await voterOf(req)
    if (!voter) return json({ error: '잘못된 요청이에요.' }, 400)
    if (!(await readMeta(store, id))) return json({ error: '이미 없는 글씨체예요.' }, 404)
    const path = `gallery/likes/${id}/${voter}.txt`
    const on = url.searchParams.get('on') !== '0'
    const hit = (await store.list(path)).find((b) => b.pathname === path)
    if (on && !hit) await store.put(path, '1', 'text/plain')
    if (!on && hit) await store.del([hit.url])
    const count = (await store.list(`gallery/likes/${id}/`)).length
    return json({ likes: count, liked: on })
  }

  if (req.method === 'POST') {
    const len = Number(req.headers.get('content-length') || 0)
    if (len > MAX_TTF + MAX_PNG + 64 * 1024) return json({ error: '파일이 너무 커요.' }, 413)
    let fd: FormData
    try { fd = await req.formData() } catch { return json({ error: '보낸 내용을 읽지 못했어요.' }, 400) }
    const ttf = fd.get('ttf'), preview = fd.get('preview')
    if (!(ttf instanceof Blob) || !(preview instanceof Blob)) return json({ error: '폰트 파일과 견본이 필요해요.' }, 400)
    if (ttf.size > MAX_TTF || preview.size > MAX_PNG) return json({ error: '파일이 너무 커요.' }, 413)
    const head = new Uint8Array(await ttf.slice(0, 4).arrayBuffer())
    if (!(head[0] === 0 && head[1] === 1 && head[2] === 0 && head[3] === 0)) return json({ error: 'TTF 파일이 아니에요.' }, 400)
    const ph = new Uint8Array(await preview.slice(0, 8).arrayBuffer())
    if (!(ph[0] === 0x89 && ph[1] === 0x50 && ph[2] === 0x4e && ph[3] === 0x47)) return json({ error: '견본 그림이 PNG가 아니에요.' }, 400)
    // 이름·만든 사람(name, author)은 예전 화면이 보내더라도 저장하지 않는다

    const id = Date.now().toString(36) + hex(crypto.getRandomValues(new Uint8Array(4)).buffer)
    const key = hex(crypto.getRandomValues(new Uint8Array(24)).buffer)
    const cleanTtf = anonymizeTtf(new Uint8Array(await ttf.arrayBuffer()), id)
    const [t, p] = await Promise.all([
      store.put(ttfPath(id), new Blob([cleanTtf as BlobPart], { type: 'font/ttf' }), 'font/ttf'),
      store.put(pngPath(id), preview, 'image/png'),
    ])
    const meta: Meta = {
      id, createdAt: Date.now(), ttfUrl: store.private ? viaApi(ttfPath(id)) : t.url, previewUrl: store.private ? viaApi(pngPath(id)) : p.url,
      direct: Math.max(0, Math.min(11172, Number(fd.get('direct')) || 0)), sizeKB: Math.round(cleanTtf.length / 1024), keyHash: await sha(key),
      tags: cleanTags(fd.get('tags')),
      ...(fd.get('space') ? { spaceHash: (await spaceKey(fd.get('space'))) ?? undefined } : {}),
    }
    await store.put(`gallery/meta/${id}.json`, JSON.stringify(meta), 'application/json')
    return json({ font: strip(meta, !!store.private), key }, 201)
  }

  if (req.method === 'PATCH') {
    const id = url.searchParams.get('id') || ''
    if (!isId(id)) return json({ error: '잘못된 요청이에요.' }, 400)
    const found = await readMeta(store, id)
    if (!found) return json({ error: '이미 없는 글씨체예요.' }, 404)
    const admin = env.GALLERY_ADMIN_TOKEN && req.headers.get('x-admin-token') === env.GALLERY_ADMIN_TOKEN
    const key = url.searchParams.get('key') || ''
    if (!admin && (!key || (await sha(key)) !== found.meta.keyHash)) return json({ error: '이 글씨체를 고칠 권한이 없어요.' }, 403)
    const body = await req.json().catch(() => ({})) as { tags?: unknown }
    // 고칠 때 예전 기록에 남아 있던 이름·만든 사람도 지운다
    const { name: _n, author: _a, ...kept } = found.meta
    const meta: Meta = { ...kept, tags: cleanTags(body.tags) }
    await store.put(`gallery/meta/${id}.json`, JSON.stringify(meta), 'application/json', true)
    return json({ font: strip(meta, !!store.private) })
  }

  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id') || ''
    if (!isId(id)) return json({ error: '잘못된 요청이에요.' }, 400)
    const found = await readMeta(store, id)
    if (!found) return json({ error: '이미 없는 글씨체예요.' }, 404)
    const admin = env.GALLERY_ADMIN_TOKEN && req.headers.get('x-admin-token') === env.GALLERY_ADMIN_TOKEN
    const key = url.searchParams.get('key') || ''
    if (!admin && (!key || (await sha(key)) !== found.meta.keyHash)) return json({ error: '이 글씨체를 내릴 권한이 없어요.' }, 403)
    const likes = (await store.list(`gallery/likes/${id}/`)).map((b) => b.url)
    await store.del([found.url, ttfPath(id), pngPath(id), ...likes])
    return json({ ok: true })
  }

  return json({ error: '지원하지 않는 요청이에요.' }, 405)
}

function blobStore(): Store | null {
  // 예전 방식(읽기·쓰기 토큰)과 새 방식(BLOB_STORE_ID + 자동 OIDC 인증) 모두 받는다
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return null
  let access: 'public' | 'private' = process.env.BLOB_ACCESS === 'private' ? 'private' : 'public'
  // 공개로 시도해 보고, 거절되면 비공개로 한 번 더 해 본다 (저장소 종류마다 오류 문구가 달라서 문구로 가르지 않는다)
  const both = async <T>(fn: (a: 'public' | 'private') => Promise<T>): Promise<T> => {
    try { return await fn(access) } catch (e) {
      if (access === 'private') throw e
      try {
        const r = await fn('private')
        access = 'private'
        return r
      } catch { throw e }
    }
  }
  const fetchBlob = (u: string) => both(async (a) => {
    const r = await get(u, { access: a, useCache: false })
    if (r && r.statusCode !== 200 && a === 'public') throw new Error('access')
    return r && r.statusCode === 200 ? r : null
  })
  return {
    get private() { return access === 'private' },
    put: (path, body, contentType, overwrite) => both(async (a) => {
      const r = await put(path, body, { access: a, contentType, addRandomSuffix: false, cacheControlMaxAge: 60, allowOverwrite: !!overwrite })
      return { url: r.url }
    }),
    list: async (prefix) => {
      const out: { pathname: string; url: string; uploadedAt: number }[] = []
      let cursor: string | undefined
      do {
        const r = await list({ prefix, cursor, limit: 1000 })
        for (const b of r.blobs) if (/\.private\./.test(b.url)) access = 'private'
        for (const b of r.blobs) out.push({ pathname: b.pathname, url: b.url, uploadedAt: new Date(b.uploadedAt).getTime() })
        cursor = r.hasMore ? r.cursor : undefined
      } while (cursor && out.length < 5000)
      return out
    },
    read: async (u) => {
      const r = await fetchBlob(u).catch(() => null)
      return r ? new Response(r.stream).text() : null
    },
    readFile: async (path) => {
      const r = await fetchBlob(path).catch(() => null)
      return r ? { body: r.stream, type: r.blob.contentType || 'application/octet-stream' } : null
    },
    del: async (urls) => { if (urls.length) await del(urls) },
  }
}

const run = (req: Request) => handle(req, blobStore(), { GALLERY_ADMIN_TOKEN: process.env.GALLERY_ADMIN_TOKEN }).catch((e) => {
  console.error('[fonts api]', req.method, e) // Vercel 로그에서 원인을 볼 수 있게
  return json({ error: '잠시 뒤 다시 시도해 주세요.', detail: String((e as Error)?.message ?? e).slice(0, 200) }, 500)
})
export const GET = run
export const POST = run
export const DELETE = run
export const PATCH = run

/** 테스트용 메모리 저장소 */
export function memoryStore(opts: { private?: boolean } = {}): Store & { files: Map<string, { body: Blob | string; type: string; at: number }> } {
  const files = new Map<string, { body: Blob | string; type: string; at: number }>()
  let tick = 0
  const u = (p: string) => `mem://${p}`
  const key = (x: string) => (x.startsWith('mem://') ? x.slice(6) : x)
  return {
    files,
    private: !!opts.private,
    readFile: async (path) => { const f = files.get(path); return f ? { body: typeof f.body === 'string' ? new Blob([f.body]) : f.body, type: f.type } : null },
    put: async (p, body, type) => { files.set(p, { body, type, at: ++tick }); return { url: u(p) } },
    list: async (prefix) => [...files.entries()].filter(([p]) => p.startsWith(prefix)).map(([p, f]) => ({ pathname: p, url: u(p), uploadedAt: f.at })),
    read: async (url) => { const f = files.get(url.slice(6)); return f ? (typeof f.body === 'string' ? f.body : await f.body.text()) : null },
    del: async (urls) => { for (const x of urls) files.delete(key(x)) },
  }
}
