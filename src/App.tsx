import { useCallback, useEffect, useRef, useState } from 'react'
import { TopBar } from './ui/common'
import { Home } from './screens/Home'
import { TierScreen } from './screens/Tier'
import { TemplateScreen } from './screens/Template'
import { CaptureScreen } from './screens/Capture'
import { ReviewScreen } from './screens/Review'
import { JamoScreen } from './screens/Jamo'
import { BuildScreen } from './screens/Build'
import { PlayScreen } from './screens/Play'
import { ExportScreen } from './screens/Export'
import { GalleryScreen } from './screens/Gallery'
import { type Cell, type Project, type Sheet, type Step, buildCells, clearProject, loadProject, newProject, saveProject } from './state'
import { type BuildOptions, type BuildResult, buildFont } from './engine/build'
import { SUPP_BASE, sheetDef } from './engine/template'
import { isHangul } from './engine/hangul'
import { segmentScored } from './engine/segment'
import { ensureRefFont } from './engine/refmask'

let faceSeq = 0

export default function App() {
  const [project, setProject] = useState<Project | null>(null)
  const [saved, setSaved] = useState<Project | null>(null)
  const [step, setStep] = useState<Step>(() => (location.hash.startsWith('#gallery') ? 'gallery' : 'home'))
  const [rebuilding, setRebuilding] = useState<number | null>(null)
  const [result, setResult] = useState<BuildResult | null>(null)
  const saveTimer = useRef(0)

  useEffect(() => { loadProject().then((p) => { if (p && Object.keys(p.sheets).length) setSaved(p) }) }, [])

  // 저장 (변경 후 0.6초 뒤)
  useEffect(() => {
    if (!project) return
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => saveProject({ ...project, step, updatedAt: Date.now() }), 600)
  }, [project, step])

  const go = useCallback((s: Step) => {
    setStep(s); window.scrollTo({ top: 0 })
    // 갤러리는 주소로 바로 열 수 있게
    if (s === 'gallery' && !location.hash.startsWith('#gallery')) history.pushState(null, '', '#gallery')
    else if (s !== 'gallery' && location.hash.startsWith('#gallery')) history.pushState(null, '', location.pathname + location.search)
  }, [])
  useEffect(() => {
    const f = () => setStep((cur) => (location.hash.startsWith('#gallery') ? 'gallery' : cur === 'gallery' ? 'home' : cur))
    window.addEventListener('popstate', f)
    return () => window.removeEventListener('popstate', f)
  }, [])

  const update = useCallback((fn: (p: Project) => Project) => setProject((p) => (p ? fn(p) : p)), [])

  const onSheet = useCallback((s: Sheet) => {
    update((p) => {
      const supps = { ...(p.supps ?? {}) }
      if (s.no >= SUPP_BASE && !supps[s.no]) supps[s.no] = sheetDef(s.no)?.cells.map((c) => c.char ?? '') ?? []
      return { ...p, supps, sheets: { ...p.sheets, [s.no]: s } }
    })
    setResult(null)
  }, [update])

  const onCell = useCallback((index: number, patch: Partial<Cell>) => {
    update((p) => {
      const sheets = { ...p.sheets }
      for (const [k, s] of Object.entries(sheets)) {
        const i = s.cells.findIndex((c) => c.index === index)
        if (i < 0) continue
        const cells = s.cells.slice()
        const next = { ...cells[i], ...patch }
        // 건너뛴 칸을 쓰기로 바꾸면 그때 자모를 나눈다
        if (next.include && !next.labels && next.char && isHangul(next.char)) {
          ensureRefFont(next.char)
          const seg = segmentScored(next.bitmap, next.char)
          next.labels = seg.labels; next.segCost = seg.cost
        }
        cells[i] = next
        sheets[+k] = { ...s, cells }
      }
      return { ...p, sheets }
    })
    setResult(null)
  }, [update])

  const applyResult = useCallback((r: BuildResult) => {
    setResult(r)
    const fam = `FontGongbangUser${++faceSeq}`
    const face = new FontFace(fam, r.ttf.buffer.slice(r.ttf.byteOffset, r.ttf.byteOffset + r.ttf.byteLength) as ArrayBuffer)
    face.load().then((f) => {
      document.fonts.add(f)
      document.documentElement.style.setProperty('--font-user', `'${fam}', var(--font-display)`)
    }).catch(() => { /* 미리보기 실패 시 기본 서체 유지 */ })
  }, [])
  const onBuilt = useCallback((r: BuildResult) => { applyResult(r); go('play') }, [applyResult, go])

  // 굵기·자간을 바꿔 그 자리에서 다시 만든다
  const rebuild = useCallback((opts: BuildOptions) => {
    if (!project) return
    update((p) => ({ ...p, settings: opts }))
    setRebuilding(0)
    buildFont(buildCells(project), project.fontName || '내 손글씨', (pr) => {
      const w = { prepare: 0, vector: 0.1, compose: 0.4, write: 0.9, done: 1 }[pr.phase]
      const span = pr.phase === 'vector' ? 0.3 : pr.phase === 'compose' ? 0.5 : 0.1
      setRebuilding(Math.min(1, w + span * (pr.total ? pr.done / pr.total : 0)))
    }, opts)
      .then((r) => applyResult(r))
      .catch(() => { /* 실패하면 이전 결과 유지 */ })
      .finally(() => setRebuilding(null))
  }, [project, update, applyResult])

  const restart = async () => {
    await clearProject()
    setSaved(null); setProject(null); setResult(null)
    document.documentElement.style.removeProperty('--font-user')
    go('tier')
  }

  // 처음으로: 작업은 그대로 두고 홈으로. 어느 단계였는지 기억해 이어서 하기에 쓴다
  const lastStep = useRef<Step>('template')
  const goHome = () => { if (step !== 'home') lastStep.current = step; go('home') }

  let screen: React.ReactNode = null
  if (step === 'gallery') {
    screen = <GalleryScreen onMake={() => go(project || saved ? 'home' : 'tier')} />
  } else if (step === 'home' || !project && step !== 'tier') {
    const work = project ?? saved
    screen = (
      <Home
        work={work}
        onStartNew={restart}
        onGallery={() => go('gallery')}
        onResume={() => {
          if (!work) return
          setProject(work)
          const s = project ? lastStep.current : work.step
          if ((s === 'play' || s === 'export') && result) { go(s); return }
          go(s === 'play' || s === 'export' ? 'build' : s === 'home' || s === 'tier' ? 'template' : s)
        }}
      />
    )
  } else if (step === 'tier') {
    screen = <TierScreen initial={project?.tier} onPick={(t) => { setProject((p) => (p ? { ...p, tier: t } : newProject(t))); go('template') }} />
  } else if (project) {
    if (step === 'template') screen = <TemplateScreen tier={project.tier} onNext={() => go('capture')} />
    if (step === 'capture') screen = <CaptureScreen project={project} onSheet={onSheet} onNext={() => go('review')} />
    if (step === 'review') screen = <ReviewScreen project={project} onCell={onCell} onNext={() => go('jamo')} onBack={() => go('capture')} />
    if (step === 'jamo') screen = <JamoScreen project={project} onCell={onCell} onNext={() => go('build')} onBack={() => go('review')} />
    if (step === 'build') screen = <BuildScreen project={project} onDone={onBuilt} onBack={() => go('jamo')} />
    if (step === 'play') screen = result ? (
      <PlayScreen
        result={result} flagged={project.flagged} settings={project.settings ?? {}} rebuilding={rebuilding} supps={project.supps ?? {}}
        onFlag={(f) => update((p) => ({ ...p, flagged: f }))} onRebuild={rebuild} onSupp={(s) => update((p) => ({ ...p, supps: s }))}
        onCapture={() => go('capture')} onNext={() => go('export')} onRedo={() => go('jamo')}
      />
    ) : null
    if (step === 'export') screen = result ? <ExportScreen result={result} name={project.fontName} onName={(n) => update((p) => ({ ...p, fontName: n }))} onGallery={() => go('gallery')} /> : null
    if ((step === 'play' || step === 'export') && !result) screen = <BuildScreen project={project} onDone={onBuilt} onBack={() => go('jamo')} />
  }

  return (
    <>
      <TopBar step={step} onHome={goHome} onGallery={() => go('gallery')} />
      {screen}
    </>
  )
}
