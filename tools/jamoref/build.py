# 자모 기준 글꼴 만들기 (한 번만 돌리면 된다)
#   Noto Sans CJK KR(SIL OFL 1.1)의 '첫가끝 자모 조합' 기능이 음절마다 고르는 위치별 자모 글리프를 뽑아,
#   개인 영역 코드(U+E000~)에 하나씩 매긴 작은 글꼴과, 음절 → 글리프 규칙표를 만든다.
#   음절 하나를 초성·중성·종성 글리프로 따로 그릴 수 있어 기준 자모 지도가 정확해진다.
#   필요: pip install fonttools uharfbuzz brotli
#   실행: python3 tools/jamoref/build.py /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
import sys, os, json, tempfile, collections
import uharfbuzz as hb
from fontTools.ttLib import TTCollection, TTFont
from fontTools import subset
from fontTools.ttLib.tables._c_m_a_p import cmap_format_4

src = sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
tmp = tempfile.mkdtemp()
col = TTCollection(src)
kr = next(f for f in col.fonts if 'CJK KR' in f['name'].getDebugName(1) and 'Mono' not in f['name'].getDebugName(1))
full = os.path.join(tmp, 'kr.otf'); kr.save(full)

# 1) 완성형 음절을 빼고 첫가끝 자모만 남긴 글꼴로 모양을 잡게 하면, 위치별 자모 글리프가 나온다
jamo = os.path.join(tmp, 'jamo.otf')
opt = subset.Options(); opt.layout_features = ['*']; opt.hinting = False; opt.notdef_outline = True
f = TTFont(full); s = subset.Subsetter(opt)
s.populate(unicodes=list(range(0x1100, 0x1200)) + list(range(0xA960, 0xA980)) + list(range(0xD7B0, 0xD800)))
s.subset(f); f.save(jamo)
font = hb.Font(hb.Face(hb.Blob.from_file_path(jamo)))
names = TTFont(jamo).getGlyphOrder()
def shape(t):
    buf = hb.Buffer(); buf.add_str(t); buf.guess_segment_properties(); buf.language = 'ko'
    hb.shape(font, buf, {})
    for p in buf.glyph_positions: assert p.x_offset == 0 and p.y_offset == 0
    return [names[i.codepoint] for i in buf.glyph_infos], buf.glyph_positions[0].x_advance

tab = []; adv = None
for n in range(11172):
    c, j, t = n // 588, (n % 588) // 28, n % 28
    g, a = shape(chr(0x1100 + c) + chr(0x1161 + j) + (chr(0x11A7 + t) if t else ''))
    assert len(g) == (3 if t else 2), (n, g)
    adv = adv or a; assert a == adv
    tab.append(g)
glyphs = sorted({x for g in tab for x in g})
code = {g: 0xE000 + k for k, g in enumerate(glyphs)}
L = [[[0, 0] for _ in range(21)] for _ in range(19)]; V = [[0, 0] for _ in range(21)]; T = [[0] * 21 for _ in range(28)]
for n, g in enumerate(tab):
    c, j, t = n // 588, (n % 588) // 28, n % 28
    for tbl, key, val in ((L[c][j], int(t > 0), g[0]),):
        assert tbl[key] in (0, code[val]); tbl[key] = code[val]
    assert V[j][int(t > 0)] in (0, code[g[1]]); V[j][int(t > 0)] = code[g[1]]
    if t: assert T[t][j] in (0, code[g[2]]); T[t][j] = code[g[2]]
print('glyphs', len(glyphs), 'advance', adv)

# 2) 그 글리프만 남기고 개인 영역 코드로 매긴 글꼴 (이름은 OFL에 따라 원래 이름을 쓰지 않는다)
f = TTFont(jamo)
opt = subset.Options(); opt.layout_features = []; opt.hinting = False; opt.glyph_names = False; opt.notdef_outline = True
s = subset.Subsetter(opt); s.populate(glyphs=glyphs); s.subset(f)
cm = cmap_format_4(4); cm.platformID, cm.platEncID, cm.language = 3, 1, 0; cm.cmap = {code[g]: g for g in glyphs}
f['cmap'].tables = [cm]
for tag in ('GSUB', 'GPOS', 'VORG', 'vhea', 'vmtx'):
    if tag in f: del f[tag]
nm = f['name']
keep = {r.nameID: r.toUnicode() for r in nm.names if r.platformID == 3 and r.langID == 0x409}
nm.names = []
for i, v in {0: keep.get(0, ''), 1: 'FontGongbang JamoRef', 2: 'Regular', 3: 'FontGongbang JamoRef 1.0', 4: 'FontGongbang JamoRef',
             5: 'Version 1.000', 6: 'FontGongbangJamoRef', 13: keep.get(13, 'SIL Open Font License 1.1'), 14: 'https://openfontlicense.org'}.items():
    nm.setName(v, i, 3, 1, 0x409)
f['OS/2'].fsType = 0
f.flavor = 'woff2'
out = os.path.join(root, 'public', 'ref'); os.makedirs(out, exist_ok=True)
f.save(os.path.join(out, 'jamo-ref.woff2'))
json.dump({'advance': adv, 'upm': f['head'].unitsPerEm, 'L': L, 'V': V, 'T': T}, open(os.path.join(root, 'src', 'data', 'jamo-ref.json'), 'w'), separators=(',', ':'))
print('wrote', os.path.getsize(os.path.join(out, 'jamo-ref.woff2')), 'bytes')
