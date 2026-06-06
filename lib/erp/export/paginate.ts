import { EXPORT_CHUNK_SIZE, EXPORT_MAX_ROWS } from "./constants"

export type KeysetCursor = { createdAt: string; id: string } | null

export async function fetchAllPages<T>(params: {
  fetchPage: (cursor: KeysetCursor) => Promise<{ rows: T[]; nextCursor: KeysetCursor }>
  chunkSize?: number
  maxRows?: number
}): Promise<T[]> {
  const chunkSize = params.chunkSize ?? EXPORT_CHUNK_SIZE
  const maxRows = params.maxRows ?? EXPORT_MAX_ROWS
  const all: T[] = []
  let cursor: KeysetCursor = null

  while (all.length < maxRows) {
    const { rows, nextCursor } = await params.fetchPage(cursor)
    if (!rows.length) break
    all.push(...rows)
    if (!nextCursor || rows.length < chunkSize) break
    cursor = nextCursor
  }

  return all.slice(0, maxRows)
}

export function buildKeysetOrFilter(cursor: KeysetCursor, columns = { createdAt: "created_at", id: "id" }) {
  if (!cursor?.createdAt || !cursor?.id) return null
  const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`
  const ts = q(cursor.createdAt)
  const id = q(cursor.id)
  return `${columns.createdAt}.lt.${ts},and(${columns.createdAt}.eq.${ts},${columns.id}.lt.${id})`
}
