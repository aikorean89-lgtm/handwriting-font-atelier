from playwright.sync_api import sync_playwright
root='/home/claude/jaguk/tests'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
    pg=b.new_page(viewport={'width':1280,'height':900}); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:4180/'); pg.wait_for_timeout(1500)
    pg.get_by_role('button', name='폰트 만들기 시작').click(); pg.locator('.actions .btn.primary', has_text='로 하기').click()
    pg.get_by_role('button', name='다 썼어요, 찍으러 가기').click()
    pg.locator('[data-testid=sheet-file]').set_input_files(f'{root}/photo-q-pen.jpg')
    pg.get_by_text('번 시트를 읽었어요').first.wait_for(timeout=60000)
    pg.locator('.actions.sticky .btn.primary', has_text='다듬').click(); pg.get_by_role('button', name='자모 확인하기').click(); pg.wait_for_timeout(400)
    before=pg.locator('h1').inner_text()
    pg.locator('.grid .cell').first.click(); pg.wait_for_timeout(300)
    cv=pg.locator('.sheet-modal canvas')
    px=lambda: pg.evaluate("()=>{const c=document.querySelector('.sheet-modal canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let h=0;for(let i=0;i<d.length;i+=4)h=(h*31+d[i]+d[i+1]*3)>>>0;return h}")
    h0=px(); bb=cv.bounding_box()
    # 잉크가 있는 곳을 찾아 누르기
    pt=pg.evaluate("()=>{const c=document.querySelector('.sheet-modal canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){if(d[(y*c.width+x)*4+3]>0)return [x/c.width,y/c.height]}}")
    pg.mouse.click(bb['x']+pt[0]*bb['width']+1, bb['y']+pt[1]*bb['height']+1); pg.wait_for_timeout(300)
    h1=px(); pg.screenshot(path=f'{root}/shots/tapfix.png')
    pg.get_by_role('button', name='됐어요').click(); pg.wait_for_timeout(300)
    print('before', before, '| after', pg.locator('h1').inner_text(), '| canvas changed', h0!=h1, '| errors', errs)
    b.close()
