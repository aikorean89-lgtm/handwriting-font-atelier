# 큰 칸 모드 템플릿 합성 사진
import base64, http.server, threading, functools, os
from playwright.sync_api import sync_playwright
root='/home/claude/jaguk'
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s,*a,**k): super().__init__(*a,directory=root,**k)
    def log_message(s,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8768),H); threading.Thread(target=srv.serve_forever,daemon=True).start()
L='../src/data/template-layout-v2.json'
jobs=[(11,'Gaegu',41,{},'photo-kids-1.jpg'),(12,'Gaegu',42,{},'photo-kids-2.jpg')]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); pg.goto('http://127.0.0.1:8768/tests/synth.html'); pg.wait_for_function('window.ready===true && window.cv'); pg.wait_for_timeout(1500)
    for sheet,font,seed,opts,name in jobs:
        opts=dict(opts,layout=L,img=f'tplk-{sheet-10}.png')
        url=pg.evaluate('([a,b,c,d])=>window.synth(a,b,c,d)',[sheet,font,seed,opts])
        open(os.path.join(root,'tests',name),'wb').write(base64.b64decode(url.split(',')[1])); print('wrote',name)
    b.close()
srv.shutdown()
