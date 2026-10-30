// OpenCV.js를 필요할 때만 불러온다. WASM 본체(약 12MB)는 진행률을 보이며 받는다
/* eslint-disable @typescript-eslint/no-explicit-any */
const WASM_BYTES = 11958198
const FAIL = '영상 처리 엔진을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도하세요.'

export interface CVStatus { state: 'idle' | 'loading' | 'starting' | 'ready' | 'error'; loaded: number; total: number }
let status: CVStatus = { state: 'idle', loaded: 0, total: WASM_BYTES }
const listeners = new Set<(s: CVStatus) => void>()
function setStatus(s: Partial<CVStatus>) {
  status = { ...status, ...s }
  listeners.forEach((l) => l(status))
}
export function getCVStatus(): CVStatus { return status }
export function onCVStatus(fn: (s: CVStatus) => void): () => void {
  listeners.add(fn)
  fn(status)
  return () => { listeners.delete(fn) }
}

async function fetchWithProgress(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('wasm')
  const len = Number(res.headers.get('content-length')) || 0
  const encoded = !!res.headers.get('content-encoding')
  const total = !encoded && len > 0 ? len : WASM_BYTES
  setStatus({ total })
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer())
    setStatus({ loaded: buf.length })
    return buf
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    setStatus({ loaded: Math.min(loaded, total) })
  }
  const out = new Uint8Array(loaded)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}

let loading: Promise<any> | null = null

export function loadCV(): Promise<any> {
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const w = window as any
    const fail = () => { loading = null; setStatus({ state: 'error' }); reject(new Error(FAIL)) }
    const finish = async () => {
      let cv = w.cv
      if (cv instanceof Promise || (cv && typeof cv.then === 'function' && !cv.Mat)) cv = await cv
      const done = (c: any) => { w.cv = c; setStatus({ state: 'ready', loaded: status.total }); resolve(c) }
      if (cv && cv.Mat) { done(cv); return }
      cv.onRuntimeInitialized = () => done(cv)
    }
    if (w.cv) { finish().catch(fail); return }
    setStatus({ state: 'loading', loaded: 0 })
    fetchWithProgress(`${import.meta.env.BASE_URL}vendor/opencv.wasm`).then((buf) => {
      w.__JAGUK_CV_WASM = buf
      setStatus({ state: 'starting' })
      const s = document.createElement('script')
      s.src = `${import.meta.env.BASE_URL}vendor/opencv.js`
      s.async = true
      s.onload = () => { finish().catch(fail) }
      s.onerror = fail
      document.head.appendChild(s)
    }).catch(fail)
  })
  return loading
}

export function isCVReady(): boolean {
  const cv = (window as any).cv
  return !!(cv && cv.Mat)
}
