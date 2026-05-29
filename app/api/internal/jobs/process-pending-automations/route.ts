import { NextResponse } from "next/server"
import { validateCronRequest, acquireExecutionLock, releaseExecutionLock, enqueueTriggerBatch, cronLogger } from "@/lib/internal-cron"
import { getAdminClient } from "@/lib/supabase/admin"
import { getLimiter, RateLimitCategory } from "@/lib/rate-limiter"

const JOB_NAME = "process-pending-automations"
const BATCH_SIZE = 100

/**
 * POST /api/internal/jobs/process-pending-automations
 *
 * Called by cron-job.org to process pending WhatsApp messages.
 *
 * Flow:
 * 1. Validate Bearer INTERNAL_CRON_SECRET
 * 2. Rate limit by IP (60 req/min)
 * 3. Acquire idempotency lock
 * 4. Claim pending messages from DB (atomically sets status to 'processing')
 * 5. Enqueue each to Trigger.dev "whatsapp-send-message"
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

    // 4. Claim pending messages using the existing DB RPC
    // The RPC atomically claims messages (sets status to processing/claimed)
    // Only selects messages where scheduled_at IS NULL OR scheduled_at <= NOW()
    const admin = getAdminClient()
    const { data: claimed, error } = await admin.rpc("claim_whatsapp_messages", {
      p_limit: BATCH_SIZE,
    })

    if (error) {
      cronLogger.error(JOB_NAME, "Failed to claim pending messages", { error: error.message })
      return NextResponse.json(
        { success: false, error: "Failed to claim messages" },
        { status: 500 },
      )
    }

    const messages = (claimed || []) as Array<Record<string, unknown>>

    if (messages.length === 0) {
      const durationMs = Date.now() - startTime
      cronLogger.success(JOB_NAME, { enqueued: 0, message: "No pending messages" }, durationMs)
      return NextResponse.json({ success: true, enqueued: 0, failed: 0 })
    }

    // 5. Enqueue each to Trigger.dev with correlation context
    const result = await enqueueTriggerBatch(
      "whatsapp-send-message",
      messages.map((msg) => ({
        payload: { messageId: String(msg.id) },
        options: {
          idempotencyKey: `send:${msg.id}`,
        },
        correlation: {
          messageId: String(msg.id),
          partnerId: String(msg.partner_id),
          appointmentId: msg.appointment_id ? String(msg.appointment_id) : undefined,
          orderId: msg.order_id ? String(msg.order_id) : undefined,
          quoteId: msg.quote_id ? String(msg.quote_id) : undefined,
        },
      })),
      JOB_NAME,
    )

    // Reset failed-to-enqueue messages back to pending
    if (result.failed > 0) {
      const failedMessages = messages.slice(result.enqueued)
      for (const msg of failedMessages) {
        await admin
          .from("whatsapp_messages")
          .update({ status: "pending" })
          .eq("id", String(msg.id))
      }
    }

    const durationMs = Date.now() - startTime
    cronLogger.success(JOB_NAME, {
      claimed: messages.length,
      enqueued: result.enqueued,
      failed: result.failed,
    }, durationMs)

    return NextResponse.json({
      success: true,
      claimed: messages.length,
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
