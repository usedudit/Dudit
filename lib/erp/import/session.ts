import "server-only"
import { redis } from "@/lib/redis"
import type { ImportSession } from "./types"

const TTL = 7200
const KEY_PREFIX = "import_session:"

function buildKey(partnerId: string, sessionId: string): string {
  return `${KEY_PREFIX}${partnerId}:${sessionId}`
}

export async function createImportSession(
  partnerId: string,
  data: Omit<ImportSession, "createdAt">,
): Promise<string> {
  const sessionId = crypto.randomUUID()
  const key = buildKey(partnerId, sessionId)
  const session: ImportSession = { ...data, createdAt: new Date().toISOString() }

  const payloadPreview = JSON.stringify(session)
  const sizeBytes = new TextEncoder().encode(payloadPreview).length
  if (sizeBytes > 900_000) {
    console.warn(`[ImportSession] Session payload large: ${(sizeBytes / 1024).toFixed(1)} KB — rows=${data.rows.length}, headers=${data.headers.length}`)
  }

  try {
    await redis.set(key, session, { ex: TTL })
    console.log(`[ImportSession] Created session ${sessionId} for partner ${partnerId} (${sizeBytes} bytes, ${data.rows.length} rows, TTL ${TTL}s)`)
  } catch (err) {
    console.error(`[ImportSession] Failed to store session ${sessionId}:`, err)
    throw new Error(`Erro ao salvar sessão de importação no Redis: ${err instanceof Error ? err.message : 'desconhecido'}`)
  }

  return sessionId
}

export async function getImportSession(
  partnerId: string,
  sessionId: string,
): Promise<ImportSession | null> {
  const key = buildKey(partnerId, sessionId)
  try {
    const data = await redis.get<ImportSession>(key)
    if (!data) {
      console.warn(`[ImportSession] Session not found in Redis — key=${key}, partnerId=${partnerId}, sessionId=${sessionId}`)
      return null
    }
    return data
  } catch (err) {
    console.error(`[ImportSession] Redis GET error for key ${key}:`, err)
    return null
  }
}

export async function deleteImportSession(
  partnerId: string,
  sessionId: string,
): Promise<void> {
  const key = buildKey(partnerId, sessionId)
  await redis.del(key)
}
