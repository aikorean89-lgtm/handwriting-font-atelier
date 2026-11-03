# claude.ai 미리보기 환경 흉내: window.claude.use(db/user/assets/downloads) 가짜로 갤러리 공개·목록·내리기 확인
import sys, base64
from playwright.sync_api import sync_playwright
BASE='http://localhost:4180/'; T='/home/claude/jaguk/tests'
blobs={}
MOCK = r"""
(() => {
  const store = new Map(); let n = 0; const uid = window.__UID || 'u_me'
  const snap = (id, v) => ({ id, exists: !!v, data: () => (v ? JSON.parse(JSON.stringify(v)) : undefined), metadata: {} })
  const docRef = (path) => ({ id: path.split('/').pop(), path,
    get: async () => snap(path.split('/').pop(), store.get(path)),
    set: async (v) => { const owner = path.split('/')[1]; if ((path.startsWith('gallery/') || path.startsWith('likes/')) && owner !== uid && !window.__OWNER) { const e = new Error('rule'); e.code = 'invalid_argument'; throw e } store.set(path, v) } })
  const db = { doc: docRef, collection: (c) => ({ limit: () => ({ get: async () => { const docs = [...store.entries()].filter(([k]) => k.startsWith(c + '/') && k.split('/').length === 2).map(([k, v]) => snap(k.split('/')[1], v)); return { docs, size: docs.length, empty: !docs.length } } }) }) }
  window.__db = store
  const assets = { upload: async (blob, o) => { const id = (++n).toString(16).padStart(32, '0'); const b = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); await window.__putBlob(id, btoa(s), o?.type || blob.type); return { id, url: '/_blob/' + id, sizeBytes: b.length, contentType: o?.type } }, delete: async (id) => { await window.__delBlob(id); return { deleted: true } }, list: async () => ({ assets: [], usage: {} }) }
  const user = { id: async () => uid, isOwner: async () => !!window.__OWNER, canEdit: async () => false, can: async () => true, me: async () => ({ id: uid }) }
  window.__saved = []
  const downloads = { save: async ({ filename, data }) => { window.__saved.push([filename, data.size]) } }
  const caps = { db, assets, user, downloads }
  window.claude = { use: async (name) => caps[name] ?? null }
})()
"""
def ok(c,m):
    print(('ok  ' if c else 'FAIL'),m)
    if not c: sys.exit(1)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1280,'height':900})
    ctx.expose_function('__putBlob', lambda i,data,t: blobs.__setitem__(i,(base64.b64decode(data),t)))
    ctx.expose_function('__delBlob', lambda i: blobs.pop(i,None))
    ctx.route('**/_blob/*', lambda r: r.fulfill(status=200, body=blobs[r.request.url.split('/_blob/')[1]][0], headers={'content-type':blobs[r.request.url.split('/_blob/')[1]][1]}) if r.request.url.split('/_blob/')[1] in blobs else r.fulfill(status=404))
    ctx.add_init_script(MOCK)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_timeout(2000)
    pg.get_by_role('button', name='폰트 만들기 시작').click(); pg.wait_for_timeout(300)
    pg.locator('.actions .btn.primary', has_text='로 하기').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='다 썼어요, 찍으러 가기').click(); pg.wait_for_timeout(300)
    ok(pg.get_by_text('실시간 카메라를 쓸 수 없어요').count()==1,'preview mode detected (no live camera)')
    pg.locator('[data-testid=sheet-file]').set_input_files(f'{T}/photo-q-gaegu.jpg')
    pg.get_by_text('번 시트를 읽었어요').first.wait_for(timeout=120000)
    pg.get_by_role('button', name='다듬').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='자모 확인하기').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='폰트 만들기').click()
    pg.get_by_text('문장으로 써 보세요').wait_for(timeout=180000); pg.wait_for_timeout(800)
    pg.get_by_role('button', name='이름 짓고 내려받기').click(); pg.wait_for_timeout(300)
    pg.fill('#fname','개구 글씨'); pg.fill('#fauthor','미리보기')
    pg.locator('.seal-btn').focus(); pg.keyboard.press('Enter')
    pg.get_by_text('갤러리에 올렸어요').wait_for(timeout=30000)
    ok(len(blobs)==2,'ttf + preview uploaded as assets')
    pg.get_by_role('button', name='.ttf 내려받기').click(); pg.wait_for_timeout(300)
    ok(pg.evaluate('window.__saved.length')==1,'download goes through downloads capability')
    # 같은 이름으로 다시 올리면 바뀜(중복 없음)
    pg.locator('.pub').get_by_role('button', name='갤러리 보기').click(); pg.wait_for_timeout(1500)
    ok(pg.locator('.gcard:not(.skeleton)').count()==1,'artifact gallery lists 1'); ok(pg.locator('.gcard .mine').count()==1,'mine')
    pg.locator('.gcard .like').click(); pg.wait_for_timeout(500)
    ok(pg.locator('.gcard .like .count').inner_text()=='1' and pg.evaluate("JSON.stringify(window.__db.get('likes/u_me'))").find('u_me/')>=0, 'like stored in likes/{self}')
    ok(pg.evaluate("(async () => { try { await (await window.claude.use('db')).doc('likes/u_other').set({ids:['x']}); return 'wrote' } catch (e) { return 'refused' } })()")=='refused', "cannot write someone else's likes")
    pg.locator('.gcard button').first.click(); pg.wait_for_selector('.gdetail textarea', timeout=15000)
    pg.screenshot(path=f'{T}/shots/v12-artifact-detail.png')
    pg.get_by_role('button', name='갤러리에서 내리기').click(); pg.get_by_role('button', name='정말 내리기').click(); pg.wait_for_timeout(600)
    ok(pg.locator('.gcard:not(.skeleton)').count()==0 and len(blobs)==0,'removed doc entry and assets')
    print('errors:', errs)
    b.close()
print('ARTIFACT MOCK OK')
