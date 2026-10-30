import base64, sys, http.server, threading, functools, os
from playwright.sync_api import sync_playwright
root='/home/claude/jaguk'
H=functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8765),H); threading.Thread(target=srv.serve_forever,daemon=True).start()
jobs=[(1,'Nanum Pen Script',11,{'empty':[57],'skip':[33]},'photo-q-pen.jpg'),
      (1,'Gaegu',29,{},'photo-q-gaegu.jpg'),
      (2,'Nanum Pen Script',5,{},'photo-s2.jpg'),(3,'Nanum Pen Script',6,{},'photo-s3.jpg'),(4,'Nanum Pen Script',7,{},'photo-s4.jpg')]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
    pg=b.new_page(); pg.goto('http://127.0.0.1:8765/tests/synth.html'); pg.wait_for_function('window.ready===true && window.cv')
    pg.wait_for_timeout(1500)
    for sheet,font,seed,opts,name in jobs:
        url=pg.evaluate('([a,b,c,d])=>window.synth(a,b,c,d)',[sheet,font,seed,opts])
        open(os.path.join(root,'tests',name),'wb').write(base64.b64decode(url.split(',')[1])); print('wrote',name)
    b.close()
srv.shutdown()
