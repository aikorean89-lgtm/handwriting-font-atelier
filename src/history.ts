// 글씨 성장 기록: 만든 폰트를 이 기기에 날짜와 함께 보관한다 (IndexedDB)
import { get, set } from 'idb-keyval'

export interface Record { id: string; name: string; label: string; createdAt: number; direct: number; ttf: Uint8Array }
const KEY = 'fontgongbang.history.v1'
export const MAX_RECORDS = 16

export async function listRecords(): Promise<Record[]> {
  try { return ((await get(KEY)) as Record[] | undefined) ?? [] } catch { return [] }
}

/** 기록이 가득 찼을 때. 오래된 기록(학기 초 글씨)을 몰래 지우지 않고 사용자가 고르게 한다 */
export class HistoryFull extends Error {
  constructor() { super(`성장 기록이 ${MAX_RECORDS}개로 가득 찼어요.\n성장 기록에서 필요 없는 기록을 지운 뒤 다시 저장해 주세요.`) }
}

export async function addRecord(r: Omit<Record, 'id' | 'createdAt'>): Promise<Record> {
  const list = await listRecords()
  if (list.length >= MAX_RECORDS) throw new HistoryFull()
  const rec: Record = { ...r, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: Date.now() }
  await set(KEY, [rec, ...list])
  return rec
}

export async function removeRecord(id: string) {
  const list = await listRecords()
  await set(KEY, list.filter((r) => r.id !== id))
}

export async function renameRecord(id: string, label: string) {
  const list = await listRecords()
  await set(KEY, list.map((r) => (r.id === id ? { ...r, label } : r)))
}
