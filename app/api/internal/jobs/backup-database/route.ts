import { NextResponse } from "next/server"
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

export async function POST(req: Request) {
  const startedAt = Date.now()
  const authError = validateBackupCronRequest(req)
  if (authError) return authError

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
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

  try {
    cronLogger.start(JOB_NAME)
    const result = await runDatabaseBackup()
    cronLogger.success(JOB_NAME, {
      fileName: result.fileName,
      sizeBytes: result.sizeBytes,
      retentionDeleted: result.retentionDeleted,
      retentionRetained: result.retentionRetained,
    }, result.durationMs)

    return NextResponse.json({
      success: true,
      fileName: result.fileName,
      sizeBytes: result.sizeBytes,
      durationMs: result.durationMs,
      retentionDeleted: result.retentionDeleted,
      retentionRetained: result.retentionRetained,
    })
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const errorType = error instanceof Error ? error.name : "UnknownError"
    cronLogger.error(JOB_NAME, "Database backup failed", { durationMs, errorType })
    captureError(new Error("Database backup failed"), {
      module: "database-backup",
      action: "run",
      route: "/api/internal/jobs/backup-database",
      metadata: { duration_ms: durationMs, error_type: errorType },
    })
    await flushMonitoring(3000)
    return NextResponse.json({ success: false, error: "Database backup failed" }, { status: 500 })
  } finally {
    await releaseExecutionLock(lock.lockKey)
  }
}
