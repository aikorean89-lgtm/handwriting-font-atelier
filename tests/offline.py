# 오프라인 앱: 서비스 워커가 파일을 받아 두면, 인터넷을 끊어도 시트 찍기부터 폰트 만들기까지 되는지
import sys, os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE','http://localhost:4180/'); T='/home/claude/jaguk/tests'
def ok(c,m):
    print(('ok  ' if c else 'FAIL'),m)
    if not c: sys.exit(1)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1280,'height':900})
    pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_timeout(1000)
    ok(pg.evaluate("navigator.serviceWorker.ready.then(r => !!r.active)"), 'service worker active')
    # 미리 받기가 끝날 때까지
    pg.wait_for_function("caches.keys().then(async k => { const c = await caches.open(k.find(x => x.startsWith('fontgongbang-'))); return (await c.keys()).length > 180 })", timeout=120000)
    n = pg.evaluate("caches.keys().then(async k => (await (await caches.open(k[0])).keys()).length)")
    print('cached files', n)
    ctx.set_offline(True)
    pg.reload(); pg.wait_for_timeout(2500)
    ok(pg.get_by_role('button', name='폰트 만들기 시작').count()==1, 'app opens offline')
    pg.get_by_role('button', name='폰트 만들기 시작').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='빠른 모드로 하기').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='다 썼어요, 찍으러 가기').click(); pg.wait_for_timeout(300)
    pg.locator('[data-testid=sheet-file]').set_input_files(f'{T}/photo2-q-pen.jpg')
    pg.get_by_text('번 시트를 읽었어요').first.wait_for(timeout=120000)
    pg.locator('.actions.sticky .btn.primary', has_text='다듬').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='자모 확인하기').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='폰트 만들기').click()
    pg.get_by_text('문장으로 써 보세요').wait_for(timeout=180000)
    ok(True, 'built a font offline')
    print('errors', errs[:5]); ok(not errs, 'no page errors')
    print('OFFLINE OK'); b.close()
