// 보충 시트 PDF: 고칠 글자만 담은 A4 시트를 브라우저에서 그려 PDF로 만든다
import QRCode from 'qrcode'
import { LAYOUT, SUPP_BASE, SUPP_MAX, encodeSuppQr, registerSupplement, sheetDef } from './template'

const DPI_MM = 300 / 25.4 // 300dpi
const W_MM = 210, H_MM = 297
const BLUE = '#8EC5FF', INK = '#111111', SEAL = '#c8321b', GRAY = '#555555'
const UI = '"Pretendard Variable", Pretendard, "Noto Sans KR", sans-serif'
const SERIF = '"Hahmlet Variable", "Noto Serif KR", serif'
const MONO = 'ui-monospace, Menlo, monospace'

// ArUco DICT_4X4_50 0–3 (테두리 포함 6×6, 1 = 검정)
const MARKERS = [
  '111111101001110101111001111011111111',
  '111111111111100001101101101011111111',
  '111111111001111001111011100101111111',
  '111111101101101101110111110011111111',
]

async function drawPage(n: number, chars: string[]): Promise<HTMLCanvasElement> {
  const no = SUPP_BASE + n
  registerSupplement(no, chars)
  const def = sheetDef(no)!
  const c = document.createElement('canvas')
  c.width = Math.round(W_MM * DPI_MM); c.height = Math.round(H_MM * DPI_MM)
  const x = c.getContext('2d')!
  x.scale(DPI_MM, DPI_MM) // 이후 좌표는 mm
  x.fillStyle = '#fff'; x.fillRect(0, 0, W_MM, H_MM)
  try { await document.fonts.load(`700 10px ${UI}`, chars.join('') + '보충시트고칠글자'); await document.fonts.load(`700 10px ${SERIF}`, '폰트공방글') } catch { /* 시스템 글꼴 */ }

  // 마커
  const size = LAYOUT.aruco.size, cellMm = size / 6
  Object.entries(LAYOUT.aruco.markers).forEach(([id, m]) => {
    const bits = MARKERS[Number(id)]
    for (let r = 0; r < 6; r++) for (let q = 0; q < 6; q++) {
      x.fillStyle = bits[r * 6 + q] === '1' ? '#000' : '#fff'
      x.fillRect(m.origin[0] + q * cellMm, m.origin[1] + r * cellMm, cellMm + 0.02, cellMm + 0.02)
    }
  })
  const text = (s: string, px: number, py: number, sz: number, font: string, color: string, weight = 400, align: CanvasTextAlign = 'left') => {
    x.font = `${weight} ${sz}px ${font}`; x.fillStyle = color; x.textAlign = align; x.textBaseline = 'alphabetic'; x.fillText(s, px, py)
  }
  // 머리
  x.fillStyle = SEAL; x.fillRect(22, 9, 6.5, 6.5)
  text('글', 25.25, 13.9, 3.6, SERIF, '#fff', 700, 'center')
  text('폰트공방', 31, 15.2, 7.2, SERIF, INK, 700)
  text('손글씨로 만드는 나만의 한글 폰트', 64, 15.2, 2.6, UI, GRAY)
  text(`보충 시트 ${n} — 다시 쓸 글자 ${chars.length}자`, 22, 23.6, 4.6, UI, INK, 700)
  text(`SUPPLEMENT ${String(n).padStart(2, '0')} · ${chars.length} CELLS · 18MM`, 22, 28.4, 2.4, MONO, GRAY)
  // QR (영숫자, 오류 정정 L)
  const qr = QRCode.create(encodeSuppQr(n, chars), { errorCorrectionLevel: 'L' })
  const qs = qr.modules.size, qmm = 23 / qs
  x.fillStyle = '#000'
  for (let r = 0; r < qs; r++) for (let q = 0; q < qs; q++) if (qr.modules.get(r, q)) x.fillRect(166 + q * qmm, 5 + r * qmm, qmm + 0.01, qmm + 0.01)
  x.strokeStyle = INK; x.lineWidth = 0.25
  x.beginPath(); x.moveTo(22, 31.2); x.lineTo(160, 31.2); x.stroke()
  text('평소 글씨로 따라 쓰세요 · 찍기 단계에서 올리면 이 글자들만 새 글씨로 바뀌어요 · 틀린 칸은 ○를 칠하기', 22, 34.6, 2.45, UI, INK)

  // 칸
  for (const cd of def.cells) {
    const [cx, cy, cw] = cd.cell
    const label = 4.6, ly = cy - label
    text(cd.char ?? '', cx + 0.2, ly + label - 1.0, label * 0.78, UI, INK, 500)
    text(String(cd.index - 1000 - (n - 1) * SUPP_MAX).padStart(2, '0'), cx + cw - 3.6, ly + label - 1.3, 1.7, MONO, BLUE, 400, 'right')
    x.strokeStyle = BLUE; x.lineWidth = 0.25
    x.beginPath(); x.arc(cd.skipMark[0], cd.skipMark[1], cd.skipMark[2], 0, Math.PI * 2); x.stroke()
    x.lineWidth = 0.3; x.strokeRect(cx, cy, cw, cw)
    x.lineWidth = 0.15; x.setLineDash([0.6, 0.6])
    x.beginPath(); x.moveTo(cx + cw / 2, cy + cw * 0.12); x.lineTo(cx + cw / 2, cy + cw * 0.88)
    x.moveTo(cx + cw * 0.12, cy + cw / 2); x.lineTo(cx + cw * 0.88, cy + cw / 2); x.stroke()
    x.setLineDash([])
  }
  return c
}

