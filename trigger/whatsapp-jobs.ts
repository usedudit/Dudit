/**
 * Trigger.dev jobs for WhatsApp automation.
 *
 * Trigger.dev is the ONLY async execution layer for WhatsApp jobs.
 * TRIGGER_SECRET_KEY must be configured - there is no fallback.
 */

import { randomUUID } from "crypto"
import { runScheduledWhatsappJob } from "@/lib/services/whatsapp-automation.service"
import { processPendingWhatsappMessages } from "@/lib/services/whatsapp-dispatch.service"
import { getAdminClient } from "@/lib/supabase/admin"

export type WhatsappScheduledJobPayload = {
  partnerId: string
  jobType: string
  entityType: string
  entityId: string
  runAt: string
}

/**
 * Enqueue a scheduled WhatsApp job via Trigger.dev.
 *
 * TRIGGER_SECRET_KEY is required. If not set, throws an explicit error.
 * No silent fallbacks - the system must be properly configured.
 */
export async function triggerWhatsappScheduledJob(payload: WhatsappScheduledJobPayload): Promise<void> {
  if (!process.env.TRIGGER_SECRET_KEY) {
    throw new Error(
      "[whatsapp] TRIGGER_SECRET_KEY is required. Configure Trigger.dev to enable WhatsApp job scheduling."
    )
  }

  // @ts-ignore
  const { tasks } = await import("@trigger.dev/sdk/v3")
  await tasks.trigger("whatsapp-scheduled-job", payload, {
    delay: new Date(payload.runAt),
    idempotencyKey: `${payload.jobType}:${payload.entityType}:${payload.entityId}:${payload.runAt}`,
  })
}

export async function executeWhatsappScheduledJob(payload: WhatsappScheduledJobPayload): Promise<void> {
  const admin = getAdminClient()
  const idempotencyKey = `${payload.jobType}:${payload.entityType}:${payload.entityId}:${payload.runAt.slice(0, 16)}`

  const { data: job } = await admin
    .from("whatsapp_scheduled_jobs")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()

  if (job) {
    await runScheduledWhatsappJob(job)
    return
  }

  await runScheduledWhatsappJob({
    id: randomUUID(),
    partner_id: payload.partnerId,
    job_type: payload.jobType,
    entity_type: payload.entityType,
    entity_id: payload.entityId,
    payload: {},
  })
}

export async function executeWhatsappRetryBatch(): Promise<{ processed: number }> {
  return processPendingWhatsappMessages(15)
}
