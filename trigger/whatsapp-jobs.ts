/**
 * Trigger.dev jobs for WhatsApp automation.
 *
 * Trigger.dev is the ONLY async execution layer for WhatsApp jobs.
 * TRIGGER_SECRET_KEY must be configured - there is no fallback.
 */

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

  // ── DEBUG: payload basics ──────────────────────────────────────────
  console.log("[DEBUG] partnerId:", payload.partnerId)
  console.log("[DEBUG] entityId:", payload.entityId)
  console.log("[DEBUG] runAt:", payload.runAt)
  console.log("[DEBUG] computedKey:", idempotencyKey)

  // ── DEBUG: todas as linhas com este entity_id ──────────────────────
  const { data: rows } = await admin
    .from("whatsapp_scheduled_jobs")
    .select("id,idempotency_key,entity_id,partner_id,run_at,status")
    .eq("entity_id", payload.entityId)

  console.log("[DEBUG] rows with entityId:", rows?.length ?? 0)
  for (const row of rows ?? []) {
    console.log("[DEBUG] entityId row:", JSON.stringify(row))
    console.log("[DEBUG] row.key === computedKey:", row.idempotency_key === idempotencyKey)
  }

  // ── DEBUG: ilike por entityId na idempotency_key ───────────────────
  const { data: rows2 } = await admin
    .from("whatsapp_scheduled_jobs")
    .select("id,idempotency_key")
    .ilike("idempotency_key", `%${payload.entityId}%`)

  console.log("[DEBUG] ilike rows:", rows2?.length ?? 0)
  for (const row of rows2 ?? []) {
    console.log("[DEBUG] ilike row:", JSON.stringify(row))
    console.log("[DEBUG] ilike row.key === computedKey:", row.idempotency_key === idempotencyKey)
  }

  // ── Lookup original por idempotency_key ────────────────────────────
  const { data: job } = await admin
    .from("whatsapp_scheduled_jobs")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()

  console.log("[DEBUG] main lookup found:", !!job, "jobId:", job?.id)

  if (job) {
    await runScheduledWhatsappJob(job)
    return
  }

  console.log("[DEBUG] JOB NOT FOUND — stopping without fallback")
}

export async function executeWhatsappRetryBatch(): Promise<{ processed: number }> {
  return processPendingWhatsappMessages(15)
}
