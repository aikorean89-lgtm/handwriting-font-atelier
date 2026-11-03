# v1.5 통합 시험: 큰 칸 모드, 내 글씨 분석, 스티커, 두 글씨 섞기, 학교 공간, 성장 기록, 손편지 모드
# 실행 전: npm run build && node --experimental-strip-types tests/devserver.ts 4180
import sys, os, base64, http.server, threading
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE','http://localhost:4180/'); T='/home/claude/jaguk/tests'
def ok(c,m):
    print(('ok  ' if c else 'FAIL'),m)
    if not c: sys.exit(1)
def shot(pg,n): pg.screenshot(path=f'{T}/shots/v15-{n}.png')
INK_JS = '''([ch, fam]) => { const c = document.createElement('canvas'); c.width = 120; c.height = 120; const x = c.getContext('2d');
  x.font = '100px ' + (fam || getComputedStyle(document.documentElement).getPropertyValue('--font-user')); x.fillText(ch, 10, 100);
  const d = x.getImageData(0, 0, 120, 120).data; let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i] > 128; return s }'''

# 가상 손편지 사진 (아는 글로)
LINES = ['사랑하는 우리 손주에게', '늘 건강하고 행복하게', '지내라 할머니가']
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s,*a,**k): super().__init__(*a,directory='/home/claude/jaguk',**k)
    def log_message(s,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8769),H); threading.Thread(target=srv.serve_forever,daemon=True).start()

