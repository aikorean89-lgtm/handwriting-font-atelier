import sys, base64, json
from playwright.sync_api import sync_playwright
d=open('tests/user-direct.txt').read()
groups=json.loads(sys.argv[1])
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
    pg=b.new_page(); pg.goto('http://localhost:5179/tests/real.html'); pg.wait_for_function('window.realReady===true')
    u=pg.evaluate('([u,c,g])=>window.groupSheet(u,c,g)',['/tests/user.ttf',d,groups]); open(sys.argv[2],'wb').write(base64.b64decode(u.split(',')[1])); b.close()
