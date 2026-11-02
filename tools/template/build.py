import json, cv2, qrcode, html, os
V=int(os.environ.get('VER','2'))
if V==1:
    d=json.load(open('chars.json')); QUICK=d['freq']+d['cover']+list('0123456789'); STD_H=d['std_add']
else:
    d=json.load(open('chars-v2.json')); QUICK=d['quick']+list('0123456789'); STD_H=d['std_add']
STD=STD_H+[chr(c) for c in range(65,91)]+[chr(c) for c in range(97,123)]+list("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")
STD+=[None]*(240-len(STD))
assert len(QUICK)==100 and len(STD)==240
BLUE='#8EC5FF'; INK='#111'; SEAL='#FF3B1E'; GRAY='#555'
KR="'Noto Sans CJK KR'"; SERIF="'Noto Serif CJK KR'"; MONO="'DejaVu Sans Mono'"
adict=cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
MK=10.0
MARKERS={0:(8,8),1:(192,8),2:(192,279),3:(8,279)}
def marker(id_,x,y):
    img=cv2.aruco.generateImageMarker(adict,id_,6); s=MK/6; out=[f'<rect x="{x}" y="{y}" width="{MK}" height="{MK}" fill="#fff"/>']
    for r in range(6):
        for c in range(6):
            if img[r*1,c*1]==0 if img.shape[0]==6 else False: pass
    img=cv2.aruco.generateImageMarker(adict,id_,60)
    for r in range(6):
        for c in range(6):
            if img[r*10+5,c*10+5]<128: out.append(f'<rect x="{x+c*s:.3f}" y="{y+r*s:.3f}" width="{s+0.01:.3f}" height="{s+0.01:.3f}" fill="#000"/>')
    return ''.join(out)
def qr(data,x,y,size):
    q=qrcode.QRCode(border=0,error_correction=qrcode.constants.ERROR_CORRECT_M); q.add_data(data); q.make(fit=True)
    m=q.get_matrix(); n=len(m); s=size/n
    return ''.join(f'<rect x="{x+c*s:.3f}" y="{y+r*s:.3f}" width="{s+0.01:.3f}" height="{s+0.01:.3f}" fill="#000"/>' for r in range(n) for c in range(n) if m[r][c])
def t(x,y,txt,size,fam=KR,fill=INK,weight=400,anchor='start',ls=0):
    return f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" letter-spacing="{ls}">{html.escape(txt)}</text>'
