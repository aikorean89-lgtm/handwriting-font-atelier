// 실행 환경 차이를 한 곳에서 처리한다 (일반 브라우저 / claude.ai 미리보기 페이지)
/* eslint-disable @typescript-eslint/no-explicit-any */

/** claude.ai 미리보기 안에서 열렸는지 (실시간 카메라와 링크 내려받기가 막힌 환경) */
export function inPreviewFrame(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).claude?.use === 'function'
}

export function canUseLiveCamera(): boolean {
  return !inPreviewFrame() && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext
}

export class SaveDeclined extends Error {}

/** 브라우저가 이 사이트의 저장 자료(작업·성장 기록)를 함부로 지우지 않게 한 번 부탁한다 */
let persistAsked = false
export function askPersist() {
  if (persistAsked) return
  persistAsked = true
  try { navigator.storage?.persist?.().catch(() => {}) } catch { /* 지원하지 않는 브라우저 */ }
}

/** 아이폰·아이패드의 사파리에서 홈 화면 앱이 아닌 채로 열었는지 (오래 안 열면 저장 자료가 지워질 수 있다) */
export function iosBrowserTab(): boolean {
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const standalone = (navigator as any).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches
  return ios && !standalone
}

/** 파일 내려받기. 미리보기 안에서는 저장 확인 창을 거친다 */
export async function saveFile(filename: string, data: Blob): Promise<void> {
  if (inPreviewFrame()) {
    const dl = await (window as any).claude.use('downloads')
    if (!dl) throw new Error('이 화면에서는 파일을 저장할 수 없어요.')
    try { await dl.save({ filename, data }) } catch (e: any) {
      if (e?.code === 'declined') throw new SaveDeclined('저장을 취소했어요.')
      if (e?.code === 'rate_limited') throw new Error('저장 창이 이미 열려 있어요. 잠시 뒤 다시 눌러 주세요.')
      throw new Error('이 화면에서는 파일을 저장할 수 없어요.')
    }
    return
  }
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export async function saveTemplatePdf(file = 'jaguk-template-v2.pdf', name = '폰트공방-손글씨-템플릿.pdf'): Promise<void> {
  const res = await fetch(`${import.meta.env.BASE_URL}template/${file}`)
  if (!res.ok) throw new Error('템플릿을 불러오지 못했어요. 다시 시도해 주세요.')
  await saveFile(name, await res.blob())
}
