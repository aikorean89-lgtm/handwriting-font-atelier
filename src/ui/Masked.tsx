// 모자이크로 가린 자리. 가린 글자는 화면에도, 페이지 코드에도 없다 (그림만 그린다).
// seed가 같으면 늘 같은 무늬라서, 카드마다 모양이 달라도 다시 그릴 때 흔들리지 않는다.

function rng(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

export function Masked({ seed, cols, rows = 2, cell = 8, label, className = '' }: {
  seed: string; cols: number; rows?: number; cell?: number; label: string; className?: string
}) {
  const r = rng(seed)
  const rects = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    rects.push(<rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} opacity={(0.18 + r() * 0.5).toFixed(2)} />)
  }
  return (
    <svg className={`masked ${className}`} width={cols * cell} height={rows * cell} viewBox={`0 0 ${cols * cell} ${rows * cell}`} role="img" aria-label={label}>
      <title>{label}</title>
      {rects}
    </svg>
  )
}
