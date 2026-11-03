# 예전 프로젝트(자모 분리 버전 없음)를 이어서 하면 새 방식으로 다시 나누는지
from playwright.sync_api import sync_playwright
T='/home/claude/jaguk/tests'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
    pg=b.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:4180/'); pg.wait_for_timeout(1500)
    pg.get_by_role('button', name='폰트 만들기 시작').click(); pg.wait_for_timeout(300)
    pg.locator('.actions .btn.primary', has_text='로 하기').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='다 썼어요, 찍으러 가기').click(); pg.wait_for_timeout(300)
    pg.locator('[data-testid=sheet-file]').set_input_files(f'{T}/photo-q-pen.jpg')
    pg.get_by_text('번 시트를 읽었어요').first.wait_for(timeout=120000); pg.wait_for_timeout(1500)
    # 저장된 프로젝트에서 버전 표시를 지운다 (예전 프로젝트처럼)
    pg.evaluate('''() => new Promise((res, rej) => { const r = indexedDB.open('keyval-store'); r.onsuccess = () => { const db = r.result; const tx = db.transaction('keyval', 'readwrite'); const st = tx.objectStore('keyval'); const g = st.get('jaguk.project.v1'); g.onsuccess = () => { const v = g.result; delete v.segVersion; v.step = 'jamo'; st.put(v, 'jaguk.project.v1'); tx.oncomplete = () => res(1) } }; r.onerror = rej })''')
    pg.reload(); pg.wait_for_timeout(1500)
    pg.get_by_role('button', name='이어서 하기').click()
    seen = pg.get_by_text('새 방식으로 다시 하고 있어요').count() > 0
    pg.get_by_text('자모').first.wait_for(timeout=60000); pg.wait_for_timeout(1500)
    print('reseg panel seen:', seen, '| head:', pg.locator('h1').inner_text())
    v = pg.evaluate('''() => new Promise((res) => { setTimeout(() => { const r = indexedDB.open('keyval-store'); r.onsuccess = () => { const g = r.result.transaction('keyval').objectStore('keyval').get('jaguk.project.v1'); g.onsuccess = () => res(g.result.segVersion) } }, 1200) })''')
    print('saved segVersion:', v, 'errors:', errs)
    b.close()
