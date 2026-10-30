// 시트 사진 → 마커 검출 → 원근 보정 → 안내선 제거 → 이진화 → 칸 판정
/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadCV } from './cv'
import { type Bitmap, newBitmap, removeSpecks, countInk } from './bitmap'
import { LAYOUT, PX_PER_MM, PAGE_W, PAGE_H, markerCornersMm, markerOuterCornerMm, parseQrInfo, sheetDef } from './template'

export type CellState = 'ok' | 'empty' | 'skip' | 'overflow'
export interface CellResult {
  index: number
  char: string | null
  state: CellState
  bitmap: Bitmap // 칸 전체 크기(정사각형), 1 = 잉크
}
export interface SheetResult {
  sheetNo: number | null
  suppChars?: string[]
  markersFound: number[]
  sharpness: number
  preview: string // JPEG data URL
  cells: CellResult[]
}

export type Pt = [number, number]

export interface MarkerDetection { ids: number[]; corners: Record<number, Pt[]> }

const INSET_MM = 0.7

export async function fileToCanvas(file: Blob, maxSide = 3600): Promise<HTMLCanvasElement> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
  } catch {
    throw new Error('이 사진 형식을 읽지 못했어요. HEIC라면 JPG로 바꾸거나 카메라로 직접 찍어 주세요.')
  }
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * s)
  c.height = Math.round(bmp.height * s)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return c
}

let detectorCache: any = null
function getDetector(cv: any) {
  if (detectorCache) return detectorCache
  const dict = cv.getPredefinedDictionary(cv.DICT_4X4_50)
  const params = new cv.aruco_DetectorParameters()
  const refine = new cv.aruco_RefineParameters(10, 3, true)
  detectorCache = new cv.aruco_ArucoDetector(dict, params, refine)
  return detectorCache
}

/** 회색조 Mat에서 템플릿 마커(0–3) 검출 */
export function detectMarkersMat(cv: any, gray: any): MarkerDetection {
  const det = getDetector(cv)
  const corners = new cv.MatVector()
  const ids = new cv.Mat()
  const rejected = new cv.MatVector()
  det.detectMarkers(gray, corners, ids, rejected)
  const out: MarkerDetection = { ids: [], corners: {} }
  const nIds = ids.rows * ids.cols
  for (let i = 0; i < nIds; i++) {
    const id = ids.data32S[i]
    if (id < 0 || id > 3 || out.corners[id]) continue
    const m = corners.get(i)
    const pts: Pt[] = []
    for (let k = 0; k < 4; k++) pts.push([m.data32F[k * 2], m.data32F[k * 2 + 1]])
    m.delete()
    out.ids.push(id)
    out.corners[id] = pts
  }
  corners.delete(); ids.delete(); rejected.delete()
  out.ids.sort()
  return out
}

/** 캔버스(또는 비디오 프레임)에서 마커 검출 */
export async function detectMarkersCanvas(canvas: HTMLCanvasElement): Promise<MarkerDetection> {
  const cv = await loadCV()
  const src = cv.imread(canvas)
  const gray = new cv.Mat()
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
  const res = detectMarkersMat(cv, gray)
  src.delete(); gray.delete()
  return res
}

/** 선명도: 라플라시안 분산 (축소 영상 기준) */
export function sharpnessOf(cv: any, gray: any): number {
  const small = new cv.Mat()
  const s = 900 / Math.max(gray.cols, gray.rows)
  cv.resize(gray, small, new cv.Size(Math.round(gray.cols * s), Math.round(gray.rows * s)))
  const lap = new cv.Mat()
  cv.Laplacian(small, lap, cv.CV_64F)
  const mean = new cv.Mat(), std = new cv.Mat()
  cv.meanStdDev(lap, mean, std)
  const v = std.data64F[0] ** 2
  small.delete(); lap.delete(); mean.delete(); std.delete()
  return v
}

export interface ProcessOptions { manualCorners?: Pt[] /* TL, TR, BR, BL 순 종이 바깥 마커 모서리 */; forceSheet?: number }

