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

  // ── DEBUG: log payload ───────────────────────────────────────────────
  console.log("[DEBUG:execute] payload.jobType:", payload.jobType)
  console.log("[DEBUG:execute] payload.entityType:", payload.entityType)
  console.log("[DEBUG:execute] payload.entityId:", payload.entityId)
  console.log("[DEBUG:execute] payload.runAt:", JSON.stringify(payload.runAt))
  console.log("[DEBUG:execute] payload.runAt.length:", payload.runAt.length)
  console.log("[DEBUG:execute] payload.runAt.slice(0,16):", JSON.stringify(payload.runAt.slice(0, 16)))
  const parsedDate = new Date(payload.runAt)
  console.log("[DEBUG:execute] new Date(payload.runAt).toISOString():", parsedDate.toISOString())
  console.log("[DEBUG:execute] new Date(payload.runAt).toISOString().slice(0,16):", parsedDate.toISOString().slice(0, 16))
  console.log("[DEBUG:execute] computed idempotencyKey:", JSON.stringify(idempotencyKey))
  console.log("[DEBUG:execute] computed idempotencyKey.length:", idempotencyKey.length)

  // ── DEBUG: fallback query por entity_id ──────────────────────────────
  const { data: fallbackRows } = await admin
    .from("whatsapp_scheduled_jobs")
    .select("id, idempotency_key, job_type, entity_type, entity_id, run_at, status, attempts")
    .eq("entity_id", payload.entityId)
    .eq("job_type", payload.jobType)
    .order("created_at", { ascending: false })
    .limit(5)

  console.log("[DEBUG:execute] fallback rows found:", fallbackRows?.length ?? 0)
  for (const row of fallbackRows || []) {
    const dbKey = row.idempotency_key
    console.log("[DEBUG:execute] row:", JSON.stringify({
      id: row.id,
      db_idempotency_key: dbKey,
      db_key_length: dbKey?.length,
      job_type: row.job_type,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      run_at: row.run_at,
      status: row.status,
      attempts: row.attempts,
    }))
    if (dbKey === idempotencyKey) {
      console.log("[DEBUG:execute] KEYS MATCH for row", row.id)
    } else {
      console.log("[DEBUG:execute] KEYS DIFFER for row", row.id)
      console.log("[DEBUG:execute] char codes - computed:", JSON.stringify([...idempotencyKey].map(c => c.charCodeAt(0))))
      console.log("[DEBUG:execute] char codes - db:     ", JSON.stringify([...(dbKey || "")].map(c => c.charCodeAt(0))))
    }
  }

  // ── Tentativa principal (original) ───────────────────────────────────
  const { data: job } = await admin
    .from("whatsapp_scheduled_jobs")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()

  console.log("[DEBUG:execute] main lookup found:", !!job, "jobId:", job?.id)

  if (job) {
    await runScheduledWhatsappJob(job)
    return
  }

  // ── FALLBACK TEMPORÁRIO: se o lookup por chave falhou mas o registro existe ──
  if (fallbackRows && fallbackRows.length > 0) {
    console.log("[DEBUG:execute] FALLBACK: usando primeiro registro por entity_id:", fallbackRows[0].id)
    const { data: fullJob } = await admin
      .from("whatsapp_scheduled_jobs")
      .select("*")
      .eq("id", fallbackRows[0].id)
      .single()
    if (fullJob) {
      await runScheduledWhatsappJob(fullJob)
      return
    }
  }

  console.log("[DEBUG:execute] NENHUM registro encontrado — criando job com randomUUID")
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
