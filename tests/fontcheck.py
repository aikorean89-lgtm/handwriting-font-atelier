# 만든 TTF를 운영체제 설치 기준으로 점검: python3 tests/fontcheck.py a.ttf [b.ttf ...]
import sys
from fontTools.ttLib import TTFont
def check(path):
    f = TTFont(path, checkChecksums=2)
    probs, notes = [], []
    nm = f['name']
    def name(i, lang): r = nm.getName(i, 3, 1, lang); return r.toUnicode() if r else None
    for lang in (0x409, 0x412):
        for i in (1, 2, 4, 6):
            if not name(i, lang): probs.append(f'name {i} lang {lang:#x} 없음')
    fam = name(1, 0x409) or ''; ps = name(6, 0x409) or ''
    if len(fam) > 31: probs.append(f'글꼴 이름 {len(fam)}자 (Windows는 31자까지)')
    if not ps.isascii() or ' ' in ps or len(ps) > 63: probs.append(f'PostScript 이름 부적합: {ps!r}')
    os2 = f['OS/2']; head = f['head']; hhea = f['hhea']
    if os2.fsType != 0: probs.append(f'fsType {os2.fsType} (문서에 글꼴 넣기 제한)')
    if not (os2.ulCodePageRange1 >> 19) & 1: probs.append('한국어(완성형) 코드 페이지 비트 없음')
    if not os2.fsSelection & 0x40: probs.append('fsSelection REGULAR 아님')
    if os2.usWeightClass != 400: notes.append(f'weight {os2.usWeightClass}')
    glyf = f['glyf']; order = f.getGlyphOrder()
    ymax = -10**9; ymin = 10**9; xmin = 10**9; xmax = -10**9; maxdepth = 0; maxcomp = 0
    gs = f.getGlyphSet()
    from fontTools.pens.boundsPen import BoundsPen
    for g in order:
        gl = glyf[g]
        if gl.isComposite():
            maxcomp = max(maxcomp, len(gl.components))
            for c in gl.components:
                if c.glyphName not in glyf: probs.append(f'{g}: 없는 부품 {c.glyphName}')
                elif glyf[c.glyphName].isComposite(): maxdepth = 2
        bp = BoundsPen(gs); gs[g].draw(bp)
        if bp.bounds:
            x0, y0, x1, y1 = bp.bounds; ymax = max(ymax, y1); ymin = min(ymin, y0); xmin = min(xmin, x0); xmax = max(xmax, x1)
    if ymax > os2.usWinAscent: probs.append(f'윈도에서 위가 잘림: 글자 끝 {ymax:.0f} > winAscent {os2.usWinAscent}')
    if -ymin > os2.usWinDescent: probs.append(f'윈도에서 아래가 잘림: 글자 끝 {ymin:.0f} < -winDescent {os2.usWinDescent}')
    if (head.yMax < ymax - 1) or (head.yMin > ymin + 1): probs.append(f'head 경계 상자 틀림 ({head.yMin},{head.yMax}) vs ({ymin:.0f},{ymax:.0f})')
    cmap = f.getBestCmap()
    hangul = sum(1 for u in range(0xAC00, 0xD7A4) if u in cmap)
    if hangul != 11172: probs.append(f'한글 {hangul}자만 있음')
    for u in (0x20, 0x30, 0x2E): 
        if u not in cmap: probs.append(f'U+{u:04X} 없음')
    mp = f['maxp']
    if mp.maxComponentElements < maxcomp: probs.append('maxp 부품 수 작음')
    lines = (os2.sTypoAscender - os2.sTypoDescender + os2.sTypoLineGap, hhea.ascent - hhea.descent + hhea.lineGap, os2.usWinAscent + os2.usWinDescent)
    notes.append(f'줄 높이 typo/hhea/win = {lines}, USE_TYPO_METRICS={bool(os2.fsSelection & 0x80)}')
    notes.append(f'글리프 {len(order)}개, 한글 {hangul}, 이름 {fam!r}, ps {ps!r}')
    return probs, notes
bad = 0
for p in sys.argv[1:]:
    pr, no = check(p)
    print('==', p); [print('  문제:', x) for x in pr]; [print('  참고:', x) for x in no]
    bad += len(pr)
print('FONTCHECK', 'OK' if not bad else f'{bad} 문제')
sys.exit(1 if bad else 0)
