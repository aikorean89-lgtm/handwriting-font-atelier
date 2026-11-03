# 첫 화면 탭·만든이, 위 단계 막대로 돌아가기
import sys, os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE','http://localhost:4180/'); T='/home/claude/jaguk/tests'
def ok(c,m):
    print(('ok  ' if c else 'FAIL'),m)
    if not c: sys.exit(1)
with sync_playwright() as p:
    b=p.chromium.launch()
    for w,h,n in [(1280,900,'d'),(390,844,'m'),(360,740,'s')]:
        ctx=b.new_context(viewport={'width':w,'height':h}); pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE); pg.wait_for_timeout(2500)
        ok(pg.get_by_text('만든이: 남성현초 교사 조은택').count()==1, f'{n}: footer credit')
        ok(pg.locator('.hub .hub-tab').count()==3, f'{n}: 3 hub tabs (gallery, growth, install)')
        ok(pg.locator('.hero-privacy').inner_text()=='사진은 이 기기 밖으로 나가지 않아요.', f'{n}: privacy on its own line')
        pg.locator('.hub').screenshot(path=f'{T}/shots/nav-hub-{n}.png')
        pg.screenshot(path=f'{T}/shots/nav-home-{n}.png')
        pg.get_by_role('button', name='앱으로 설치하기').click(); pg.wait_for_timeout(200)
        ok(pg.locator('.install-help').count()==1, f'{n}: install help opens when browser has no prompt')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w, f'{n}: no horizontal scroll')
        if n=='d':
            pg.get_by_role('button', name='폰트 만들기 시작').click(); pg.wait_for_timeout(300)
            pg.locator('.actions .btn.primary', has_text='로 하기').click(); pg.wait_for_timeout(300)
            pg.get_by_role('button', name='다 썼어요, 찍으러 가기').click(); pg.wait_for_timeout(300)
            ok(pg.locator('.steps button').count()==2, 'capture: can go back to 01, 02')
            pg.locator('[data-testid=sheet-file]').set_input_files(f'{T}/photo2-q-pen.jpg')
            pg.get_by_text('번 시트를 읽었어요').first.wait_for(timeout=120000)
            pg.get_by_role('button', name='다듬').click(); pg.wait_for_timeout(400)
            pg.get_by_role('button', name='자모 확인하기').click(); pg.wait_for_timeout(400)
            pg.get_by_role('button', name='폰트 만들기').click()
            pg.get_by_text('문장으로 써 보세요').wait_for(timeout=180000); pg.wait_for_timeout(800)
            pg.locator('.topbar').screenshot(path=f'{T}/shots/nav-steps-d.png')
            pg.get_by_role('button', name='03 찍기 단계로 돌아가기').click(); pg.wait_for_timeout(500)
            ok('시트를 찍으세요' in pg.locator('h1').inner_text(), 'back to 03 capture')
            pg.get_by_role('button', name='04 다듬기 단계로 가기').click(); pg.wait_for_timeout(500)
            ok(any(k in pg.locator('h1').inner_text() for k in ['칸','자모']), 'forward to 04 (last screen there)')
            pg.get_by_role('button', name='05 완성 단계로 가기').click(); pg.wait_for_timeout(800)
            ok(pg.get_by_text('문장으로 써 보세요').count()>=1, 'forward to 05 keeps built font (no rebuild)')
            pg.get_by_role('button', name='01 고르기 단계로 돌아가기').click(); pg.wait_for_timeout(400)
            ok('고르세요' in pg.locator('h1').inner_text(), 'back to 01 tier')
        if n=='s':
            pg.get_by_role('button', name='이어서 하기').count()
        print(n, 'errors', errs[:3]); ok(not errs, f'{n}: no errors')
        ctx.close()
    # 휴대폰에서 단계 막대
    ctx=b.new_context(viewport={'width':360,'height':740}); pg=ctx.new_page(); pg.goto(BASE); pg.wait_for_timeout(1500)
    pg.get_by_role('button', name='폰트 만들기 시작').click(); pg.wait_for_timeout(300)
    pg.locator('.actions .btn.primary', has_text='로 하기').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='다 썼어요, 찍으러 가기').click(); pg.wait_for_timeout(300)
    pg.locator('.topbar').screenshot(path=f'{T}/shots/nav-steps-s.png')
    ok(pg.evaluate('document.documentElement.scrollWidth')<=360, 'phone: topbar fits at 360px')
    pg.get_by_role('button', name='02 쓰기 단계로 돌아가기').click(); pg.wait_for_timeout(300)
    ok('템플릿' in pg.locator('h1').inner_text(), 'phone: back to 02 by tapping number')
    print('NAV OK'); b.close()
