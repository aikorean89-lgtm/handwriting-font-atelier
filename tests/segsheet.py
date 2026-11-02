import sys, base64
from playwright.sync_api import sync_playwright
chars=sys.argv[1]; out=sys.argv[2]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
    pg=b.new_page(); pg.goto('http://localhost:5179/tests/real.html'); pg.wait_for_function('window.realReady===true')
    import os
    if os.environ.get('VW') is not None: pg.evaluate('(v)=>window.setVW(v)', float(os.environ['VW']))
    import json
    u=pg.evaluate('([u,c,o])=>window.segSheet(u,c,o)',['/tests/user.ttf',chars,json.loads(os.environ.get('SEGOPTS','{}'))]); open(out,'wb').write(base64.b64decode(u.split(',')[1])); b.close()
