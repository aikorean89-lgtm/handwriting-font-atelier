import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/** 빌드 결과 파일 목록을 넣은 서비스 워커(sw.js)를 만든다 (오프라인 앱) */
function serviceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'fontgongbang-sw',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir },
    closeBundle() {
      const files: string[] = []
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f)
          if (statSync(p).isDirectory()) walk(p)
          else files.push(relative(outDir, p).split('\\').join('/'))
        }
      }
      walk(outDir)
      // 글꼴 조각(woff/woff2)은 미리 받지 않는다: 화면에 쓰이는 조각만 그때그때 받아 저장된다 (교실에서 한꺼번에 받을 양을 줄인다)
      const list = ['./', ...files.filter((f) => f !== 'sw.js' && f !== 'jaguk.html' && !f.endsWith('.map') && !(f.startsWith('assets/') && /\.woff2?$/.test(f))).map((f) => './' + f)]
      const hash = createHash('sha256')
      for (const f of files) if (f.startsWith('assets/') || f === 'index.html') hash.update(f)
      const sw = readFileSync('sw-template.js', 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify(list))
      writeFileSync(join(outDir, 'sw.js'), sw)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  // 학교 태블릿에 많은 iPadOS 15도 열리게 문법을 낮춰 만든다
  build: { target: ['es2020', 'safari15', 'chrome90', 'firefox90'] },
})
