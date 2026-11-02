import json, sys
from playwright.sync_api import sync_playwright
d=open('tests/user-direct.txt').read()
confs=json.loads(sys.argv[1])
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
    for c in confs:
        pg=b.new_page(); pg.goto('http://localhost:5179/tests/real.html'); pg.wait_for_function('window.realReady===true')
        r=pg.evaluate('([u,c,o])=>window.metric(u,c,o)',['/tests/user.ttf',d,c]); print(json.dumps(c), {k:round(v,3) for k,v in r.items()}); pg.close()
    b.close()