with sync_playwright() as p:
    b=p.chromium.launch()
    g=b.new_page(); g.goto('http://127.0.0.1:8769/tests/letter.html'); g.wait_for_function('window.ready')
    url=g.evaluate('(l)=>window.letter(l)', LINES); open(f'{T}/photo-letter.jpg','wb').write(base64.b64decode(url.split(',')[1])); g.close()

    ctx=b.new_context(viewport={'width':1280,'height':900}, accept_downloads=True)
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)

    # ── 큰 칸 모드 ──
    pg.goto(BASE); pg.wait_for_timeout(2500)
    pg.get_by_role('button', name='폰트 만들기 시작').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='큰 칸 모드').first.click(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='큰 칸 모드로 하기').click(); pg.wait_for_timeout(400)
    ok('큰 칸' in pg.locator('.tpl-sheet img').get_attribute('alt'), 'kids template preview')
    with pg.expect_download() as d: pg.get_by_role('button', name='템플릿 PDF 받기').click()
    ok(d.value.suggested_filename.endswith('.pdf') and '큰칸' in d.value.suggested_filename, 'kids PDF download')
    pg.get_by_role('button', name='다 썼어요, 찍으러 가기').click(); pg.wait_for_timeout(300)
    for ph in ['photo-kids-1.jpg','photo-kids-2.jpg']:
        n0 = pg.get_by_text('시트를 읽었어요').count()
        pg.locator('[data-testid=sheet-file]').set_input_files(f'{T}/{ph}')
        pg.wait_for_function(f"() => document.body.innerText.split('시트를 읽었어요').length - 1 > {n0} || document.body.innerText.includes('큰 칸 2번 시트를 읽었어요')", timeout=120000)
        pg.wait_for_timeout(500)
    ok(pg.get_by_text('큰 칸 2번 시트를 읽었어요').count()>=1, 'both kids sheets read by QR')
    pg.locator('.actions.sticky .btn.primary', has_text='다듬').click(); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='전체').click(); pg.wait_for_timeout(200)
    ok(pg.locator('.grid .cell').count()==60, 'review shows 60 kids cells (50 hangul + 10 digits)')
    pg.get_by_role('button', name='자모 확인하기').click(); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='폰트 만들기').click()
    pg.get_by_text('문장으로 써 보세요').wait_for(timeout=180000); pg.wait_for_timeout(1200)
    ok(pg.evaluate(INK_JS, ['받', None]) > 300, 'kids font renders')
    shot(pg,'01-kids-play')

    # ── 내 글씨 분석 ──
    pg.locator('.tools').get_by_role('tab', name='내 글씨 분석').click(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='분석하기').click()
    pg.wait_for_selector('.report .metric', timeout=60000)
    n = pg.locator('.report .metric').count()
    ok(n >= 6, f'analysis shows {n} metrics')
    ok(pg.locator('.practice-chars span').count() >= 3, 'practice chars listed')
    pg.locator('.report').screenshot(path=f'{T}/shots/v15-02-analysis.png')
    pg.get_by_role('button', name='보충 시트에 넣기').click(); pg.wait_for_timeout(400)
    ok(len(pg.input_value('#extra')) >= 3, 'practice chars go to supplement sheet')

    # ── 스티커 ──
    pg.locator('.tools').get_by_role('tab', name='스티커 만들기').click(); pg.wait_for_timeout(600)
    pg.fill('#stk', '참 잘했어요')
    pg.get_by_role('button', name='초록').click(); pg.wait_for_timeout(300)
    with pg.expect_download() as d: pg.locator('.sticker').get_by_role('button', name='PNG 저장').click()
    path = d.value.path()
    from PIL import Image
    im = Image.open(path); ok(im.mode == 'RGBA' and im.getpixel((0,0))[3] == 0, f'sticker PNG transparent ({im.size[0]}x{im.size[1]})')
    alpha = im.split()[3]; ok(sum(1 for v in alpha.getdata() if v > 128) > 2000, 'sticker has ink')
    pg.locator('.sticker').screenshot(path=f'{T}/shots/v15-03-sticker.png')

    # ── 두 글씨 섞기 ──
    pg.locator('.tools').get_by_role('tab', name='두 글씨 섞기').click(); pg.wait_for_timeout(300)
    pg.locator('.mix').get_by_role('button', name='TTF 파일').click()
    pg.locator('.mix input[type=file]').set_input_files(f'{T}/out2-quick.ttf')
    pg.locator('.mix').get_by_role('button', name='섞은 폰트 만들기').click()
    pg.wait_for_selector('.mix-result textarea', timeout=240000); pg.wait_for_timeout(800)
    fam = pg.evaluate("getComputedStyle(document.querySelector('.mix-result textarea')).fontFamily")
    ok(pg.evaluate(INK_JS, ['한', fam]) > 300, 'mixed font renders')
    pg.fill('.mix-result textarea', '한글 손글씨 가족 폰트 사랑해요')
    pg.locator('.mix-result').screenshot(path=f'{T}/shots/v15-04-mix.png')
    with pg.expect_download() as d: pg.locator('.mix-result').get_by_role('button', name='내려받기').click()
    ok(open(d.value.path(),'rb').read(4) == b'\x00\x01\x00\x00', 'mixed TTF downloads')

    # ── 내보내기: 학교 공간 + 성장 기록 ──
    pg.get_by_role('button', name='이름 짓고 내려받기').click(); pg.wait_for_timeout(400)
    pg.fill('#fname','큰칸 시험 글씨'); pg.fill('#fauthor','1학년')
    pg.get_by_role('button', name='우리 학교 공간에만').click()
    pg.fill('.space-field input', '남성현초2026')
    pg.locator('.seal-btn').focus(); pg.keyboard.press('Enter')
    pg.get_by_text('갤러리에 올렸어요').wait_for(timeout=30000)
    ok(pg.get_by_text('남성현초2026’ 공간').count()==1, 'published to school space')
    pg.get_by_role('button', name='성장 기록에 저장').click(); pg.wait_for_timeout(800)
    ok(pg.get_by_role('button', name='성장 기록에 저장됨').count()==1, 'saved to growth record')
    shot(pg,'05-export')
    # 공간 확인: 공간 안에서는 보이고, 전체 갤러리에서는 안 보임
    pg.locator('.pub').get_by_role('button', name='갤러리 보기').click(); pg.wait_for_timeout(1500)
    ok(pg.locator('.space-bar.in').count()==1 and pg.locator('.gcard', has_text='큰칸 시험 글씨').count()==1, 'space gallery shows the font')
    pg.get_by_role('button', name='전체 갤러리로').click(); pg.wait_for_timeout(1500)
    ok(pg.locator('.gcard', has_text='큰칸 시험 글씨').count()==0, 'public gallery hides space font')
    pg.get_by_role('button', name='우리 학교 공간').click(); pg.fill('.space-bar input', '다른학교'); pg.get_by_role('button', name='들어가기').click(); pg.wait_for_timeout(1500)
    ok(pg.locator('.gcard:not(.skeleton)').count()==0, 'other space is empty')
    pg.get_by_role('button', name='전체 갤러리로').click(); pg.wait_for_timeout(800)
    shot(pg,'06-gallery-space')

    # ── 성장 기록 ──
    pg.goto(BASE); pg.wait_for_timeout(1500)
    pg.get_by_role('button', name='내 글씨 성장 기록').click(); pg.wait_for_timeout(1000)
    ok(pg.locator('.rec-list li').count()==1, 'growth: 1 record')
    pg.locator('[data-testid=growth-file]').set_input_files(f'{T}/out2-quick.ttf'); pg.wait_for_timeout(1200)
    ok(pg.locator('.rec-list li').count()==2, 'growth: imported TTF as record')
    pg.wait_for_function("document.querySelectorAll('.compare-row p').length === 2 && ![...document.querySelectorAll('.compare-row p')].some(p => p.textContent.includes('불러오는'))", timeout=15000)
    pg.wait_for_timeout(500)
    shot(pg,'07-growth')
    with pg.expect_download() as d: pg.get_by_role('button', name='비교 그림 저장 (PNG)').click()
    im = Image.open(d.value.path()); ok(im.size[0] == 1600 and im.size[1] > 400, f'growth comparison PNG {im.size}')
    im.save(f'{T}/shots/v15-08-growth.png')

    # ── 손편지 모드 ──
    pg.goto(BASE); pg.wait_for_timeout(1500)
    pg.get_by_role('button', name='새로 시작').click(); pg.wait_for_timeout(200)
    if pg.get_by_role('button', name='지우고 새로 시작').count(): pg.get_by_role('button', name='지우고 새로 시작').click()
    pg.wait_for_timeout(300)
    pg.get_by_role('button', name='손편지 모드로 하기').click(); pg.wait_for_timeout(500)
    pg.locator('[data-testid=letter-file]').set_input_files(f'{T}/photo-letter.jpg')
    pg.wait_for_selector('.letter-view canvas', timeout=60000); pg.wait_for_timeout(800)
    boxes = int(pg.locator('.letter-side p.note').last.inner_text().split('상자 ')[1].split('개')[0])
    chars = ''.join(LINES).replace(' ', '')
    print('letter boxes found', boxes, 'chars', len(chars))
    ok(boxes == len(chars), 'found one box per character')
    pg.fill('#ltext', '\n'.join(LINES)); pg.get_by_role('button', name='차례대로 붙이기').click(); pg.wait_for_timeout(500)
    shot(pg,'09-letter')
    btn = pg.locator('.draw-finish button')
    ok('다듬기' in btn.inner_text() and btn.is_enabled(), f'letter finish enabled: {btn.inner_text()}')
    btn.click(); pg.wait_for_timeout(1500)
    pg.get_by_role('button', name='전체').click(); pg.wait_for_timeout(200)
    ok(pg.locator('.grid .cell').count() == len(chars), 'review shows letter cells')
    pg.get_by_role('button', name='자모 확인하기').click(); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='폰트 만들기').click()
    pg.get_by_text('문장으로 써 보세요').wait_for(timeout=180000); pg.wait_for_timeout(1200)
    ok(pg.evaluate(INK_JS, ['손', None]) > 300, 'letter font renders')
    shot(pg,'10-letter-play')

    # 휴대폰 폭: 05 화면 탭, 첫 화면 설치 단추
    pg.set_viewport_size({'width':390,'height':844}); pg.wait_for_timeout(600)
    ok(pg.evaluate('document.documentElement.scrollWidth')<=390, 'play: no horizontal scroll at 390px')
    for t in ['내 글씨 분석','스티커 만들기','두 글씨 섞기','고치기']:
        pg.locator('.tools').get_by_role('tab', name=t).click(); pg.wait_for_timeout(300)
        ok(pg.evaluate('document.documentElement.scrollWidth')<=390, f'tab {t}: no horizontal scroll')
    pg.locator('.tools').scroll_into_view_if_needed(); pg.screenshot(path=f'{T}/shots/v15-11-play-mobile.png')
    m=ctx.new_page(); m.set_viewport_size({'width':390,'height':844}); m.goto(BASE); m.wait_for_timeout(2000)
    m.evaluate("() => { const e = new Event('beforeinstallprompt'); e.prompt = async () => {}; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e) }"); m.wait_for_timeout(300)
    ok(m.get_by_role('button', name='앱으로 설치하기').count()==1, 'install button appears when the browser offers install')
    m.screenshot(path=f'{T}/shots/v15-12-home-install.png')
    print('errors:', errs[:8]); ok(not errs, 'no page errors')
    print('V15 OK')
    b.close()
srv.shutdown()
