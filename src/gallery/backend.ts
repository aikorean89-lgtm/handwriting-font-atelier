// 글씨체 갤러리 저장소. claude.ai 미리보기에서는 페이지 데이터베이스·파일 저장소를,
// 배포한 사이트(Vercel)에서는 /api/fonts 를 쓴다.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { inPreviewFrame } from '../platform'

export interface GalleryFont {
  id: string
  name: string
  author: string
  createdAt: number
  ttfUrl: string
  previewUrl: string
  direct: number // 직접 쓴 한글 수
  sizeKB: number
  mine: boolean
  tags: string[]
  likes: number
  liked: boolean
}
export interface PublishInput { name: string; author: string; ttf: Blob; preview: Blob; direct: number; tags?: string[] }

export interface GalleryBackend {
  kind: 'artifact' | 'http'
  list(): Promise<GalleryFont[]>
  publish(p: PublishInput): Promise<GalleryFont>
  remove(id: string): Promise<void>
  /** 좋아요 켜기·끄기 → 새 좋아요 수 */
  like(id: string, on: boolean): Promise<number>
  /** 내가 올린 글씨체의 태그 고치기 */
  setTags(id: string, tags: string[]): Promise<void>
  /** 다른 사람 글씨체도 내릴 수 있는지 (관리자) */
  canModerate(): Promise<boolean>
  /** 이 화면에서 올릴 수 있는지 (null = 알 수 없음) */
  canPublish(): Promise<boolean | null>
}

export class GalleryError extends Error {}

const MAX_MINE = 6
const clean = (s: string, n: number) => s.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n)
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
const cleanTags = (t: unknown): string[] => [...new Set((Array.isArray(t) ? t : []).map((x) => clean(String(x), 10)).filter(Boolean))].slice(0, 3)

// ── claude.ai 미리보기 ──────────────────────────────────────────────
// gallery/<사용자 id> 문서 하나에 그 사람이 올린 글씨체 목록을 둔다.
// 규칙: gallery 는 누구나 읽고 주인만 고치며, gallery/{self} 는 본인이 쓴다.
// 좋아요는 likes/<사용자 id> 문서에 그 사람이 누른 글씨체 id 목록으로 둔다 (likes/{self} 는 본인이 쓴다).
interface StoredFont { id: string; name: string; author: string; createdAt: number; ttf: string; preview: string; direct: number; sizeKB: number; tags?: string[] }

