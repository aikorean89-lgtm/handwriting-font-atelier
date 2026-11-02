import base64, http.server, threading, os
# QR을 못 읽은 예전(v1) 시트를 '예전에 받은 시트예요'로 골랐을 때 v1 글자 배치로 읽는지 (BASE 서버: tests/devserver.ts 4180)
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
root='/home/claude/jaguk'
im=Image.open(f'{root}/tests/tpl-1.png').convert('RGB'); k=im.width/210
ImageDraw.Draw(im).rectangle([170*k,7*k,188*k,24*k],fill='white'); im.save(f'{root}/tests/tpl-noqr.png')
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s,*a,**k): super().__init__(*a,directory=root,**k)
    def log_message(s,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8767),H); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); pg.goto('http://127.0.0.1:8767/tests/synth.html'); pg.wait_for_function('window.ready===true && window.cv'); pg.wait_for_timeout(1500)
    url=pg.evaluate('([a,b,c,d])=>window.synth(a,b,c,d)',[1,'Nanum Pen Script',3,{'img':'tpl-noqr.png'}])
    open(f'{root}/tests/photo-noqr-v1.jpg','wb').write(base64.b64decode(url.split(',')[1]))
    pg=b.new_page(viewport={'width':1280,'height':900}); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:4180/'); pg.wait_for_timeout(2500)
    pg.get_by_role('button', name='폰트 만들기 시작').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='로 하기').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='다 썼어요, 찍으러 가기').click(); pg.wait_for_timeout(300)
    pg.locator('[data-testid=sheet-file]').set_input_files(f'{root}/tests/photo-noqr-v1.jpg')
    pg.get_by_text('몇 번 시트인가요?').wait_for(timeout=120000); print('ok   pick panel shown')
    pg.get_by_text('예전에 받은 시트예요').click()
    pg.locator('.panel .actions').get_by_role('button', name='1번 시트').click()
    pg.get_by_text('번 시트를 읽었어요').first.wait_for(timeout=120000)
    pg.get_by_role('button', name='다듬').click(); pg.wait_for_timeout(500); pg.get_by_role('button', name='전체').click(); pg.wait_for_timeout(300)
    labels=pg.locator('.cell .lbl b').all_inner_texts()
    print('first chars', ''.join(labels[:12]))
    assert ''.join(labels[:10])=='이다는에하고가을지로', labels[:10]
    print('ok   v1 layout used for manual pick'); print('errors', errs)
    b.close()
srv.shutdown()
