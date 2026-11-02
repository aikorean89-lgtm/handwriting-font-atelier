# v2 템플릿 합성 사진
import base64, http.server, threading, functools, os
from playwright.sync_api import sync_playwright
root='/home/claude/jaguk'
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s,*a,**k): super().__init__(*a,directory=root,**k)
    def log_message(s,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8766),H); threading.Thread(target=srv.serve_forever,daemon=True).start()
L='../src/data/template-layout-v2.json'
jobs=[(1,'Nanum Pen Script',11,{'empty':[57],'skip':[33]},'photo2-q-pen.jpg'),(1,'Gaegu',29,{},'photo2-q-gaegu.jpg'),
      (2,'Nanum Pen Script',5,{},'photo2-s2.jpg'),(3,'Nanum Pen Script',6,{},'photo2-s3.jpg'),(4,'Nanum Pen Script',7,{},'photo2-s4.jpg')]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); pg.goto('http://127.0.0.1:8766/tests/synth.html'); pg.wait_for_function('window.ready===true && window.cv'); pg.wait_for_timeout(1500)
    for sheet,font,seed,opts,name in jobs:
        opts=dict(opts,layout=L,img=f'tpl2-{sheet}.png')
        url=pg.evaluate('([a,b,c,d])=>window.synth(a,b,c,d)',[sheet,font,seed,opts])
        open(os.path.join(root,'tests',name),'wb').write(base64.b64decode(url.split(',')[1])); print('wrote',name)
    b.close()
srv.shutdown()