class ArtifactBackend implements GalleryBackend {
  kind = 'artifact' as const
  private ready: Promise<{ db: any; user: any; assets: any; uid: string | null }>
  constructor() {
    const cap = (n: string) => (window as any).claude.use(n) as Promise<any>
    this.ready = Promise.all([cap('db'), cap('user'), cap('assets')]).then(async ([db, user, assets]) => ({
      db, user, assets, uid: user ? await user.id().catch(() => null) : null,
    }))
  }
  async list() {
    const { db, uid } = await this.ready
    if (!db) throw new GalleryError('로그인한 사람만 갤러리를 볼 수 있어요.')
    const snap = await db.collection('gallery').limit(500).get()
    const likes = new Map<string, number>()
    let mineLiked = new Set<string>()
    try {
      const ls = await db.collection('likes').limit(2000).get()
      for (const d of ls.docs) {
        const ids = (d.data()?.ids ?? []) as string[]
        for (const id of new Set(ids)) likes.set(id, (likes.get(id) ?? 0) + 1)
        if (d.id === uid) mineLiked = new Set(ids)
      }
    } catch { /* 좋아요를 못 읽어도 목록은 보여 준다 */ }
    const out: GalleryFont[] = []
    for (const d of snap.docs) {
      const fonts = (d.data()?.fonts ?? []) as StoredFont[]
      for (const f of fonts) {
        if (!f?.ttf || !f.id) continue
        out.push({
          id: `${d.id}/${f.id}`, name: String(f.name ?? ''), author: String(f.author ?? ''), createdAt: Number(f.createdAt) || 0,
          ttfUrl: `/_blob/${f.ttf}`, previewUrl: f.preview ? `/_blob/${f.preview}` : '', direct: Number(f.direct) || 0,
          sizeKB: Number(f.sizeKB) || 0, mine: d.id === uid, tags: cleanTags(f.tags),
          likes: likes.get(`${d.id}/${f.id}`) ?? 0, liked: mineLiked.has(`${d.id}/${f.id}`),
        })
      }
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  }
  async publish(p: PublishInput) {
    const { db, assets, uid } = await this.ready
    if (!db || !uid) throw new GalleryError('로그인해야 갤러리에 올릴 수 있어요.')
    if (!assets) throw new GalleryError('이 화면에서는 갤러리에 파일을 올릴 수 없어요.')
    const ref = db.doc(`gallery/${uid}`)
    const cur = ((await ref.get()).data()?.fonts ?? []) as StoredFont[]
    let ttf, preview
    try {
      ttf = await assets.upload(new Blob([p.ttf], { type: 'font/ttf' }), { type: 'font/ttf' })
      preview = await assets.upload(p.preview, { type: 'image/png' })
    } catch (e: any) {
      if (e?.code === 'too_large') throw new GalleryError('파일이 너무 커서 올리지 못했어요.')
      if (e?.code === 'not_granted') throw new GalleryError('파일 올리기를 허용하지 않았어요.')
      throw new GalleryError('파일을 올리지 못했어요. 잠시 뒤 다시 해 주세요.')
    }
    const f: StoredFont = {
      id: newId(), name: clean(p.name, 24), author: clean(p.author, 20), createdAt: Date.now(),
      ttf: ttf.id, preview: preview.id, direct: p.direct, sizeKB: Math.round(p.ttf.size / 1024), tags: cleanTags(p.tags),
    }
    // 같은 이름은 새 것으로 바꾸고, 한 사람당 최근 몇 개만 둔다
    const rest = cur.filter((x) => x.name !== f.name)
    const dropped = [...cur.filter((x) => x.name === f.name), ...rest.slice(MAX_MINE - 1)]
    try { await ref.set({ fonts: [f, ...rest.slice(0, MAX_MINE - 1)], updatedAt: Date.now() }) } catch {
      throw new GalleryError('갤러리에 기록하지 못했어요. 이 페이지에서 쓰기 권한이 있는지 확인해 주세요.')
    }
    for (const x of dropped) { assets.delete(x.ttf).catch(() => {}); if (x.preview) assets.delete(x.preview).catch(() => {}) }
    return { id: `${uid}/${f.id}`, name: f.name, author: f.author, createdAt: f.createdAt, ttfUrl: ttf.url, previewUrl: preview.url, direct: f.direct, sizeKB: f.sizeKB, mine: true, tags: f.tags ?? [], likes: 0, liked: false }
  }
  async like(id: string, on: boolean) {
    const { db, uid } = await this.ready
    if (!db || !uid) throw new GalleryError('로그인해야 좋아요를 누를 수 있어요.')
    const ref = db.doc(`likes/${uid}`)
    const cur = new Set(((await ref.get()).data()?.ids ?? []) as string[])
    if (on) cur.add(id); else cur.delete(id)
    try { await ref.set({ ids: [...cur].slice(-500), updatedAt: Date.now() }) } catch { throw new GalleryError('좋아요를 기록하지 못했어요.') }
    const all = await db.collection('likes').limit(2000).get()
    let n = 0
    for (const d of all.docs) if (((d.data()?.ids ?? []) as string[]).includes(id)) n++
    return n
  }
  async setTags(id: string, tags: string[]) {
    const { db, uid } = await this.ready
    const [owner, fid] = id.split('/')
    if (!db || owner !== uid) throw new GalleryError('내가 올린 글씨체만 고칠 수 있어요.')
    const ref = db.doc(`gallery/${uid}`)
    const cur = ((await ref.get()).data()?.fonts ?? []) as StoredFont[]
    try { await ref.set({ fonts: cur.map((x) => (x.id === fid ? { ...x, tags: cleanTags(tags) } : x)), updatedAt: Date.now() }) } catch {
      throw new GalleryError('태그를 고치지 못했어요.')
    }
  }
  async remove(id: string) {
    const { db, assets } = await this.ready
    const [owner, fid] = id.split('/')
    const ref = db.doc(`gallery/${owner}`)
    const cur = ((await ref.get()).data()?.fonts ?? []) as StoredFont[]
    const gone = cur.find((x) => x.id === fid)
    try { await ref.set({ fonts: cur.filter((x) => x.id !== fid), updatedAt: Date.now() }) } catch {
      throw new GalleryError('내리지 못했어요. 내가 올린 글씨체만 내릴 수 있어요.')
    }
    if (gone && assets) { assets.delete(gone.ttf).catch(() => {}); if (gone.preview) assets.delete(gone.preview).catch(() => {}) }
  }
  async canModerate() { const { user } = await this.ready; return user ? await user.isOwner().catch(() => false) : false }
  async canPublish() {
    const { db, uid, assets } = await this.ready
    return !!(db && uid && assets)
  }
}

// ── 배포한 사이트 (/api/fonts) ──────────────────────────────────────
// 계정이 없으니, 올릴 때 받은 삭제 열쇠를 이 브라우저에 보관해 내 글씨체를 알아본다.
const KEYS = 'fontgongbang.gallery.keys'
function myKeys(): Record<string, string> { try { return JSON.parse(localStorage.getItem(KEYS) || '{}') } catch { return {} } }
function setMyKeys(k: Record<string, string>) { try { localStorage.setItem(KEYS, JSON.stringify(k)) } catch { /* 저장 불가 */ } }
function adminToken(): string | null { try { return localStorage.getItem('fontgongbang.admin') } catch { return null } }
/** 좋아요를 한 사람이 한 번만 누르도록 브라우저마다 만든 임의 번호 */
function voter(): string {
  try {
    let v = localStorage.getItem('fontgongbang.voter')
    if (!v) { v = (crypto.randomUUID?.() ?? newId() + newId()).replace(/[^A-Za-z0-9]/g, ''); localStorage.setItem('fontgongbang.voter', v) }
    return v
  } catch { return 'anon' + newId() + newId() }
}

class HttpBackend implements GalleryBackend {
  kind = 'http' as const
  private base = `${import.meta.env.BASE_URL}api/fonts`.replace('./', '/')
  async list() {
    const r = await fetch(this.base, { headers: { accept: 'application/json', 'x-voter': voter() }, cache: 'no-store' }).catch(() => null)
    if (!r || !r.ok) throw new GalleryError(r?.status === 503 ? '갤러리 저장소가 아직 연결되지 않았어요.' : '갤러리를 불러오지 못했어요.')
    const body = await r.json().catch(() => null)
    if (!body || !Array.isArray(body.fonts)) throw new GalleryError('갤러리를 불러오지 못했어요.')
    const keys = myKeys()
    return (body.fonts as Omit<GalleryFont, 'mine'>[]).map((f) => ({ ...f, tags: f.tags ?? [], likes: f.likes ?? 0, liked: !!f.liked, mine: !!keys[f.id] }))
  }
  async publish(p: PublishInput) {
    const fd = new FormData()
    fd.set('name', clean(p.name, 24)); fd.set('author', clean(p.author, 20)); fd.set('direct', String(p.direct))
    fd.set('ttf', p.ttf, 'font.ttf'); fd.set('preview', p.preview, 'preview.png'); fd.set('tags', cleanTags(p.tags).join(','))
    const r = await fetch(this.base, { method: 'POST', body: fd }).catch(() => null)
    if (!r) throw new GalleryError('인터넷 연결을 확인해 주세요.')
    const body = await r.json().catch(() => ({}))
    if (!r.ok) throw new GalleryError(body.error || '갤러리에 올리지 못했어요.')
    setMyKeys({ ...myKeys(), [body.font.id]: body.key })
    return { ...body.font, tags: body.font.tags ?? [], likes: 0, liked: false, mine: true }
  }
  async like(id: string, on: boolean) {
    const r = await fetch(`${this.base}?like=${encodeURIComponent(id)}&on=${on ? 1 : 0}`, { method: 'POST', headers: { 'x-voter': voter() } }).catch(() => null)
    const body = r ? await r.json().catch(() => ({})) : {}
    if (!r || !r.ok) throw new GalleryError(body.error || '좋아요를 기록하지 못했어요.')
    return Number(body.likes) || 0
  }
  async setTags(id: string, tags: string[]) {
    const key = myKeys()[id]
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    const admin = adminToken()
    if (admin) headers['x-admin-token'] = admin
    const r = await fetch(`${this.base}?id=${encodeURIComponent(id)}${key ? `&key=${encodeURIComponent(key)}` : ''}`, { method: 'PATCH', headers, body: JSON.stringify({ tags: cleanTags(tags) }) }).catch(() => null)
    if (!r || !r.ok) throw new GalleryError('태그를 고치지 못했어요. 이 브라우저에서 올린 글씨체만 고칠 수 있어요.')
  }
  async remove(id: string) {
    const key = myKeys()[id]
    const headers: Record<string, string> = {}
    const admin = adminToken()
    if (admin) headers['x-admin-token'] = admin
    const r = await fetch(`${this.base}?id=${encodeURIComponent(id)}${key ? `&key=${encodeURIComponent(key)}` : ''}`, { method: 'DELETE', headers }).catch(() => null)
    if (!r || !r.ok) throw new GalleryError('내리지 못했어요. 이 브라우저에서 올린 글씨체만 내릴 수 있어요.')
    const k = myKeys(); delete k[id]; setMyKeys(k)
  }
  async canModerate() { return !!adminToken() }
  async canPublish() { return null }
}

let backend: GalleryBackend | null = null
export function gallery(): GalleryBackend {
  if (!backend) backend = inPreviewFrame() ? new ArtifactBackend() : new HttpBackend()
  return backend
}
/** 테스트용 */
export function setGalleryBackend(b: GalleryBackend | null) { backend = b }
