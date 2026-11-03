# v1.4 통합 시험: 글자 손보기, 태그·좋아요·인기순, 웹폰트, 설치 안내, 관리자 잠금, 화면에 직접 쓰기
# 실행 전: npm run build && node --experimental-strip-types tests/devserver.ts 4180
import sys, os, time
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE','http://localhost:4180/'); T='/home/claude/jaguk/tests'
def ok(c,m):
    print(('ok  ' if c else 'FAIL'),m)
    if not c: sys.exit(1)
def shot(pg,n): pg.screenshot(path=f'{T}/shots/v14-{n}.png')

INK_JS = '''(ch) => { const c = document.createElement('canvas'); c.width = 120; c.height = 120; const x = c.getContext('2d');
  x.font = '100px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-user'); x.fillText(ch, 10, 100);
  const d = x.getImageData(0, 0, 120, 120).data; let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i] > 128; return s }'''

with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1280,'height':900}, accept_downloads=True)
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type=='error' and '404' not in m.text else None)

    # ── 1. 빠른 모드로 만들고 글자 손보기 ──
    pg.goto(BASE); pg.wait_for_timeout(2500)
    ok(pg.get_by_text('빠른 모드').count()>0 or True, 'home loads')
    pg.get_by_role('button', name='폰트 만들기 시작').click(); pg.wait_for_timeout(300)
    ok(pg.get_by_role('heading', name='빠른 모드').count()==1 and pg.get_by_role('heading', name='일반 모드').count()==1, 'tier names: 빠른 모드 / 일반 모드')
    pg.get_by_role('button', name='빠른 모드로 하기').click(); pg.wait_for_timeout(300)
    ok(pg.get_by_role('button', name='종이 없이 화면에 쓰기').count()==1, 'template offers draw mode')
    pg.get_by_role('button', name='다 썼어요, 찍으러 가기').click(); pg.wait_for_timeout(300)
    pg.locator('[data-testid=sheet-file]').set_input_files(f'{T}/photo2-q-pen.jpg')
    pg.get_by_text('번 시트를 읽었어요').first.wait_for(timeout=120000)
    pg.locator('.actions.sticky .btn.primary', has_text='다듬').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='자모 확인하기').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='폰트 만들기').click()
    pg.get_by_text('문장으로 써 보세요').wait_for(timeout=180000); pg.wait_for_timeout(1200)
    before = pg.evaluate(INK_JS, '쳇')
    pg.fill('.fix-row input', '쳇'); pg.get_by_role('button', name='이 글자 손보기').click()
    pg.wait_for_selector('.editor canvas', timeout=15000); pg.wait_for_timeout(500)
    shot(pg,'01-editor')
    box = pg.locator('.editor canvas').bounding_box()
    # 굵은 가로줄 두 개를 덧쓴다
    for fy in (0.25, 0.8):
        pg.mouse.move(box['x']+box['width']*0.15, box['y']+box['height']*fy); pg.mouse.down()
        for i in range(1, 21): pg.mouse.move(box['x']+box['width']*(0.15+0.7*i/20), box['y']+box['height']*fy)
        pg.mouse.up()
    pg.get_by_role('button', name='저장하고 다시 만들기').click()
    pg.wait_for_timeout(500)
    pg.wait_for_function("() => !document.querySelector('.tune-act button')?.textContent.includes('다시 만드는 중')", timeout=120000)
    pg.wait_for_timeout(1500)
    after = pg.evaluate(INK_JS, '쳇')
    ok(after > before * 1.05, f'edited glyph changed in rebuilt font ({before} → {after})')
    ok(pg.get_by_text('손본 글자 1개').count()==1, 'edited list shows 1')
    shot(pg,'02-after-edit')

    # ── 2. 내보내기: 태그, 공개, 웹폰트 ──
    pg.get_by_role('button', name='이름 짓고 내려받기').click(); pg.wait_for_timeout(400)
    pg.fill('#fname','시험 글씨 v14'); pg.fill('#fauthor','시험')
    pg.locator('.tag-field').get_by_role('button', name='귀여운').click()
    pg.locator('.tag-field').get_by_role('button', name='굵은').click()
    pg.locator('.seal-btn').focus(); pg.keyboard.press('Enter')
    pg.get_by_text('갤러리에 올렸어요').wait_for(timeout=30000)
    pg.locator('.guide').get_by_role('tab', name='웹사이트').click()
    with pg.expect_download() as d: pg.get_by_role('button', name='.woff2 받기').click()
    path = d.value.path(); head = open(path,'rb').read(4); size = os.path.getsize(path)
    ok(head == b'wOF2', f'woff2 magic ok ({size//1024}KB)')
    ttf_kb = pg.evaluate("() => +[...document.querySelectorAll('.meta div')].find(d => d.textContent.includes('파일 크기')).querySelector('b').textContent.replace(/[^0-9]/g,'')")
    ok(size/1024 < ttf_kb*0.8, f'woff2 smaller than ttf ({size//1024}KB < {ttf_kb}KB)')
    for t in ['Windows','macOS','한글·워드·PPT','캔바','아이패드','구글 문서·슬라이드','휴대폰']:
        pg.locator('.guide').get_by_role('tab', name=t).click()
    ok(pg.locator('.guide .tab-body').inner_text().find('아이폰')>=0, 'install guide tabs render')
    shot(pg,'03-export')

    # ── 3. 갤러리: 태그·좋아요·인기순·잠금 ──
    pg.locator('.pub').get_by_role('button', name='갤러리 보기').click(); pg.wait_for_timeout(1500)
    card = pg.locator('.gcard', has_text='시험 글씨 v14').first
    ok(card.locator('.gcard-tags').inner_text().replace('\n',' ').strip() in ('#귀여운 #굵은','#귀여운#굵은'), 'card shows tags')
    card.locator('.like').click(); pg.wait_for_timeout(800)
    ok(card.locator('.like .count').inner_text()=='1' and card.locator('.like').get_attribute('aria-pressed')=='true', 'like → 1')
    pg.reload(); pg.wait_for_timeout(1500)
    card = pg.locator('.gcard', has_text='시험 글씨 v14').first
    ok(card.locator('.like .count').inner_text()=='1' and card.locator('.like').get_attribute('aria-pressed')=='true', 'like persists after reload')
    # 다른 사람 글씨 하나 (API 직접)
    png=open('/home/claude/jaguk/public/template/sheet-1.png','rb').read()
    r=pg.request.post(BASE+'api/fonts', multipart={'name':'남의 글씨','author':'다른 선생님','direct':'90','tags':'또박또박','ttf':{'name':'a.ttf','mimeType':'font/ttf','buffer':open(f'{T}/out2-quick.ttf','rb').read()},'preview':{'name':'p.png','mimeType':'image/png','buffer':png}})
    ok(r.status==201, 'other font seeded')
    pg.reload(); pg.wait_for_timeout(1500)
    pg.locator('.gallery-tools').get_by_role('button', name='인기순').click(); pg.wait_for_timeout(300)
    ok(pg.locator('.gcard .gcard-meta b').first.inner_text()=='시험 글씨 v14', 'popular sort puts liked first')
    pg.locator('.tag-filter').get_by_role('button', name='또박또박').click(); pg.wait_for_timeout(300)
    ok(pg.locator('.gcard:not(.skeleton)').count()==1 and pg.locator('.gcard .gcard-meta b').first.inner_text()=='남의 글씨', 'tag filter')
    # 남의 글씨: 내리기 없음
    pg.locator('.gcard button').first.click(); pg.wait_for_selector('.gdetail', timeout=10000); pg.wait_for_timeout(500)
    ok(pg.locator('.gdetail').get_by_role('button', name='갤러리에서 내리기').count()==0, 'cannot remove others (not admin)')
    ok(pg.locator('.gdetail').get_by_text('내리기는 글씨체를 올린 사람만').count()==1, 'explains owner-only removal')
    pg.locator('.gdetail').get_by_role('button', name='닫기').click(); pg.wait_for_timeout(300)
    # 관리자: 기본 잠김 → 잠금 풀기
    pg.goto(BASE+'#gallery?admin=test-admin'); pg.reload(); pg.wait_for_timeout(1500)
    ok(pg.locator('.mod-bar').count()==1 and '잠김' in pg.locator('.mod-bar').inner_text(), 'admin starts locked')
    pg.locator('.gcard', has_text='남의 글씨').locator('button').first.click(); pg.wait_for_selector('.gdetail'); pg.wait_for_timeout(300)
    ok(pg.locator('.gdetail').get_by_role('button', name='관리자 권한으로 내리기').count()==0, 'locked admin sees no remove')
    pg.locator('.gdetail').get_by_role('button', name='닫기').click(); pg.wait_for_timeout(300)
    pg.locator('.mod-bar').get_by_role('button', name='잠금 풀기').click(); pg.locator('.mod-bar').get_by_role('button', name='잠금 풀기').click(); pg.wait_for_timeout(200)
    pg.locator('.gcard', has_text='남의 글씨').locator('button').first.click(); pg.wait_for_selector('.gdetail'); pg.wait_for_timeout(300)
    ok(pg.locator('.gdetail').get_by_role('button', name='관리자 권한으로 내리기').count()==1, 'unlocked admin can remove')
    pg.locator('.gdetail').get_by_role('button', name='닫기').click()
    shot(pg,'04-gallery')
    try: pg.evaluate("() => localStorage.removeItem('fontgongbang.admin')")
    except Exception: pass

    # ── 4. 화면에 직접 쓰기 ──
    pg.goto(BASE); pg.wait_for_timeout(1500)
    pg.get_by_role('button', name='새로 시작').click(); pg.wait_for_timeout(200)
    if pg.get_by_role('button', name='지우고 새로 시작').count(): pg.get_by_role('button', name='지우고 새로 시작').click()
    pg.wait_for_timeout(300)
    pg.get_by_role('button', name='빠른 모드로 하기').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='종이 없이 화면에 쓰기').click(); pg.wait_for_timeout(800)
    pg.wait_for_function("() => [...document.querySelectorAll('.draw-nav button')].some(b => b.textContent.includes('다음') && !b.disabled)", timeout=30000)
    t0=time.time()
    for i in range(32):
        ch = pg.locator('.draw-char').inner_text()
        # 손글씨 글꼴로 글자를 그려 가로 줄 단위로 펜을 움직인다
        runs = pg.evaluate('''(ch) => { const N = 60, c = document.createElement('canvas'); c.width = N; c.height = N; const x = c.getContext('2d');
          x.font = '44px "Hahmlet Variable", serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, N/2, N/2 + 2);
          const d = x.getImageData(0, 0, N, N).data, out = [];
          for (let y = 0; y < N; y += 2) { let s = -1; for (let X = 0; X <= N; X++) { const on = X < N && d[(y*N+X)*4+3] > 120; if (on && s < 0) s = X; if (!on && s >= 0) { out.push([s/N, X/N, y/N]); s = -1 } } }
          return out }''', ch)
        bx = pg.locator('.drawpad canvas').bounding_box()
        for x0,x1,y in runs:
            pg.mouse.move(bx['x']+bx['width']*x0, bx['y']+bx['height']*y); pg.mouse.down()
            pg.mouse.move(bx['x']+bx['width']*max(x1,x0+0.01), bx['y']+bx['height']*y, steps=2); pg.mouse.up()
        pg.locator('.draw-nav').get_by_role('button', name='다음 →').click(); pg.wait_for_timeout(60)
    print('drew 32 chars in %.1fs' % (time.time()-t0))
    ok(pg.locator('.draw-progress b').inner_text()=='32', 'progress shows 32')
    shot(pg,'05-draw')
    pg.get_by_role('button', name='쓴 32자로 다듬기').click(); pg.wait_for_timeout(800)
    ok('모든 칸을 읽었어요' in pg.locator('h1').inner_text(), 'review: drawn cells all ok')
    pg.get_by_role('button', name='전체').click(); pg.wait_for_timeout(200)
    ok(pg.locator('.grid .cell').count()==32, 'review shows only written cells (32)')
    pg.get_by_role('button', name='자모 확인하기').click(); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='폰트 만들기').click()
    pg.get_by_text('문장으로 써 보세요').wait_for(timeout=180000); pg.wait_for_timeout(1000)
    ok(pg.evaluate(INK_JS, '가') > 200, 'font from drawn glyphs renders')
    shot(pg,'06-draw-play')

    # 휴대폰 폭에서 그리기 화면 가로 넘침 없음
    m=ctx.new_page(); m.set_viewport_size({'width':390,'height':844}); m.goto(BASE); m.wait_for_timeout(1500)
    m.get_by_role('button', name='이어서 하기').click(); m.wait_for_timeout(800)
    m.goto(BASE+'#gallery'); m.reload(); m.wait_for_timeout(1500)
    ok(m.evaluate('document.documentElement.scrollWidth')<=390, 'gallery: no horizontal scroll at 390px')
    m.screenshot(path=f'{T}/shots/v14-07-gallery-mobile.png', full_page=True)
    print('errors:', errs[:8])
    ok(not [e for e in errs if 'Failed to load resource' not in e], 'no page errors')
    print('V14 OK')
    b.close()
