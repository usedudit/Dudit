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
  await redis.setex(key, TTL, JSON.stringify(session))
  return sessionId
}

export async function getImportSession(
  partnerId: string,
  sessionId: string,
): Promise<ImportSession | null> {
  const key = buildKey(partnerId, sessionId)
  const raw = await redis.get<string>(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ImportSession
  } catch {
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
