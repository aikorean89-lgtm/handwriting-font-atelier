// 갤러리 API 핵심 동작 시험 (메모리 저장소): node --experimental-strip-types tests/api-test.ts
import { anonymizeTtf, handle, memoryStore } from '../api/fonts.ts'
import { buildTTF } from '../src/engine/ttf.ts'
import { writeFileSync } from 'node:fs'

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
const a = await r.json(); ok(!!a.key && a.font.author === '' && /^폰트공방 [0-9A-F]{4}$/.test(a.font.name) && a.font.no === a.font.id.slice(-4).toUpperCase() && !('keyHash' in a.font), 'no author, numbered name, key returned, hash hidden')
{
  const raw = String((store.files.get(`gallery/meta/${a.font.id}.json`)!).body)
  ok(!raw.includes('첫 글씨') && !raw.includes('쪼아') && !('name' in JSON.parse(raw)) && !('author' in JSON.parse(raw)), 'meta stores neither name nor author')
}
r = await post('둘째 글씨'); const b = await r.json()
r = await post('가짜', new Blob([new Uint8Array([1, 2, 3, 4])])); ok(r.status === 400, 'non-ttf rejected')
r = await handle(new Request(base), store); const l = await r.json()
ok(l.fonts.length === 2 && l.fonts[0].id === b.font.id, 'newest first')
ok(!JSON.stringify(l).includes('글씨"') && !JSON.stringify(l).includes('쪼아') && l.fonts.every((f: { ttfUrl: string }) => f.ttfUrl.startsWith('/api/fonts?file=')), 'list carries no names; ttf always via api')
// 실제 TTF: 속 이름이 사람 이름이어도 저장·전달할 때 '폰트공방 번호'로 바뀐다
{
  const sq = (x: number, y: number, s2: number) => [{ x, y, on: true }, { x, y: y + s2, on: true }, { x: x + s2, y: y + s2, on: true }, { x: x + s2, y, on: true }]
  const real = buildTTF([{ advance: 500, contours: [sq(50, 0, 400)] }, { advance: 300, unicodes: [32] }, { advance: 1000, unicodes: [0xac00], contours: [sq(100, 0, 700)] }],
    { family: '조은택체', postscript: 'JoEuntaek', version: '1.000', copyright: '© 조은택 2026', license: '개인', ascender: 1000, descender: -250, lineGap: 0, typoAscender: 880, typoDescender: -120, typoLineGap: 250, xHeight: 500, capHeight: 700 })
  const u16 = (t: string) => { const o: number[] = []; for (const ch of t) { const c = ch.charCodeAt(0); o.push(c >> 8, c & 0xff) } return Buffer.from(o) }
  ok(Buffer.from(real).includes(u16('조은택')), 'test font really has the name inside')
  const fd = new FormData(); fd.set('name', '조은택체'); fd.set('author', '조은택'); fd.set('ttf', new Blob([real as BlobPart]), 'a.ttf'); fd.set('preview', png, 'p.png')
  const pr = await (await handle(new Request(base, { method: 'POST', body: fd }), store)).json()
  const stored = Buffer.from(await (store.files.get(`gallery/fonts/${pr.font.id}.ttf`)!.body as Blob).arrayBuffer())
  ok(!stored.includes(u16('조은택')) && !stored.includes(Buffer.from('JoEuntaek')) && stored.includes(u16(`폰트공방 ${pr.font.no}`)), 'stored ttf has no personal name')
  const served = Buffer.from(await (await handle(new Request(new URL(pr.font.ttfUrl, base)), store)).arrayBuffer())
  ok(served.equals(stored) || !served.includes(u16('조은택')), 'served ttf has no personal name')
  writeFileSync(process.env.TTF_OUT || '/tmp/claude-0/-home-claude/cb1878c1-f96f-5fd1-a7d1-e0b6436fc45b/scratchpad/anon.ttf', stored)
  // 예전 방식으로 저장된 기록(이름·만든 사람·이름 든 폰트)은 목록을 열 때 한 번 지워진다
  const oldId = 'old0000aaaa1111'
  store.files.set(`gallery/fonts/${oldId}.ttf`, { body: new Blob([real as BlobPart]), type: 'font/ttf', at: 0 })
  store.files.set(`gallery/meta/${oldId}.json`, { body: JSON.stringify({ id: oldId, name: '조은택체', author: '조은택', createdAt: 1, ttfUrl: 'mem://x', previewUrl: 'mem://y', direct: 1, sizeKB: 1, keyHash: 'h' }), type: 'application/json', at: 0 })
  const lst = await (await handle(new Request(base), store)).json()
  ok(!JSON.stringify(lst).includes('조은택'), 'old record: list hides name')
  const oldMeta = String(store.files.get(`gallery/meta/${oldId}.json`)!.body)
  const oldTtf = Buffer.from(await (store.files.get(`gallery/fonts/${oldId}.ttf`)!.body as Blob).arrayBuffer())
  ok(!oldMeta.includes('조은택') && !oldTtf.includes(u16('조은택')), 'old record scrubbed in storage')
  ok(anonymizeTtf(new Uint8Array([1, 2, 3]), 'abcd1234') .length === 3, 'unreadable file left as is')
  for (const id of [pr.font.id, oldId]) for (const k of [...store.files.keys()]) if (k.includes(id)) store.files.delete(k)
}
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
