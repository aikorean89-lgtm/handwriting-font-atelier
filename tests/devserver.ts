// dist + /api/fonts(메모리 저장소)를 함께 띄우는 시험용 서버: node --experimental-strip-types tests/devserver.ts 4180
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { handle, type Store } from '../api/fonts.ts'

const port = Number(process.argv[2] || 4180)
const root = new URL('../dist/', import.meta.url).pathname
const files = new Map<string, { body: Buffer; type: string; at: number }>()
let tick = 0
const origin = `http://localhost:${port}`
const store: Store = {
  put: async (p, body, type) => { files.set(p, { body: Buffer.from(typeof body === 'string' ? body : await body.arrayBuffer()), type, at: ++tick }); return { url: `${origin}/_mem/${p}` } },
  list: async (prefix) => [...files.entries()].filter(([p]) => p.startsWith(prefix)).map(([p, f]) => ({ pathname: p, url: `${origin}/_mem/${p}`, uploadedAt: f.at })),
  read: async (u) => { const f = files.get(u.split('/_mem/')[1]); return f ? f.body.toString('utf8') : null },
  del: async (urls) => { for (const u of urls) files.delete(u.split('/_mem/')[1]) },
}
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.png': 'image/png', '.pdf': 'application/pdf', '.svg': 'image/svg+xml', '.json': 'application/json' }

createServer(async (req, res) => {
  const url = new URL(req.url || '/', origin)
  if (url.pathname === '/api/fonts') {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const r = await handle(new Request(url, { method: req.method, headers: req.headers as Record<string, string>, body: ['GET', 'HEAD'].includes(req.method!) ? undefined : Buffer.concat(chunks) }), store, { GALLERY_ADMIN_TOKEN: 'test-admin' })
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return
  }
  if (url.pathname.startsWith('/_mem/')) {
    const f = files.get(decodeURIComponent(url.pathname.slice(6)))
    if (!f) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': f.type, 'access-control-allow-origin': '*' }); res.end(f.body); return
  }
  const p = normalize(join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)))
  if (!p.startsWith(root)) { res.writeHead(403); res.end(); return }
  try { const b = await readFile(p); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(b) } catch { res.writeHead(404); res.end() }
}).listen(port, () => console.log('devserver', origin))
