import base64, sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
    pg=b.new_page(); pg.goto('http://localhost:5179/tests/seg.html'); pg.wait_for_function('window.segReady===true')
    u=pg.evaluate('([a,b])=>window.showGT(a,b)',[sys.argv[1], sys.argv[2] if len(sys.argv)>2 else 'Nanum Pen Script'])
    open('/tmp/claude-0/-home-claude/cb1878c1-f96f-5fd1-a7d1-e0b6436fc45b/scratchpad/gt.png','wb').write(base64.b64decode(u.split(',')[1])); b.close()
