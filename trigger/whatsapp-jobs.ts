/**
 * Trigger.dev jobs for WhatsApp automation.
 * Falls back to DB scheduled jobs + cron when TRIGGER_SECRET_KEY is not set.
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

export async function triggerWhatsappScheduledJob(payload: WhatsappScheduledJobPayload): Promise<void> {
  if (!process.env.TRIGGER_SECRET_KEY) return

  try {
    const { tasks } = await import("@trigger.dev/sdk/v3")
    await tasks.trigger("whatsapp-scheduled-job", payload, {
      delay: new Date(payload.runAt),
      idempotencyKey: `${payload.jobType}:${payload.entityType}:${payload.entityId}:${payload.runAt}`,
    })
  } catch (err) {
    console.warn("[whatsapp] Trigger.dev unavailable, using cron fallback", err)
  }
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
