import { NextResponse } from "next/server"
import { validateCronRequest, enqueueTriggerBatch, cronLogger } from "@/lib/internal-cron"
import { getAdminClient } from "@/lib/supabase/admin"
import { processWhatsappMessageById } from "@/lib/services/whatsapp-dispatch.service"

const JOB_NAME = "process-pending-automations"
const BATCH_SIZE = 100

/**
 * POST /api/internal/jobs/process-pending-automations
 *
 * Called by cron-job.org to process pending WhatsApp messages.
 *
 * Flow:
 * 1. Validate Bearer INTERNAL_CRON_SECRET
 * 2. Claim pending messages from DB (atomically sets status to 'processing' via FOR UPDATE SKIP LOCKED)
 * 3. If idle (0 messages), return immediately with 0 Redis/overhead
 * 4. Enqueue each to Trigger.dev "whatsapp-send-message"
 * 5. Fallback: If Trigger.dev is unavailable/unconfigured or fails to enqueue,
 *    execute processWhatsappMessageById directly in Next.js.
 * 6. Return summary
 */
export async function POST(req: Request) {
  const startTime = Date.now()

  // 1. Auth validation
  const auth = validateCronRequest(req, JOB_NAME)
  if (!auth.ok) return auth.error

  try {
    cronLogger.start(JOB_NAME)

    // 2. Claim pending messages using the existing atomic DB RPC
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
      return NextResponse.json({ success: true, enqueued: 0, failed: 0, executedDirectly: 0 })
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

    let executedDirectly = 0
    let executionFailed = 0

    // 6. Resilient Fallback: If Trigger.dev failed to enqueue (e.g. quota limit, unavailable, or unconfigured),
    // execute processWhatsappMessageById directly inside Next.js instead of dropping or perpetually retrying.
    if (result.failed > 0 && result.failedIndices.length > 0) {
      const failedMessages = result.failedIndices.map((idx) => messages[idx])
      cronLogger.warn(JOB_NAME, `Trigger.dev enqueue failed for ${failedMessages.length} messages - executing direct fallback`, {
        count: failedMessages.length,
      })

      // Process in small batches of 5 to protect WhatsApp API from sudden bursts
      const CHUNK_SIZE = 5
      for (let i = 0; i < failedMessages.length; i += CHUNK_SIZE) {
        const chunk = failedMessages.slice(i, i + CHUNK_SIZE)
        const settleResults = await Promise.allSettled(
          chunk.map(async (msg) => {
            await processWhatsappMessageById(String(msg.id))
          })
        )

        for (let j = 0; j < settleResults.length; j++) {
          const res = settleResults[j]
          const msg = chunk[j]
          if (res.status === "fulfilled") {
            executedDirectly++
          } else {
            executionFailed++
            cronLogger.error(JOB_NAME, "Direct fallback execution failed for message", {
              messageId: String(msg.id),
              error: res.reason instanceof Error ? res.reason.message : String(res.reason),
            })
            // Reset to pending so future sweeps can retry
            await admin
              .from("whatsapp_messages")
              .update({ status: "pending" })
              .eq("id", String(msg.id))
          }
        }
      }
    }

    const durationMs = Date.now() - startTime
    cronLogger.success(JOB_NAME, {
      claimed: messages.length,
      enqueued: result.enqueued,
      executedDirectly,
      executionFailed,
    }, durationMs)

    return NextResponse.json({
      success: true,
      claimed: messages.length,
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
