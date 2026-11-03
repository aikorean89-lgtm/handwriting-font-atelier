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
ok((await (await handle(new Request(`${base}?health=1`), null)).json()).setup === true, 'health without store says setup needed')
ok((await (await handle(new Request(`${base}?health=1`), store)).json()).ok === true, 'health ok')
// 비공개 저장소: 파일은 /api/fonts?file= 로 대신 내려준다
{
  const ps = memoryStore({ private: true })
  const fd = new FormData(); fd.set('name', '비공개 글씨'); fd.set('ttf', ttf, 'a.ttf'); fd.set('preview', png, 'p.png')
  const pr = await (await handle(new Request(base, { method: 'POST', body: fd }), ps)).json()
  ok(pr.font.ttfUrl.startsWith('/api/fonts?file=gallery%2Ffonts%2F'), 'private store: ttf served via api')
  const pl = await (await handle(new Request(base), ps)).json()
  ok(pl.fonts[0].previewUrl.startsWith('/api/fonts?file=gallery%2Fpreviews%2F'), 'private store: list uses api urls')
  const fr = await handle(new Request(new URL(pl.fonts[0].ttfUrl, base)), ps)
  ok(fr.status === 200 && fr.headers.get('content-type') === 'font/ttf' && new Uint8Array(await fr.arrayBuffer())[1] === 1, 'file proxy returns ttf')
  ok((await handle(new Request(`${base}?file=../secret`), ps)).status === 400, 'file proxy rejects other paths')
  ok((await handle(new Request(`${base}?file=gallery%2Fmeta%2Fx.json`), ps)).status === 400, 'file proxy refuses meta (delete keys)')
  ok((await handle(new Request(`${base}?id=${pr.font.id}&key=${pr.key}`, { method: 'DELETE' }), ps)).status === 200 && ps.files.size === 0, 'private store delete removes all files')
}
let r = await handle(new Request(base), store); ok((await r.json()).fonts.length === 0, 'empty list')
r = await post('첫 글씨'); ok(r.status === 201, 'publish 201')
const a = await r.json(); ok(!!a.key && a.font.author === '쪼아쌤' && !('keyHash' in a.font), 'sanitized, key returned, hash hidden')
r = await post('둘째 글씨'); const b = await r.json()
r = await post('가짜', new Blob([new Uint8Array([1, 2, 3, 4])])); ok(r.status === 400, 'non-ttf rejected')
r = await handle(new Request(base), store); const l = await r.json()
ok(l.fonts.length === 2 && l.fonts[0].name === '둘째 글씨', 'newest first')
// 태그·좋아요
{
  const fd = new FormData(); fd.set('name', '태그 글씨'); fd.set('tags', '귀여운,또박또박,둥근,넷째,귀여운'); fd.set('ttf', ttf, 'a.ttf'); fd.set('preview', png, 'p.png')
  const t = await (await handle(new Request(base, { method: 'POST', body: fd }), store)).json()
  ok(JSON.stringify(t.font.tags) === JSON.stringify(['귀여운', '또박또박', '둥근']), 'tags cleaned to 3')
  const like = (on: string, voter = 'voter-aaaaaaaaaaaaaaaa') => handle(new Request(`${base}?like=${t.font.id}&on=${on}`, { method: 'POST', headers: { 'x-voter': voter } }), store)
  ok((await (await like('1')).json()).likes === 1, 'like 1')
  ok((await (await like('1')).json()).likes === 1, 'like twice same voter stays 1')
  ok((await (await like('1', 'voter-bbbbbbbbbbbbbbbb')).json()).likes === 2, 'second voter → 2')
  ok((await like('1', 'bad')).status === 400, 'bad voter 400')
  let lst = await (await handle(new Request(base, { headers: { 'x-voter': 'voter-aaaaaaaaaaaaaaaa' } }), store)).json()
  let f = lst.fonts.find((x: { id: string }) => x.id === t.font.id)
  ok(f.likes === 2 && f.liked === true, 'list shows likes and liked')
  ok((await (await like('0')).json()).likes === 1, 'unlike → 1')
  ok((await handle(new Request(`${base}?id=${t.font.id}&key=wrong`, { method: 'PATCH', body: JSON.stringify({ tags: ['x'] }) }), store)).status === 403, 'tag patch wrong key 403')
  ok((await handle(new Request(`${base}?id=${t.font.id}&key=${t.key}`, { method: 'PATCH', body: JSON.stringify({ tags: ['굵은'] }) }), store)).status === 200, 'tag patch with key')
  lst = await (await handle(new Request(base), store)).json()
  f = lst.fonts.find((x: { id: string }) => x.id === t.font.id)
  ok(JSON.stringify(f.tags) === '["굵은"]' && f.liked === false, 'tags updated; no voter → not liked')
  ok((await handle(new Request(`${base}?id=${t.font.id}&key=${t.key}`, { method: 'DELETE' }), store)).status === 200, 'delete tagged')
  ok(![...store.files.keys()].some((k) => k.includes(t.font.id)), 'likes removed with font')
}
// 학교 공간
{
  const fd = new FormData(); fd.set('name', '공간 글씨'); fd.set('space', ' 남성현초 '); fd.set('ttf', ttf, 'a.ttf'); fd.set('preview', png, 'p.png')
  const t = await (await handle(new Request(base, { method: 'POST', body: fd }), store)).json()
  const pub = await (await handle(new Request(base), store)).json()
  ok(!pub.fonts.some((f: { id: string }) => f.id === t.font.id), 'space font hidden from public list')
  const sp = await (await handle(new Request(`${base}?space=${encodeURIComponent('남성현초')}`), store)).json()
  ok(sp.fonts.length === 1 && sp.fonts[0].id === t.font.id && !('spaceHash' in sp.fonts[0]), 'space list shows only space fonts, hash hidden')
  const other = await (await handle(new Request(`${base}?space=다른학교`), store)).json()
  ok(other.fonts.length === 0, 'other space empty')
  ok((await handle(new Request(`${base}?space=x`), store)).status === 400, 'too short space 400')
  await handle(new Request(`${base}?id=${t.font.id}&key=${t.key}`, { method: 'DELETE' }), store)
}
r = await handle(new Request(`${base}?id=${a.font.id}&key=wrong`, { method: 'DELETE' }), store, { GALLERY_ADMIN_TOKEN: 'adm' }); ok(r.status === 403, 'wrong key 403')
r = await handle(new Request(`${base}?id=${a.font.id}&key=${a.key}`, { method: 'DELETE' }), store, { GALLERY_ADMIN_TOKEN: 'adm' }); ok(r.status === 200, 'owner key deletes')
ok(![...store.files.keys()].some((k) => k.includes(a.font.id)), 'all three blobs removed')
r = await handle(new Request(`${base}?id=${b.font.id}`, { method: 'DELETE', headers: { 'x-admin-token': 'adm' } }), store, { GALLERY_ADMIN_TOKEN: 'adm' }); ok(r.status === 200, 'admin deletes')
r = await handle(new Request(`${base}?id=${b.font.id}`, { method: 'DELETE', headers: { 'x-admin-token': 'nope' } }), store, {}); ok(r.status === 404, 'gone → 404')
r = await handle(new Request(`${base}?id=../x`, { method: 'DELETE' }), store); ok(r.status === 400, 'bad id 400')
console.log('API OK')
