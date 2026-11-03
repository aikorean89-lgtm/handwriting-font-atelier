import sys, time, os
from playwright.sync_api import sync_playwright
root='/home/claude/jaguk/tests'
photos=sys.argv[1].split(',') if len(sys.argv)>1 else ['photo-q-pen.jpg']
tier=sys.argv[2] if len(sys.argv)>2 else 'quick'
out=sys.argv[3] if len(sys.argv)>3 else 'out-quick.ttf'
W=int(os.environ.get('VW','1280')); H=int(os.environ.get('VH','900'))
def shot(pg,name): pg.screenshot(path=f'{root}/shots/{tier}-{name}.png', full_page=False)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
    ctx=b.new_context(viewport={'width':W,'height':H}, device_scale_factor=1, accept_downloads=True)
    pg=ctx.new_page(); errs=[]
    pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(os.environ.get('BASE','http://localhost:4173/')); pg.wait_for_timeout(3500); shot(pg,'00-home')
    pg.get_by_role('button', name='폰트 만들기 시작').click(); pg.wait_for_timeout(400)
    if tier=='standard': pg.get_by_role('button', name='일반 모드').first.click()
    shot(pg,'01-tier')
    pg.locator('.actions .btn.primary', has_text='로 하기').click(); pg.wait_for_timeout(300); shot(pg,'02-template')
    pg.get_by_role('button', name='다 썼어요, 찍으러 가기').click(); pg.wait_for_timeout(300)
    t0=time.time()
    for i,ph in enumerate(photos):
        pg.locator('[data-testid=sheet-file]').set_input_files(f'{root}/{ph}')
        pg.get_by_text('번 시트를 읽었어요').first.wait_for(timeout=120000)
        pg.wait_for_timeout(400)
        print('sheet',ph,'processed in %.1fs'%(time.time()-t0)); t0=time.time()
    pg.locator('.check').scroll_into_view_if_needed(); shot(pg,'03-capture')
    print('alerts:', [t for t in pg.locator('[role=alert],[role=status]').all_inner_texts()])
    pg.locator('.actions.sticky .btn.primary', has_text='다듬').click(); pg.wait_for_timeout(500); shot(pg,'04-review')
    print('review head:', pg.locator('h1').inner_text())
    pg.get_by_role('button', name='자모 확인하기').click(); pg.wait_for_timeout(600); shot(pg,'05-jamo')
    print('jamo head:', pg.locator('h1').inner_text())
    pg.get_by_role('button', name='전체').click(); pg.wait_for_timeout(300); shot(pg,'05b-jamo-all'); pg.locator('.grid').screenshot(path=f'{root}/shots/{tier}-05c-jamo-grid.png')
    t0=time.time()
    pg.get_by_role('button', name='폰트 만들기').click(); pg.wait_for_timeout(700); shot(pg,'06-build')
    pg.get_by_text('문장으로 써 보세요').wait_for(timeout=180000)
    print('build took %.1fs'%(time.time()-t0)); pg.wait_for_timeout(1500); shot(pg,'07-play')
    pg.fill('#play','손글씨로 만든 폰트입니다. 쪼아쌤의 교실 안내문, 급식 메뉴, 받아쓰기 시험지에 써 보세요!')
    pg.wait_for_timeout(600); shot(pg,'07b-play-typed')
    pg.locator('.odd-grid').scroll_into_view_if_needed(); pg.wait_for_timeout(300); shot(pg,'07c-odd')
    pg.get_by_role('button', name='이름 짓고 내려받기').click(); pg.wait_for_timeout(500)
    pg.fill('#fname','쪼아쌤 손글씨'); pg.locator('.seal-btn').focus(); pg.keyboard.press('Enter'); pg.wait_for_timeout(900); shot(pg,'08-export')
    with pg.expect_download() as d: pg.get_by_role('button', name='.ttf 내려받기').click()
    d.value.save_as(f'{root}/{out}'); print('downloaded', d.value.suggested_filename)
    print('errors:', errs[:10])
    b.close()
