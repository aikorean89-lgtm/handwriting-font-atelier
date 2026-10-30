// 갤러리 카드에 쓸 견본 그림 (폰트 전체를 받지 않고도 목록을 훑을 수 있게)
let seq = 0

export const PREVIEW_LINES = ['가나다라마바사', '다람쥐 헌 쳇바퀴에 타고파']

export async function makePreview(ttf: Uint8Array): Promise<Blob> {
  const fam = `FontGongbangPreview${++seq}`
  const face = new FontFace(fam, ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength) as ArrayBuffer)
  await face.load()
  document.fonts.add(face)
  const W = 960, H = 400
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const x = c.getContext('2d')!
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H)
  x.fillStyle = '#1c1d1a'; x.textBaseline = 'alphabetic'
  const fit = (s: string, max: number, size: number) => {
    x.font = `${size}px '${fam}'`
    const w = x.measureText(s).width
    return w > max ? Math.floor(size * (max / w)) : size
  }
  const s1 = fit(PREVIEW_LINES[0], W - 96, 132)
  x.font = `${s1}px '${fam}'`; x.fillText(PREVIEW_LINES[0], 48, 48 + s1 * 0.92)
  const s2 = fit(PREVIEW_LINES[1], W - 96, 72)
  x.font = `${s2}px '${fam}'`; x.fillStyle = '#4a4e47'; x.fillText(PREVIEW_LINES[1], 48, H - 64)
  document.fonts.delete(face)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('preview'))), 'image/png'))
}
