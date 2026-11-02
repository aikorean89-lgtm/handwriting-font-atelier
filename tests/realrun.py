# 실제 사용자 폰트로 다시 만들어 비교: python3 tests/realrun.py out-name.ttf
import sys, base64, json
from fontTools.ttLib import TTFont
from playwright.sync_api import sync_playwright
out=sys.argv[1] if len(sys.argv)>1 else 'tests/real-new.ttf'
f=TTFont('tests/user.ttf'); cm=f.getBestCmap(); g=f['glyf']
direct=''.join(chr(c) for c in cm if 0xac00<=c<=0xd7a3 and not g[cm[c]].isComposite())
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
    pg=b.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:5179/tests/real.html'); pg.wait_for_function('window.realReady===true')
    r=pg.evaluate('([u,c,o])=>window.runReal(u,c,o)',['/tests/user.ttf',direct,{'picks':'쥐울라'}])
    open(out,'wb').write(base64.b64decode(r['ttf']))
    print('built in',r['ms'],'ms direct',r['direct'])
    for x in r.get('picks',[]): print(x['ch'], x['parts'])
    for k,v in r.get('groups',{}).items(): print(k,':',v)
    print('outliers:',r.get('outliers'))
    print('errors',errs); b.close()
