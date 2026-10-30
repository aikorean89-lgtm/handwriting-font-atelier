import json
from playwright.sync_api import sync_playwright
d=json.load(open('/home/claude/template/chars.json'))
chars=''.join(c for c in d['freq']+d['cover']+d['std_add'] if '가'<=c<='힣')
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
    pg=b.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:5179/tests/seg.html'); pg.wait_for_function('window.segReady===true')
    tot=[]
    for seed in [3, 17, 91]:
        r=pg.evaluate('([a,b])=>window.evalSynth(a,b)',[chars,seed]); tot.append(r['mean'])
        print('seed',seed,'mean %.3f  >=90%%: %.2f'%(r['mean'],r['good']),' worst:',r['worst'])
    print('AVG %.3f'%(sum(tot)/len(tot)), errs); b.close()
