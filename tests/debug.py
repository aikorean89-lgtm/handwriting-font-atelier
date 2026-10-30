from playwright.sync_api import sync_playwright
root='/home/claude/jaguk/tests'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
    pg=b.new_page(viewport={'width':1280,'height':900}); errs=[]
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
    pg.goto('http://localhost:4173/'); pg.wait_for_timeout(1500)
    pg.get_by_role('button', name='폰트 만들기 시작').click()
    pg.get_by_role('button', name='로 하기').click()
    pg.get_by_role('button', name='다 썼어요, 찍으러 가기').click()
    pg.locator('[data-testid=sheet-file]').set_input_files(f'{root}/photo-q-pen.jpg')
    for i in range(3):
        pg.wait_for_timeout(5000)
        print(i, pg.locator('main').inner_text()[:300].replace('\n',' | '))
    pg.screenshot(path=f'{root}/shots/debug.png')
    print('\n'.join(errs[:20]))
    b.close()
