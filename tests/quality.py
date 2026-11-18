# 조합 품질 측정: python3 tests/quality.py [quick|standard] [글꼴,...] [{"brief":1}]
# 준비: npm i --no-save @fontsource/hi-melody @fontsource/gamja-flower @fontsource/poor-story ; npx vite --port 5179
# 값: composedDist = 만든 글자와 원래 글꼴의 평균 윤곽 거리(64칸 기준, 작을수록 닮음). otherFontDist = 다른 손글씨 글꼴과의 거리(비교 기준)
import json, sys
from playwright.sync_api import sync_playwright
tier=sys.argv[1] if len(sys.argv)>1 else 'quick'
extra=json.loads(sys.argv[3]) if len(sys.argv)>3 else {}
fams=(sys.argv[2] if len(sys.argv)>2 else 'Gaegu,Nanum Pen Script,Hi Melody,Gamja Flower,Poor Story').split(',')
other={'Gaegu':'Poor Story','Nanum Pen Script':'Hi Melody','Hi Melody':'Nanum Pen Script','Gamja Flower':'Gaegu','Poor Story':'Gamja Flower'}
with sync_playwright() as p:
    b=p.chromium.launch(); res=[]
    for f in fams:
        pg=b.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        for attempt in range(3):
            try:
                pg.goto('http://localhost:5179/tests/quality.html'); pg.wait_for_function('window.qReady===true', timeout=60000); pg.wait_for_timeout(500)
                r=pg.evaluate('([f,t,o])=>window.quality(f,t,o)',[f,tier,dict(extra,other=other.get(f))]); break
            except Exception as e:
                if attempt==2: raise
        res.append(r); print(f, r['composedDist'], 'misread', r['misread'], 'otherFontMisread', r['otherMisread'], r['misList'][:200]) if extra.get('brief') else print(json.dumps(r, ensure_ascii=False)); print('errors', errs[:3]); pg.close()
    m=lambda k: sum(r[k] for r in res)/len(res)
    print('MEAN composed %.3f misread %.4f direct %.3f other %.3f aspect %.3f heightCV %.3f' % (m('composedDist'), m('misread'), m('directDist'), m('otherFontDist'), m('aspectErr'), m('heightCV')))
    b.close()
