import { buildTTF, type TGlyph } from '../src/engine/ttf'
import { writeFileSync } from 'fs'
const sq = (x:number,y:number,s:number)=>[{x,y,on:true},{x,y:y+s,on:true},{x:x+s,y:y+s,on:true},{x:x+s,y,on:true}]
const glyphs: TGlyph[] = [
  { advance: 500, contours: [sq(50,0,400)] },
  { advance: 300, unicodes: [32] },
  { advance: 1000, contours: [[{x:100,y:100,on:false},{x:100,y:700,on:false},{x:600,y:700,on:false},{x:600,y:100,on:false}]] },
]
for (let i=0;i<11172;i++) glyphs.push({ advance:1000, unicodes:[0xAC00+i], components:[{glyph:2,sx:0.8,sy:0.9,dx:50+i%7,dy:20},{glyph:0,sx:0.5,sy:0.5,dx:600,dy:0}] })
glyphs.push({ advance: 600, unicodes:[0x41], contours:[sq(60,0,480), sq(160,100,280).reverse()] })
const bytes = buildTTF(glyphs, { family:'테스트 손글씨', postscript:'JAGUK-Test', version:'1.000', copyright:'© 테스트 2026', license:'개인 소장', ascender:1000, descender:-250, lineGap:0, typoAscender:880, typoDescender:-120, typoLineGap:250, xHeight:500, capHeight:700 })
writeFileSync('/tmp/claude-0/-home-claude/cb1878c1-f96f-5fd1-a7d1-e0b6436fc45b/scratchpad/smoke.ttf', bytes)
console.log('bytes', bytes.length)
