// 글씨 성장 기록: 만든 폰트를 이 기기에 날짜와 함께 보관한다 (IndexedDB)
import { get, set } from 'idb-keyval'

export interface Record { id: string; name: string; label: string; createdAt: number; direct: number; ttf: Uint8Array }
const KEY = 'fontgongbang.history.v1'
export const MAX_RECORDS = 16

export async function listRecords(): Promise<Record[]> {
  try { return ((await get(KEY)) as Record[] | undefined) ?? [] } catch { return [] }
}

export async function addRecord(r: Omit<Record, 'id' | 'createdAt'>): Promise<Record> {
  const list = await listRecords()
  const rec: Record = { ...r, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: Date.now() }
  const next = [rec, ...list].slice(0, MAX_RECORDS)
  await set(KEY, next)
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
