// 오프라인 앱: 서비스 워커 등록과 '앱으로 설치' 단추
import { useEffect, useState } from 'react'
import { inPreviewFrame } from './platform'

interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: InstallEvent | null = null
const subs = new Set<() => void>()
const notify = () => subs.forEach((f) => f())

export function registerPwa() {
  if (!import.meta.env.PROD || inPreviewFrame() || !('serviceWorker' in navigator) || !window.isSecureContext) return
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; notify() })
  window.addEventListener('appinstalled', () => { deferred = null; notify() })
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').then(() => notify()).catch(() => {}) })
}

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** 설치 가능 여부, 오프라인 준비 여부 */
export function usePwa() {
  const [, setTick] = useState(0)
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    const f = () => setTick((t) => t + 1)
    subs.add(f)
    if ('caches' in window && !inPreviewFrame()) caches.keys().then((k) => setOffline(k.some((x) => x.startsWith('fontgongbang-')))).catch(() => {})
    return () => { subs.delete(f) }
  }, [])
  const supported = import.meta.env.PROD && !inPreviewFrame() && 'serviceWorker' in navigator
  return {
    supported,
    installed: supported && standalone(),
    canInstall: !!deferred,
    iosHint: supported && !standalone() && isIos(),
    offline,
    install: async () => {
      if (!deferred) return false
      await deferred.prompt()
      const r = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }))
      deferred = null; notify()
      return r.outcome === 'accepted'
    },
  }
}
