# 폰트 여러 개를 같은 문장으로 그려 비교: python3 tests/compare.py out.png a.ttf b.ttf ...
import sys
from PIL import Image, ImageDraw, ImageFont
out=sys.argv[1]; fonts=sys.argv[2:]
lines=['가나다라마바사 다람쥐 헌 쳇바퀴에','타고파 각난닫랄맘밥삿앙잦찿칼탙팦핳','안녕하세요 오늘은 무엇을 배울까요','ㄱㄴㄷㄹㅁㅂㅅㅇ ㅏㅓㅗㅜㅡㅣ 12345']
lab=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
W=1900; LH=118; H=(LH*len(lines)+40)*len(fonts)
im=Image.new('L',(W,H),255); d=ImageDraw.Draw(im); y=0
for fp in fonts:
    F=ImageFont.truetype(fp,92); d.text((8,y+4),fp.split('/')[-1],font=lab,fill=120); y+=30
    for t in lines:
        d.line([(0,y+LH-14),(W,y+LH-14)],fill=215); d.text((10,y),t,font=F,fill=0); y+=LH
    y+=10; d.line([(0,y),(W,y)],fill=0,width=2)
im.save(out)