export async function processSheet(canvas: HTMLCanvasElement, opts: ProcessOptions = {}): Promise<SheetResult> {
  const cv = await loadCV()
  const src = cv.imread(canvas)
  const gray = new cv.Mat()
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
  const sharpness = sharpnessOf(cv, gray)

  // 1) 대응점 모으기
  const srcPts: number[] = []
  const dstPts: number[] = []
  let found: number[] = []
  if (opts.manualCorners) {
    opts.manualCorners.forEach((p, id) => {
      const d = markerOuterCornerMm(id)
      srcPts.push(p[0], p[1]); dstPts.push(d[0] * PX_PER_MM, d[1] * PX_PER_MM)
    })
    found = [0, 1, 2, 3]
  } else {
    const det = detectMarkersMat(cv, gray)
    found = det.ids
    for (const id of det.ids) {
      const mm = markerCornersMm(id)
      det.corners[id].forEach((p, k) => {
        srcPts.push(p[0], p[1]); dstPts.push(mm[k][0] * PX_PER_MM, mm[k][1] * PX_PER_MM)
      })
    }
  }
  if (found.length < 3) {
    src.delete(); gray.delete()
    const e = new Error('NEED_CORNERS') as Error & { found?: number[] }
    e.found = found
    throw e
  }

  // 2) 원근 보정
  const sMat = cv.matFromArray(srcPts.length / 2, 1, cv.CV_32FC2, srcPts)
  const dMat = cv.matFromArray(dstPts.length / 2, 1, cv.CV_32FC2, dstPts)
  const H = srcPts.length > 8 ? cv.findHomography(sMat, dMat, cv.RANSAC, 6) : cv.getPerspectiveTransform(sMat, dMat)
  const page = new cv.Mat()
  cv.warpPerspective(src, page, H, new cv.Size(PAGE_W, PAGE_H), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255))
  sMat.delete(); dMat.delete(); H.delete(); src.delete(); gray.delete()

  // 3) QR로 시트 번호
  let sheetNo: number | null = opts.forceSheet ?? null
  let suppChars: string[] | undefined
  if (sheetNo == null) {
    const info = readQr(cv, page)
    sheetNo = info?.no ?? null
    suppChars = info?.chars
  }

  // 4) 미리보기
  const preview = matToPreview(cv, page, 720)

  // 5) 하늘색 안내선 제거 + 회색조
  const rgba: Uint8Array = page.data
  const n = PAGE_W * PAGE_H
  const g = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], gg = rgba[i * 4 + 1], b = rgba[i * 4 + 2]
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b)
    const sat = mx === 0 ? 0 : (mx - mn) / mx
    // 파랑 계열(하늘색 인쇄): 파랑이 가장 크고 빨강보다 확실히 큼
    const blueish = b >= gg && b - r > 28 && sat > 0.16 && mx > 90
    g[i] = blueish ? 255 : Math.round(0.299 * r + 0.587 * gg + 0.114 * b)
  }
  page.delete()

  // 6) 배경(조명·그림자) 추정 후 정규화
  const gMat = cv.matFromArray(PAGE_H, PAGE_W, cv.CV_8UC1, g)
  const small = new cv.Mat()
  cv.resize(gMat, small, new cv.Size(PAGE_W / 5, PAGE_H / 5), 0, 0, cv.INTER_AREA)
  const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9))
  cv.dilate(small, small, k)
  cv.GaussianBlur(small, small, new cv.Size(15, 15), 0)
  const bg = new cv.Mat()
  cv.resize(small, bg, new cv.Size(PAGE_W, PAGE_H), 0, 0, cv.INTER_LINEAR)
  const bgd: Uint8Array = bg.data
  const ink = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const bgv = Math.max(bgd[i], 60)
    ink[i] = g[i] < bgv * 0.62 ? 1 : 0
  }
  gMat.delete(); small.delete(); k.delete(); bg.delete()

  // 7) 칸 판정
  const def = sheetNo != null ? sheetDef(sheetNo) : undefined
  const cells: CellResult[] = def ? def.cells.map((c) => cutCell(ink, c)) : []
  return { sheetNo, suppChars, markersFound: found, sharpness, preview, cells }
}

function cutCell(ink: Uint8Array, c: { index: number; char: string | null; cell: [number, number, number, number]; skipMark: [number, number, number] }): CellResult {
  const N = Math.round(c.cell[2] * PX_PER_MM)
  const x0 = Math.round(c.cell[0] * PX_PER_MM), y0 = Math.round(c.cell[1] * PX_PER_MM)
  const inset = Math.round(INSET_MM * PX_PER_MM)
  let bm = newBitmap(N, N)
  let edge = 0
  for (let y = inset; y < N - inset; y++) {
    for (let x = inset; x < N - inset; x++) {
      const v = ink[(y0 + y) * PAGE_W + (x0 + x)]
      if (!v) continue
      bm.data[y * N + x] = 1
      if (x < inset + 3 || y < inset + 3 || x >= N - inset - 3 || y >= N - inset - 3) edge++
    }
  }
  bm = removeSpecks(bm, 14)
  // 건너뛰기 표시: 동그라미 안이 칠해졌는지
  const [cx, cy, r] = c.skipMark.map((v) => v * PX_PER_MM)
  let fill = 0, tot = 0
  const rr = r * 0.75
  for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++) {
    for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > rr * rr) continue
      tot++
      fill += ink[Math.round(y) * PAGE_W + Math.round(x)]
    }
  }
  const area = countInk(bm)
  let state: CellState = 'ok'
  if (tot > 0 && fill / tot > 0.35) state = 'skip'
  else if (area < N * N * 0.002) state = 'empty'
  else if (edge > 24) state = 'overflow'
  return { index: c.index, char: c.char, state, bitmap: bm }
}

function readQr(cv: any, page: any): ReturnType<typeof parseQrInfo> {
  const tries: [number, number, number, number][] = [[168, 5, 22, 22], [160, 0, 36, 32]]
  for (const [x, y, w, h] of tries) {
    const rect = new cv.Rect(x * PX_PER_MM, y * PX_PER_MM, w * PX_PER_MM, h * PX_PER_MM)
    const roi = page.roi(rect)
    const g = new cv.Mat()
    cv.cvtColor(roi, g, cv.COLOR_RGBA2GRAY)
    const qd = new cv.QRCodeDetector()
    let text = ''
    try { text = qd.detectAndDecode(g) } catch { text = '' }
    roi.delete(); g.delete(); qd.delete()
    const info = parseQrInfo(text || '')
    if (info) return info
  }
  return null
}

function matToPreview(cv: any, page: any, width: number): string {
  const s = width / page.cols
  const small = new cv.Mat()
  cv.resize(page, small, new cv.Size(width, Math.round(page.rows * s)), 0, 0, cv.INTER_AREA)
  const c = document.createElement('canvas')
  cv.imshow(c, small)
  small.delete()
  return c.toDataURL('image/jpeg', 0.82)
}

export { LAYOUT }
