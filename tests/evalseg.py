import json, sys
from playwright.sync_api import sync_playwright
d=json.load(open('/home/claude/jaguk/tests/../../template/chars.json')) if False else json.load(open('/home/claude/template/chars.json'))
chars=''.join(d['freq']+d['cover']+d['std_add'])
chars=''.join(c for c in chars if '가'<=c<='힣')
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
    pg=b.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:5179/tests/seg.html'); pg.wait_for_function('window.segReady===true')
    for font in sys.argv[1:] or ['Nanum Pen Script']:
        r=pg.evaluate('([a,b])=>window.evalSeg(a,b)',[chars,font]); print(font, 'mean %.3f  >=90%%: %.2f'%(r['mean'],r['good'])); print('  worst:', r['worst'])
    print(errs); b.close()
