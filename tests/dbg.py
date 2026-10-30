import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
    pg=b.new_page(); pg.goto('http://localhost:5179/tests/seg.html'); pg.wait_for_function('window.segReady===true')
    for ch in sys.argv[1]: print(ch); [print('  ',l) for l in pg.evaluate('([a,b])=>window.dbg(a,b)',[ch,'Nanum Pen Script'])]
    b.close()
