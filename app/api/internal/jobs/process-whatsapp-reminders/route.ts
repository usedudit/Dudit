import { NextResponse } from "next/server"
import { validateCronRequest, acquireExecutionLock, releaseExecutionLock, enqueueTriggerBatch, cronLogger } from "@/lib/internal-cron"
import { getAdminClient } from "@/lib/supabase/admin"
import { getLimiter, RateLimitCategory } from "@/lib/rate-limiter"

const JOB_NAME = "process-whatsapp-reminders"
const BATCH_SIZE = 100

/**
 * POST /api/internal/jobs/process-whatsapp-reminders
 *
 * Called by cron-job.org to process due WhatsApp scheduled jobs (reminders, etc.).
 *
 * Flow:
 * 1. Validate Bearer INTERNAL_CRON_SECRET
 * 2. Rate limit by IP (60 req/min)
 * 3. Acquire idempotency lock
 * 4. Claim due scheduled jobs from DB (WHERE run_at <= NOW())
 * 5. Enqueue each to Trigger.dev "whatsapp-scheduled-job"
 * 6. Return quickly
 */
export async function POST(req: Request) {
  const startTime = Date.now()

  // 1. Auth validation
  const auth = validateCronRequest(req, JOB_NAME)
  if (!auth.ok) return auth.error

  // 2. Rate limit by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "cron"
  try {
    const limiter = getLimiter(RateLimitCategory.WEBHOOK)
    const { success } = await limiter.limit(`internal-cron:${ip}`)
    if (!success) {
      cronLogger.warn(JOB_NAME, "Rate limited", { ip })
      return NextResponse.json(
        { success: false, error: "Rate limited" },
        { status: 429 },
      )
    }
  } catch {
    // Rate limiter failure should not block cron execution
  }

  // 3. Idempotency lock
  const lock = await acquireExecutionLock(JOB_NAME)
  if (!lock.acquired) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "lock_active",
    })
  }

  try {
    cronLogger.start(JOB_NAME)

    // 4. Claim due scheduled jobs using the existing DB RPC
    // The RPC atomically sets status to 'processing' and returns claimed rows
    // Uses run_at <= NOW() — never exact time matching
    const admin = getAdminClient()
    const { data: jobs, error } = await admin.rpc("claim_whatsapp_scheduled_jobs", {
      p_limit: BATCH_SIZE,
    })

    if (error) {
      cronLogger.error(JOB_NAME, "Failed to claim scheduled jobs", { error: error.message })
      return NextResponse.json(
        { success: false, error: "Failed to claim jobs" },
        { status: 500 },
      )
    }

    const claimedJobs = (jobs || []) as Array<{
      id: string
      partner_id: string
      job_type: string
      entity_type: string
      entity_id: string
      run_at: string
      payload: Record<string, unknown>
    }>

    if (claimedJobs.length === 0) {
      const durationMs = Date.now() - startTime
      cronLogger.success(JOB_NAME, { enqueued: 0, message: "No due jobs" }, durationMs)
      return NextResponse.json({ success: true, enqueued: 0, failed: 0 })
    }

    // 5. Enqueue each to Trigger.dev with correlation context
    const result = await enqueueTriggerBatch(
      "whatsapp-scheduled-job",
      claimedJobs.map((job) => ({
        payload: {
          partnerId: job.partner_id,
          jobType: job.job_type,
          entityType: job.entity_type,
          entityId: job.entity_id,
          runAt: job.run_at,
        },
        options: {
          idempotencyKey: `scheduled:${job.id}`,
        },
        correlation: {
          jobId: job.id,
          partnerId: job.partner_id,
        },
      })),
      JOB_NAME,
    )

    // Mark any failed-to-enqueue jobs back to pending so they can be retried
    if (result.failed > 0) {
      const failedJobs = claimedJobs.slice(result.enqueued)
      for (const job of failedJobs) {
        await admin
          .from("whatsapp_scheduled_jobs")
          .update({ status: "pending" })
          .eq("id", job.id)
      }
    }

    const durationMs = Date.now() - startTime
    cronLogger.success(JOB_NAME, {
      claimed: claimedJobs.length,
      enqueued: result.enqueued,
      failed: result.failed,
    }, durationMs)

    return NextResponse.json({
      success: true,
      claimed: claimedJobs.length,
      enqueued: result.enqueued,
      failed: result.failed,
      durationMs,
    })
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : "Internal error"
    cronLogger.error(JOB_NAME, "Unexpected error", { error: errorMessage, durationMs })
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    )
  } finally {
    await releaseExecutionLock(lock.lockKey)
  }
}