def page(kind,idx,total,title,sub,items,cols,cell,gx,label,gy,y0,instr,start=1,footer=False):
    o=[]
    for i,(x,y) in MARKERS.items(): o.append(marker(i,x,y))
    # header
    o.append(f'<rect x="22" y="9" width="6.5" height="6.5" fill="{SEAL}"/>')
    o.append(t(25.25,13.6,'글',3.6,SERIF,'#fff',700,'middle'))
    o.append(t(31,15.2,'폰트공방',7.2,SERIF,INK,700))
    o.append(t(64,15.2,'손글씨로 만드는 나만의 한글 폰트',2.6,KR,GRAY))
    o.append(t(22,23.6,title,4.6,KR,INK,700))
    o.append(t(22,28.4,sub,2.4,MONO,GRAY,400,'start',0.15))
    code=f'JAGUK|v{V}|{kind}|{idx:02d}/{total:02d}'
    o.append(qr(code,172,8.5,14)); o.append(t(179,25.6,f'{idx:02d}/{total:02d}',2.4,MONO,INK,700,'middle'))
    # instructions
    iy=34.2
    o.append(f'<line x1="22" y1="31.2" x2="188" y2="31.2" stroke="{INK}" stroke-width="0.25"/>')
    o.append(t(22,iy,instr,2.45,KR,INK))
    # grid
    width=cols*cell+(cols-1)*gx; x0=(210-width)/2
    layout=[]
    for k,ch in enumerate(items):
        r,c=divmod(k,cols); x=x0+c*(cell+gx); ly=y0+r*(label+cell+gy); cy=ly+label
        # label
        if ch is None:
            o.append(t(x,ly+label-1.2,'여분',2.4,KR,GRAY))
            o.append(f'<line x1="{x+6}" y1="{ly+label-1.0}" x2="{x+9.2}" y2="{ly+label-1.0}" stroke="{GRAY}" stroke-width="0.2"/>')
        else:
            o.append(t(x+0.2,ly+label-1.0,ch,label*0.78,KR,INK,500))
        o.append(t(x+cell-3.6,ly+label-1.3,f'{k+start:03d}',1.7,MONO,BLUE,400,'end'))
        o.append(f'<circle cx="{x+cell-1.3}" cy="{ly+label-1.95}" r="1.05" fill="none" stroke="{BLUE}" stroke-width="0.25"/>')
        # cell
        o.append(f'<rect x="{x:.3f}" y="{cy:.3f}" width="{cell}" height="{cell}" fill="none" stroke="{BLUE}" stroke-width="0.3"/>')
        m=cell/2
        o.append(f'<line x1="{x+m:.3f}" y1="{cy+cell*0.12:.3f}" x2="{x+m:.3f}" y2="{cy+cell*0.88:.3f}" stroke="{BLUE}" stroke-width="0.15" stroke-dasharray="0.6 0.6"/>')
        o.append(f'<line x1="{x+cell*0.12:.3f}" y1="{cy+m:.3f}" x2="{x+cell*0.88:.3f}" y2="{cy+m:.3f}" stroke="{BLUE}" stroke-width="0.15" stroke-dasharray="0.6 0.6"/>')
        layout.append({'index':k+start,'char':ch,'cell':[round(x,3),round(cy,3),cell,cell],'skipMark':[round(x+cell-1.3,3),round(ly+label-1.95,3),1.05]})
    if footer:
        fy=262
        o.append(f'<line x1="16" y1="{fy}" x2="194" y2="{fy}" stroke="{INK}" stroke-width="0.25"/>')
        o.append(t(16,fy+7,'폰트 이름',2.8,KR,INK,700)); o.append(f'<line x1="30" y1="{fy+7.6}" x2="88" y2="{fy+7.6}" stroke="{INK}" stroke-width="0.2"/>')
        o.append(t(94,fy+7,'쓴 날짜',2.8,KR,INK,700)); o.append(f'<line x1="105" y1="{fy+7.6}" x2="135" y2="{fy+7.6}" stroke="{INK}" stroke-width="0.2"/>')
        o.append(f'<rect x="141" y="{fy+3.6}" width="4" height="4" fill="none" stroke="{BLUE}" stroke-width="0.3"/>')
        o.append(t(147,fy+5.6,'하늘색 선은 촬영 후 자동으로 지워져요',2.2,KR,GRAY))
        o.append(t(147,fy+8.6,'네 모서리 검은 마커가 다 보이게 찍으세요',2.2,KR,GRAY))
        o.append(t(16,fy+13.4,'일반 모드로 만들려면 2–4번 시트도 함께 쓰세요. 이 시트는 그대로 1번 시트로 쓰입니다.',2.2,KR,GRAY))
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">{"".join(o)}</svg>'
    return svg,{'sheet':idx,'kind':kind,'qr':code,'cells':layout}
INSTR_Q='① 칸 위 글자를 평소 크기·속도로 따라 쓰세요   ② 하늘색 십자 가운데, 칸 밖으로 나가지 않게   ③ 초성·중성·종성 획은 살짝 띄우기   ④ 틀린 칸은 ○를 칠하기'
INSTR_S='같은 펜으로 쓰세요 · 낯선 글자도 모양만 따라 쓰면 됩니다 · 틀린 칸은 ○를 칠하고, 여분 칸 위 빈칸에 그 글자를 적어 다시 쓰세요'
pages=[]; layouts=[]
s,l=page('quick',1,4,'빠른 모드 시트 — 이 한 장만 쓰면 11,172자 폰트가 만들어집니다',f'SHEET 01/04 · QUICK · 100 CELLS (HANGUL 90 + DIGITS 10) · 16MM · TEMPLATE v{V}.0',QUICK,10,16,2,4.2,1.6,38,INSTR_Q,1,True)
pages.append(s); layouts.append(l)
for p in range(3):
    s,l=page('standard',p+2,4,f'일반 모드 추가 시트 {p+1}/3 — 1번 시트와 함께 촬영하세요',f'SHEET {p+2:02d}/04 · STANDARD · 80 CELLS · 18MM · TEMPLATE v{V}.0',STD[p*80:(p+1)*80],8,18,3,4.6,1.4,38,INSTR_S,101+p*80)
    pages.append(s); layouts.append(l)
meta={'version':f'{V}.0','units':'mm','page':[210,297],'aruco':{'dictionary':'DICT_4X4_50','size':MK,'markers':{str(k):{'origin':v,'position':['TL','TR','BR','BL'][k]} for k,v in MARKERS.items()}},'dropoutColor':BLUE,'sheets':layouts}
json.dump(meta,open(f'jaguk-template-layout-v{V}.json','w'),ensure_ascii=False,indent=1)
doc='<html><head><meta charset="utf-8"><style>@page{size:210mm 297mm;margin:0}body{margin:0}.pg{width:210mm;height:297mm;page-break-after:always;overflow:hidden}.pg:last-child{page-break-after:auto}svg{display:block}</style></head><body>'+''.join(f'<div class="pg">{s}</div>' for s in pages)+'</body></html>'
open('template.html','w').write(doc)
print('ok')
