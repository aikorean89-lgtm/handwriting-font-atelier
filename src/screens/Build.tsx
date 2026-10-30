import { useEffect, useRef, useState } from 'react'
import { Head } from '../ui/common'
import { Mosaic } from '../ui/Mosaic'
import { buildFont, type BuildProgress, type BuildResult } from '../engine/build'
import { buildCells, type Project } from '../state'
import { SCOUNT } from '../engine/hangul'

const PHASES: { k: BuildProgress['phase']; label: string }[] = [
  { k: 'vector', label: '윤곽 따기' }, { k: 'compose', label: '조합' }, { k: 'write', label: '폰트 파일 쓰기' },
]

export function BuildScreen({ project, onDone, onBack }: { project: Project; onDone: (r: BuildResult) => void; onBack: () => void }) {
  const [p, setP] = useState<BuildProgress>({ phase: 'prepare', done: 0, total: 1 })
  const [err, setErr] = useState<string | null>(null)
  const started = useRef(false)
  const [direct, setDirect] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (started.current) return
    started.current = true
    const t0 = performance.now()
    buildFont(buildCells(project), project.fontName || '내 손글씨', (pr) => {
      setP(pr)
      if (pr.direct) setDirect(new Set(pr.direct))
    }, project.settings)
      .then(async (r) => {
        const min = 1400 - (performance.now() - t0) // 채움을 볼 수 있게 최소한만 머문다
        if (min > 0) await new Promise((res) => setTimeout(res, min))
        onDone(r)
      })
      .catch((e) => setErr(e instanceof Error ? e.message : '폰트를 만들지 못했어요.'))
  }, [project, onDone])

  const upTo = p.composedUpTo ?? 0
  const filled = Math.min(SCOUNT, direct.size + Math.round(upTo * (1 - direct.size / SCOUNT)))
  const order = PHASES.findIndex((x) => x.k === p.phase)
  return (
    <main className="wrap screen">
      <Head n="05" title="글자를 채우고 있어요">빨간 칸은 직접 쓴 글자, 밝은 칸은 그 글씨의 자모로 조합한 글자입니다.</Head>
      {err ? (
        <div>
          <div className="error" role="alert">{err}</div>
          <button className="btn" onClick={onBack}>자모 확인으로 돌아가기</button>
        </div>
      ) : (
        <div className="build-stage">
          <Mosaic direct={direct} upTo={upTo} label={`11,172자 중 ${filled}자 완료`} />
          <div className="build-meta">
            <div className="big count" aria-live="polite">{filled.toLocaleString('ko-KR')}<small> / 11,172</small></div>
            <ol className="phases">
              {PHASES.map((ph, i) => <li key={ph.k} className={p.phase === 'done' || i < order ? 'done' : i === order ? 'on' : ''}>{ph.label}</li>)}
            </ol>
          </div>
        </div>
      )}
    </main>
  )
}
