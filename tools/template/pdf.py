# template.html → PDF (VER 환경 변수, 기본 2). build.py 다음에 실행
from playwright.sync_api import sync_playwright
import pathlib, os
V=int(os.environ.get('VER','2'))
with sync_playwright() as p:
    b=p.chromium.launch()
    for src,out in [('template.html',f'jaguk-template-v{V}.pdf'),('template-kids.html',f'jaguk-template-kids-v{V}.pdf')]:
        if not pathlib.Path(src).exists(): continue
        pg=b.new_page(); pg.goto('file://'+str(pathlib.Path(src).resolve())); pg.wait_for_timeout(800)
        pg.pdf(path=out,width='210mm',height='297mm',print_background=True,margin={'top':'0','bottom':'0','left':'0','right':'0'},prefer_css_page_size=True)
    b.close()