/** JPEG 페이지 여러 장을 담은 최소 PDF */
function jpegPdf(pages: Uint8Array[], pxW: number, pxH: number): Blob {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let len = 0
  const push = (b: Uint8Array | string) => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length }
  const obj = (id: number, body: () => void) => { offsets[id] = len; push(`${id} 0 obj\n`); body(); push('\nendobj\n') }
  const ptW = (W_MM / 25.4) * 72, ptH = (H_MM / 25.4) * 72
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const nP = pages.length
  const pageIds = pages.map((_, i) => 3 + i * 3)
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'))
  obj(2, () => push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${nP} >>`))
  pages.forEach((jpg, i) => {
    const pid = 3 + i * 3, iid = pid + 1, cid = pid + 2
    obj(pid, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptW.toFixed(2)} ${ptH.toFixed(2)}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>`))
    obj(iid, () => { push(`<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream') })
    const content = `q ${ptW.toFixed(2)} 0 0 ${ptH.toFixed(2)} 0 0 cm /Im0 Do Q`
    obj(cid, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`))
  })
  const xref = len
  const count = 3 + nP * 3
  let xt = `xref\n0 ${count}\n0000000000 65535 f \n`
  for (let i = 1; i < count; i++) xt += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  push(xt)
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}

const toJpeg = (c: HTMLCanvasElement) => new Promise<Uint8Array>((res, rej) => c.toBlob(async (b) => {
  if (!b) { rej(new Error('jpeg')); return }
  res(new Uint8Array(await b.arrayBuffer()))
}, 'image/jpeg', 0.93))

/** 보충 시트 PDF (80자마다 한 장). 시트 번호는 firstNo부터 */
export async function makeSupplementPdf(chars: string[], firstNo: number): Promise<{ blob: Blob; sheets: number }> {
  const pages: Uint8Array[] = []
  let w = 0, h = 0
  for (let i = 0; i < chars.length; i += SUPP_MAX) {
    const c = await drawPage(firstNo + i / SUPP_MAX, chars.slice(i, i + SUPP_MAX))
    w = c.width; h = c.height
    pages.push(await toJpeg(c))
  }
  return { blob: jpegPdf(pages, w, h), sheets: pages.length }
}

/** 보충 시트에 넣을 수 있는 글자만 남긴다 (한글 음절, 숫자·영문·기호), 중복 제거 */
export function cleanSuppChars(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    const ok = (cp >= 0xac00 && cp <= 0xd7a3) || (cp > 0x20 && cp < 0x7f)
    if (!ok || seen.has(ch)) continue
    seen.add(ch); out.push(ch)
  }
  return out
}
