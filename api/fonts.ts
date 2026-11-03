// 폰트공방 글씨체 갤러리 API (Vercel Function, Vercel Blob 저장소)
//   GET    /api/fonts[?space=코드]     공개된 글씨체 목록 (공간 코드를 주면 그 공간의 글씨체만)
//   POST   /api/fonts                 multipart: name, author, direct, ttf, preview → { font, key }
//   DELETE /api/fonts?id=…&key=…      올린 브라우저의 열쇠 또는 x-admin-token(GALLERY_ADMIN_TOKEN)
//   PATCH  /api/fonts?id=…&key=…      { tags } 태그 고치기 (올린 브라우저의 열쇠 또는 관리자)
//   POST   /api/fonts?like=…&on=1|0   좋아요 (x-voter: 브라우저마다 만든 임의 번호)
// 필요한 환경 변수: BLOB_READ_WRITE_TOKEN (Vercel 대시보드에서 Blob 저장소를 연결하면 자동으로 생김)
import { del, list, put } from '@vercel/blob'

export interface PublicFont { id: string; name: string; author: string; createdAt: number; ttfUrl: string; previewUrl: string; direct: number; sizeKB: number; tags?: string[]; likes?: number; liked?: boolean }
interface Meta extends PublicFont { keyHash: string; spaceHash?: string }

export interface Store {
  put(path: string, body: Blob | string, contentType: string, overwrite?: boolean): Promise<{ url: string }>
  list(prefix: string): Promise<{ pathname: string; url: string; uploadedAt: number }[]>
  read(url: string): Promise<string | null>
  del(urls: string[]): Promise<void>
}

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

function strip(m: Meta): PublicFont {
  const { keyHash: _k, spaceHash: _s, ...pub } = m
  return pub
}
/** 공간 코드 → 저장용 지문 (코드 자체는 저장하지 않는다) */
export async function spaceKey(code: unknown): Promise<string | null> {
  const c = String(code ?? '').trim().toLowerCase()
  if (c.length < 2 || c.length > 30) return null
  return (await sha('space:' + c)).slice(0, 24)
}

async function readMeta(store: Store, id: string): Promise<{ meta: Meta; url: string } | null> {
  const hit = (await store.list(`gallery/meta/${id}.json`)).find((b) => b.pathname === `gallery/meta/${id}.json`)
  if (!hit) return null
  const txt = await store.read(hit.url)
  if (!txt) return null
  try { return { meta: JSON.parse(txt) as Meta, url: hit.url } } catch { return null }
}

export async function handle(req: Request, store: Store | null, env: { GALLERY_ADMIN_TOKEN?: string } = {}): Promise<Response> {
  if (!store) return json({ error: '갤러리 저장소가 아직 연결되지 않았어요.' }, 503)
  const url = new URL(req.url)

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
        if (!meta || (meta.spaceHash ?? null) !== space) return null
        return strip(meta)
      } catch { return null }
    }))).filter((x): x is PublicFont => !!x)
      .map((f) => ({ ...f, tags: f.tags ?? [], likes: likes.get(f.id) ?? 0, liked: mine.has(f.id) }))
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
    const name = clean(fd.get('name'), 24)
    if (!name) return json({ error: '폰트 이름이 필요해요.' }, 400)

    const id = Date.now().toString(36) + hex(crypto.getRandomValues(new Uint8Array(4)).buffer)
    const key = hex(crypto.getRandomValues(new Uint8Array(24)).buffer)
    const [t, p] = await Promise.all([
      store.put(`gallery/fonts/${id}.ttf`, ttf, 'font/ttf'),
      store.put(`gallery/previews/${id}.png`, preview, 'image/png'),
    ])
    const meta: Meta = {
      id, name, author: clean(fd.get('author'), 20), createdAt: Date.now(), ttfUrl: t.url, previewUrl: p.url,
      direct: Math.max(0, Math.min(11172, Number(fd.get('direct')) || 0)), sizeKB: Math.round(ttf.size / 1024), keyHash: await sha(key),
      tags: cleanTags(fd.get('tags')),
      ...(fd.get('space') ? { spaceHash: (await spaceKey(fd.get('space'))) ?? undefined } : {}),
    }
    await store.put(`gallery/meta/${id}.json`, JSON.stringify(meta), 'application/json')
    return json({ font: strip(meta), key }, 201)
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
    const meta: Meta = { ...found.meta, tags: cleanTags(body.tags) }
    await store.put(`gallery/meta/${id}.json`, JSON.stringify(meta), 'application/json', true)
    return json({ font: strip(meta) })
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
    await store.del([found.url, found.meta.ttfUrl, found.meta.previewUrl, ...likes].filter(Boolean))
    return json({ ok: true })
  }

  return json({ error: '지원하지 않는 요청이에요.' }, 405)
}

function blobStore(): Store | null {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null
  return {
    put: async (path, body, contentType, overwrite) => {
      const r = await put(path, body, { access: 'public', contentType, addRandomSuffix: false, cacheControlMaxAge: 60, allowOverwrite: !!overwrite })
      return { url: r.url }
    },
    list: async (prefix) => {
      const out: { pathname: string; url: string; uploadedAt: number }[] = []
      let cursor: string | undefined
      do {
        const r = await list({ prefix, cursor, limit: 1000 })
        for (const b of r.blobs) out.push({ pathname: b.pathname, url: b.url, uploadedAt: new Date(b.uploadedAt).getTime() })
        cursor = r.hasMore ? r.cursor : undefined
      } while (cursor && out.length < 5000)
      return out
    },
    read: async (u) => { const r = await fetch(u, { cache: 'no-store' }); return r.ok ? r.text() : null },
    del: async (urls) => { if (urls.length) await del(urls) },
  }
}

const run = (req: Request) => handle(req, blobStore(), { GALLERY_ADMIN_TOKEN: process.env.GALLERY_ADMIN_TOKEN }).catch(() => json({ error: '잠시 뒤 다시 시도해 주세요.' }, 500))
export const GET = run
export const POST = run
export const DELETE = run
export const PATCH = run

/** 테스트용 메모리 저장소 */
export function memoryStore(): Store & { files: Map<string, { body: Blob | string; type: string; at: number }> } {
  const files = new Map<string, { body: Blob | string; type: string; at: number }>()
  let tick = 0
  const u = (p: string) => `mem://${p}`
  return {
    files,
    put: async (p, body, type) => { files.set(p, { body, type, at: ++tick }); return { url: u(p) } },
    list: async (prefix) => [...files.entries()].filter(([p]) => p.startsWith(prefix)).map(([p, f]) => ({ pathname: p, url: u(p), uploadedAt: f.at })),
    read: async (url) => { const f = files.get(url.slice(6)); return f ? (typeof f.body === 'string' ? f.body : await f.body.text()) : null },
    del: async (urls) => { for (const x of urls) files.delete(x.slice(6)) },
  }
}
