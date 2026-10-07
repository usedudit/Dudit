import { NextResponse } from "next/server"
import { validateCronRequest, enqueueTriggerBatch, cronLogger } from "@/lib/internal-cron"
import { getAdminClient } from "@/lib/supabase/admin"
import { runScheduledWhatsappJob } from "@/lib/services/whatsapp-automation.service"

const JOB_NAME = "process-whatsapp-reminders"
const BATCH_SIZE = 100

/**
 * POST /api/internal/jobs/process-whatsapp-reminders
 *
 * Called by cron-job.org to process due WhatsApp scheduled jobs (reminders, etc.).
 *
 * Flow:
 * 1. Validate Bearer INTERNAL_CRON_SECRET
 * 2. Claim due scheduled jobs from DB (WHERE run_at <= NOW()) via atomic RPC
 * 3. If idle (0 jobs), return immediately with 0 Redis/overhead
 * 4. Enqueue each to Trigger.dev "whatsapp-scheduled-job"
 * 5. Fallback: If Trigger.dev is unavailable/unconfigured or fails to enqueue,
 *    execute runScheduledWhatsappJob directly in Next.js.
 * 6. Return summary
 */
export async function POST(req: Request) {
  const startTime = Date.now()

  // 1. Auth validation
  const auth = validateCronRequest(req, JOB_NAME)
  if (!auth.ok) return auth.error

  try {
    cronLogger.start(JOB_NAME)

    // 2. Claim due scheduled jobs using the existing atomic DB RPC
    // The RPC atomically sets status to 'processing' and returns claimed rows
    // Uses run_at <= NOW() - never exact time matching
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
      return NextResponse.json({ success: true, enqueued: 0, failed: 0, executedDirectly: 0 })
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

    let executedDirectly = 0
    let executionFailed = 0

    // 6. Resilient Fallback: If Trigger.dev failed to enqueue (e.g. quota limit, unavailable, or unconfigured),
    // execute runScheduledWhatsappJob directly inside Next.js instead of dropping or perpetually retrying.
    if (result.failed > 0 && result.failedIndices.length > 0) {
      const failedJobs = result.failedIndices.map((idx) => claimedJobs[idx])
      cronLogger.warn(JOB_NAME, `Trigger.dev enqueue failed for ${failedJobs.length} jobs - executing direct fallback`, {
        count: failedJobs.length,
      })

      // Process in small batches of 5 to protect WhatsApp API from sudden spikes
      const CHUNK_SIZE = 5
      for (let i = 0; i < failedJobs.length; i += CHUNK_SIZE) {
        const chunk = failedJobs.slice(i, i + CHUNK_SIZE)
        const settleResults = await Promise.allSettled(
          chunk.map(async (job) => {
            await runScheduledWhatsappJob(job)
          })
        )

        for (let j = 0; j < settleResults.length; j++) {
          const res = settleResults[j]
          const job = chunk[j]
          if (res.status === "fulfilled") {
            executedDirectly++
          } else {
            executionFailed++
            cronLogger.error(JOB_NAME, "Direct fallback execution failed for job", {
              jobId: job.id,
              error: res.reason instanceof Error ? res.reason.message : String(res.reason),
            })
            // Reset only genuinely failed jobs to pending so future sweeps can retry
            await admin
              .from("whatsapp_scheduled_jobs")
              .update({ status: "pending" })
              .eq("id", job.id)
          }
        }
      }
    }

    const durationMs = Date.now() - startTime
    cronLogger.success(JOB_NAME, {
      claimed: claimedJobs.length,
      enqueued: result.enqueued,
      executedDirectly,
      executionFailed,
    }, durationMs)

    return NextResponse.json({
      success: true,
      claimed: claimedJobs.length,
      enqueued: result.enqueued,
      executedDirectly,
      failed: executionFailed,
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
  }
}
