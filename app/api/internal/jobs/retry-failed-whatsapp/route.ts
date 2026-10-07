import { NextResponse } from "next/server"
import { validateCronRequest, enqueueTriggerBatch, cronLogger } from "@/lib/internal-cron"
import { getAdminClient } from "@/lib/supabase/admin"
import { processWhatsappMessageById } from "@/lib/services/whatsapp-dispatch.service"

const JOB_NAME = "retry-failed-whatsapp"
const BATCH_SIZE = 100

/** Maximum retries before a message is marked as permanently failed (dead-letter) */
const MAX_PERMANENT_RETRIES = 5

/**
 * POST /api/internal/jobs/retry-failed-whatsapp
 *
 * Called by cron-job.org to retry failed WhatsApp messages.
 *
 * Flow:
 * 1. Validate Bearer INTERNAL_CRON_SECRET
 * 2. Query failed messages that are retryable (retry_count < max, next_retry_at <= NOW())
 * 3. If idle (0 messages), return immediately with 0 Redis/overhead
 * 4. Mark messages that exceeded max retries as dead-letter (failed_permanently)
 * 5. Enqueue retryable messages to Trigger.dev with jitter delay
 * 6. Fallback: If Trigger.dev is unavailable or fails, execute processWhatsappMessageById directly
 * 7. Return summary
 */
export async function POST(req: Request) {
  const startTime = Date.now()

  // 1. Auth validation
  const auth = validateCronRequest(req, JOB_NAME)
  if (!auth.ok) return auth.error

  try {
    cronLogger.start(JOB_NAME)

    const admin = getAdminClient()

    // 4. Query failed messages that are retryable
    // next_retry_at <= NOW() ensures we don't retry too early
    const { data: failedMessages, error: queryError } = await admin
      .from("whatsapp_messages")
      .select("id, partner_id, appointment_id, order_id, quote_id, retry_count, max_retries, error_message, payload")
      .eq("status", "failed")
      .lte("next_retry_at", new Date().toISOString())
      .order("next_retry_at", { ascending: true })
      .limit(BATCH_SIZE)

    if (queryError) {
      cronLogger.error(JOB_NAME, "Failed to query failed messages", { error: queryError.message })
      return NextResponse.json(
        { success: false, error: "Failed to query messages" },
        { status: 500 },
      )
    }

    const messages = (failedMessages || []) as Array<Record<string, unknown>>

    if (messages.length === 0) {
      const durationMs = Date.now() - startTime
      cronLogger.success(JOB_NAME, { enqueued: 0, deadLettered: 0, message: "No retryable messages" }, durationMs)
      return NextResponse.json({ success: true, enqueued: 0, deadLettered: 0, failed: 0, executedDirectly: 0 })
    }

    // 5. Separate: dead-letter vs retryable
    const deadLetterMessages: typeof messages = []
    const retryableMessages: typeof messages = []

    for (const msg of messages) {
      const retryCount = Number(msg.retry_count || 0)
      const maxRetries = Number(msg.max_retries || MAX_PERMANENT_RETRIES)

      if (retryCount >= maxRetries) {
        deadLetterMessages.push(msg)
      } else {
        retryableMessages.push(msg)
      }
    }

    // 6. Mark dead-letter messages as permanently failed
    if (deadLetterMessages.length > 0) {
      for (const msg of deadLetterMessages) {
        await admin
          .from("whatsapp_messages")
          .update({
            status: "failed_permanently",
            error_message: `Dead-letter: exceeded ${msg.max_retries || MAX_PERMANENT_RETRIES} retries. Last error: ${msg.error_message || "unknown"}`,
            failed_at: new Date().toISOString(),
          })
          .eq("id", String(msg.id))

        cronLogger.info(JOB_NAME, "Message moved to dead-letter", {
          messageId: String(msg.id),
          retryCount: Number(msg.retry_count),
          lastError: String(msg.error_message || ""),
        }, {
          messageId: String(msg.id),
          partnerId: String(msg.partner_id),
        })
      }
    }

    // 7. Claim retryable messages (set status to processing to prevent race)
    // and enqueue to Trigger.dev with jitter delay
    if (retryableMessages.length > 0) {
      const retryableIds = retryableMessages.map((m) => String(m.id))
      await admin
        .from("whatsapp_messages")
        .update({ status: "pending" })
        .in("id", retryableIds)
    }

    const result = retryableMessages.length > 0
      ? await enqueueTriggerBatch(
          "whatsapp-send-message",
          retryableMessages.map((msg, index) => {
            // Add jitter: 30-60 seconds staggered per message to avoid burst
            const jitterMs = (30 + Math.floor(Math.random() * 30)) * 1000
            const staggerMs = index * 2000 // 2s stagger between items
            const delayDate = new Date(Date.now() + jitterMs + staggerMs)

            return {
              payload: { messageId: String(msg.id) },
              options: {
                delay: delayDate,
                idempotencyKey: `retry:${msg.id}:${Number(msg.retry_count || 0) + 1}`,
              },
              correlation: {
                messageId: String(msg.id),
                partnerId: String(msg.partner_id),
                appointmentId: msg.appointment_id ? String(msg.appointment_id) : undefined,
                orderId: msg.order_id ? String(msg.order_id) : undefined,
                quoteId: msg.quote_id ? String(msg.quote_id) : undefined,
              },
            }
          }),
          JOB_NAME,
        )
      : { enqueued: 0, failed: 0, failedIndices: [] }

    let executedDirectly = 0
    let executionFailed = 0

    // 8. Resilient Fallback: If Trigger.dev failed to enqueue,
    // execute processWhatsappMessageById directly inside Next.js instead of dropping.
    if (result.failed > 0 && result.failedIndices.length > 0) {
      const failedRetries = result.failedIndices.map((idx) => retryableMessages[idx])
      cronLogger.warn(JOB_NAME, `Trigger.dev enqueue failed for ${failedRetries.length} retries - executing direct fallback`, {
        count: failedRetries.length,
      })

      const CHUNK_SIZE = 5
      for (let i = 0; i < failedRetries.length; i += CHUNK_SIZE) {
        const chunk = failedRetries.slice(i, i + CHUNK_SIZE)
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
            cronLogger.error(JOB_NAME, "Direct fallback retry execution failed for message", {
              messageId: String(msg.id),
              error: res.reason instanceof Error ? res.reason.message : String(res.reason),
            })
            // Reset to failed status with error message
            await admin
              .from("whatsapp_messages")
              .update({ status: "failed" })
              .eq("id", String(msg.id))
          }
        }
      }
    }

    const durationMs = Date.now() - startTime
    cronLogger.success(JOB_NAME, {
      total: messages.length,
      enqueued: result.enqueued,
      deadLettered: deadLetterMessages.length,
      executedDirectly,
      executionFailed,
    }, durationMs)

    return NextResponse.json({
      success: true,
      total: messages.length,
      enqueued: result.enqueued,
      deadLettered: deadLetterMessages.length,
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
