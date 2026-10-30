// 갤러리 API 핵심 동작 시험 (메모리 저장소): node --experimental-strip-types tests/api-test.ts
import { handle, memoryStore } from '../api/fonts.ts'

const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1) } console.log('ok', m) }
const store = memoryStore()
const base = 'https://x.test/api/fonts'
const ttf = new Blob([new Uint8Array([0, 1, 0, 0, 9, 9, 9])], { type: 'font/ttf' })
const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])], { type: 'image/png' })
const post = (name: string, t = ttf) => {
  const fd = new FormData(); fd.set('name', name); fd.set('author', '쪼아<쌤>'); fd.set('direct', '90'); fd.set('ttf', t, 'a.ttf'); fd.set('preview', png, 'p.png')
  return handle(new Request(base, { method: 'POST', body: fd }), store, { GALLERY_ADMIN_TOKEN: 'adm' })
}

ok((await handle(new Request(base), null)).status === 503, 'no store → 503')
let r = await handle(new Request(base), store); ok((await r.json()).fonts.length === 0, 'empty list')
r = await post('첫 글씨'); ok(r.status === 201, 'publish 201')
const a = await r.json(); ok(!!a.key && a.font.author === '쪼아쌤' && !('keyHash' in a.font), 'sanitized, key returned, hash hidden')
r = await post('둘째 글씨'); const b = await r.json()
r = await post('가짜', new Blob([new Uint8Array([1, 2, 3, 4])])); ok(r.status === 400, 'non-ttf rejected')
r = await handle(new Request(base), store); const l = await r.json()
ok(l.fonts.length === 2 && l.fonts[0].name === '둘째 글씨', 'newest first')
r = await handle(new Request(`${base}?id=${a.font.id}&key=wrong`, { method: 'DELETE' }), store, { GALLERY_ADMIN_TOKEN: 'adm' }); ok(r.status === 403, 'wrong key 403')
r = await handle(new Request(`${base}?id=${a.font.id}&key=${a.key}`, { method: 'DELETE' }), store, { GALLERY_ADMIN_TOKEN: 'adm' }); ok(r.status === 200, 'owner key deletes')
ok(![...store.files.keys()].some((k) => k.includes(a.font.id)), 'all three blobs removed')
r = await handle(new Request(`${base}?id=${b.font.id}`, { method: 'DELETE', headers: { 'x-admin-token': 'adm' } }), store, { GALLERY_ADMIN_TOKEN: 'adm' }); ok(r.status === 200, 'admin deletes')
r = await handle(new Request(`${base}?id=${b.font.id}`, { method: 'DELETE', headers: { 'x-admin-token': 'nope' } }), store, {}); ok(r.status === 404, 'gone → 404')
r = await handle(new Request(`${base}?id=../x`, { method: 'DELETE' }), store); ok(r.status === 400, 'bad id 400')
console.log('API OK')
