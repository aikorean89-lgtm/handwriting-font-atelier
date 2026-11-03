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
    pg.get_by_role('button', name='다듬').click(); pg.wait_for_timeout(300)
    h_before=pg.locator('h1').inner_text()
    pg.get_by_role('button', name='처음으로 돌아가기').click(); pg.wait_for_timeout(800)
    print('home resume text:', pg.locator('.resume p').first.inner_text())
    pg.screenshot(path=f'{root}/shots/home-resume.png')
    pg.get_by_role('button', name='새로 시작').click(); pg.wait_for_timeout(200)
    print('confirm shown:', pg.locator('.resume .warn-text').inner_text())
    pg.get_by_role('button', name='취소').click()
    pg.get_by_role('button', name='이어서 하기').click(); pg.wait_for_timeout(500)
    print('resumed to:', pg.locator('h1').inner_text(), '| same as before:', pg.locator('h1').inner_text()==h_before)
    # 새로고침 뒤에도 남아 있는지
    pg.wait_for_timeout(1000); pg.reload(); pg.wait_for_timeout(2000)
    print('after reload resume:', pg.locator('.resume p').first.inner_text() if pg.locator('.resume').count() else 'none')
    print('errors', errs); b.close()
