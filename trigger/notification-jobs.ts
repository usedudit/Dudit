import { randomUUID } from "crypto"
import { runScheduledNotificationJob } from "@/lib/services/notification-automation.service"
import { getAdminClient } from "@/lib/supabase/admin"

export type NotificationScheduledJobPayload = {
  partnerId: string | null
  jobType: string
  entityType: string
  entityId: string
  runAt: string
}

export async function triggerNotificationScheduledJob(
  payload: NotificationScheduledJobPayload,
): Promise<void> {
  if (!process.env.TRIGGER_SECRET_KEY) {
    throw new Error(
      "[notifications] TRIGGER_SECRET_KEY is required for scheduled notification jobs.",
    )
  }

  const { tasks } = await import("@trigger.dev/sdk/v3")
  await tasks.trigger("notification-scheduled-job", payload, {
    delay: new Date(payload.runAt),
    idempotencyKey: `${payload.jobType}:${payload.entityType}:${payload.entityId}:${payload.runAt}`,
  })
}

export async function executeNotificationScheduledJob(
  payload: NotificationScheduledJobPayload,
): Promise<void> {
  const admin = getAdminClient()
  const idempotencyKey = `${payload.jobType}:${payload.entityType}:${payload.entityId}:${payload.runAt.slice(0, 16)}`

  const { data: job } = await admin
    .from("notification_scheduled_jobs")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()

  if (job) {
    await runScheduledNotificationJob(job)
    return
  }

  await runScheduledNotificationJob({
    id: randomUUID(),
    job_type: payload.jobType,
    entity_type: payload.entityType,
    entity_id: payload.entityId,
    partner_id: payload.partnerId,
    payload: {},
  })
}
