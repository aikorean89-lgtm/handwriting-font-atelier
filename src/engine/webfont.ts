// TTF → WOFF2 (웹폰트). 구글 woff2 압축기(wawoff2, wasm)는 처음 누를 때만 불러온다
/* eslint-disable @typescript-eslint/no-explicit-any */
import bindingUrl from 'wawoff2/build/compress_binding.js?url'

let ready: Promise<any> | null = null
function loadCompressor(): Promise<any> {
  if (!ready) {
    ready = new Promise((resolve, reject) => {
      // 브라우저에서는 이 스크립트가 전역 Module 객체를 채운다
      const w = window as any
      const M: any = { onRuntimeInitialized: () => resolve(M) }
      w.Module = M
      const s = document.createElement('script')
      s.src = bindingUrl
      s.onerror = () => { ready = null; reject(new Error('압축기를 불러오지 못했어요.')) }
      document.head.appendChild(s)
    })
  }
  return ready
}

export async function toWoff2(ttf: Uint8Array): Promise<Uint8Array> {
  const M = await loadCompressor()
  await new Promise((r) => setTimeout(r, 30)) // '만드는 중' 표시가 먼저 그려지게
  const out = M.compress(ttf)
  if (!out) throw new Error('웹폰트로 바꾸지 못했어요.')
  return out instanceof Uint8Array ? out : new Uint8Array(out)
}

export const safeFile = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').trim() || '손글씨'

/** 웹사이트에 붙여 넣을 CSS */
export function webfontCss(family: string, file: string): string {
  return `@font-face {
  font-family: '${family}';
  src: url('${file}') format('woff2');
  font-display: swap;
}

/* 쓰고 싶은 곳에 */
body { font-family: '${family}', sans-serif; }`
}
