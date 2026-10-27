import { after, NextResponse } from "next/server"
import { acquireExecutionLock, cronLogger, releaseExecutionLock } from "@/lib/internal-cron"
import { getLimiter, RateLimitCategory } from "@/lib/rate-limiter"
import { captureError, flushMonitoring } from "@/lib/monitoring/sentry"
import { validateBackupCronRequest } from "@/lib/backup/auth"
import { runDatabaseBackup } from "@/lib/backup/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 3600

const JOB_NAME = "backup-database"
const LOCK_TTL_SECONDS = 60 * 60

function sanitizeBackupError(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const sanitized = raw
    .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, "$1[redacted]@")
    .replace(/((?:password|secret|token|authorization|access[_-]?key)(?:["'\s:=]+))[^\s,}\]]+/gi, "$1[redacted]")
    .replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()

  return (sanitized || "Unknown backup error").slice(0, 300)
}

export async function POST(req: Request) {
  const startedAt = Date.now()
  const authError = validateBackupCronRequest(req)
  if (authError) return authError
  // The bearer secret authenticates the caller; do not key this limit by a
  // client-controlled forwarding header.
  const ip = `job:${JOB_NAME}`
  try {
    const limiter = getLimiter(RateLimitCategory.INTERNAL_CRON)
    const { success } = await limiter.limit(`database-backup:${ip}`)
    if (!success) {
      return NextResponse.json({ success: false, error: "Rate limited" }, { status: 429 })
    }
  } catch {
    // A backup endpoint fails closed when Redis is unavailable. This prevents
    // an unbounded number of expensive pg_dump processes from being started.
    return NextResponse.json({ success: false, error: "Rate limiter unavailable" }, { status: 503 })
  }

  const lock = await acquireExecutionLock(JOB_NAME, LOCK_TTL_SECONDS, { failClosed: true })
  if (!lock.acquired) {
    if (lock.unavailable) {
      return NextResponse.json({ success: false, error: "Execution lock unavailable" }, { status: 503 })
    }
    return NextResponse.json({ success: true, skipped: true, reason: "lock_active" })
  }

  const executeBackup = async () => {
    try {
      cronLogger.start(JOB_NAME)
      const result = await runDatabaseBackup()
      cronLogger.success(JOB_NAME, {
        fileName: result.fileName,
        sizeBytes: result.sizeBytes,
        retentionDeleted: result.retentionDeleted,
        retentionRetained: result.retentionRetained,
      }, result.durationMs)

      return { ok: true as const, result }
    } catch (error) {
      const durationMs = Date.now() - startedAt
      const errorType = error instanceof Error ? error.name : "UnknownError"
      const errorMessage = sanitizeBackupError(error)
      cronLogger.error(JOB_NAME, "Database backup failed", { durationMs, errorType, errorMessage })
      captureError(new Error(errorMessage), {
        module: "database-backup",
        action: "run",
        route: "/api/internal/jobs/backup-database",
        metadata: { duration_ms: durationMs, error_type: errorType, error_message: errorMessage },
      })
      await flushMonitoring(3000)
      return { ok: false as const, error: "Database backup failed" }
    }
  }

  // Execução manual: ?sync=1 espera o dump terminar e devolve o resultado.
  const runSynchronously = new URL(req.url).searchParams.get("sync") === "1"

  if (runSynchronously) {
    try {
      const outcome = await executeBackup()
      if (!outcome.ok) {
        return NextResponse.json({ success: false, error: outcome.error }, { status: 500 })
      }
      return NextResponse.json({ success: true, ...outcome.result })
    } finally {
      await releaseExecutionLock(lock.lockKey)
    }
  }

  // O cron-job.org encerra a conexão em 30s, bem antes de um dump terminar.
  // Devolver 202 imediatamente evita que a execução diária seja marcada como
  // timeout (25 falhas seguidas desativam o job). O dump continua em background
  // via after(), que é suportado no next start; erros vão para Sentry e logs.
  after(async () => {
    try {
      await executeBackup()
    } finally {
      await releaseExecutionLock(lock.lockKey)
    }
  })

  return NextResponse.json(
    { success: true, accepted: true, status: "started" },
    { status: 202 },
  )
}
