import { Children, Fragment, type ReactNode } from 'react'

// 화면 안내문: 한 문장이 끝나면 줄을 바꾼다 (문장 끝 . ! ? 뒤의 띄어쓰기에서 나눈다)
// 정규식 뒤돌아보기((?<=…))는 iPadOS 16.3 이하에서 앱 전체를 멈추게 하므로 쓰지 않는다
const END = /([.!?][’”)]?)\s+(?=\S)/
function sentences(t: string): string[] {
  const p = t.split(END) // [문장, 끝맺음, 문장, 끝맺음, …, 문장]
  const out: string[] = []
  for (let i = 0; i < p.length; i += 2) out.push(p[i] + (p[i + 1] ?? ''))
  return out
}

export function lines(node: ReactNode): ReactNode {
  // 이어진 글 조각(문자열·숫자)은 하나로 합친 뒤 나눈다: {'첫 문장.'} 둘째 문장. 처럼 나뉘어 있어도 줄이 바뀌게
  const merged: ReactNode[] = []
  for (const c of Children.toArray(node)) {
    const last = merged[merged.length - 1]
    if ((typeof c === 'string' || typeof c === 'number') && typeof last === 'string') merged[merged.length - 1] = last + String(c)
    else merged.push(typeof c === 'number' ? String(c) : c)
  }
  let k = 0
  return merged.flatMap((c) => {
    if (typeof c !== 'string') return [c]
    return sentences(c).map((p, i) => <Fragment key={`l${k++}`}>{i > 0 && <br />}{p}</Fragment>)
  })
}
