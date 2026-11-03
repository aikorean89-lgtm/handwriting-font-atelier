// 폰트공방 서비스 워커: 앱 파일을 미리 받아 두어 인터넷 없이도 쓸 수 있게 한다. (빌드 때 목록이 채워짐)
const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__
const CACHE = 'fontgongbang-' + VERSION

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE)
    // 하나가 실패해도 나머지는 받아 둔다
    await Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('fontgongbang-') && k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin || url.pathname.includes('/api/')) return
  // 페이지: 인터넷이 되면 새 것, 안 되면 저장해 둔 것
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); return r })
      .catch(async () => (await caches.match(req)) || (await caches.match('./')) || (await caches.match('./index.html'))))
    return
  }
  // 그 밖의 파일: 저장해 둔 것 먼저
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true })
    if (hit) return hit
    const r = await fetch(req)
    if (r.ok && r.type === 'basic') { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
    return r
  })())
})
