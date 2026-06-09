import { task } from "@trigger.dev/sdk/v3"
import { executeWhatsappScheduledJob, executeWhatsappRetryBatch } from "./whatsapp-jobs"
import { processWhatsappMessageById } from "@/lib/services/whatsapp-dispatch.service"
import type { WhatsappScheduledJobPayload } from "./whatsapp-jobs"
import { processPendingModerationJobs } from "@/lib/moderation/process-moderation-jobs"
import {
  executeNotificationScheduledJob,
  type NotificationScheduledJobPayload,
} from "./notification-jobs"

export const whatsappScheduledJob = task({
  id: "whatsapp-scheduled-job",
  retry: {
    maxAttempts: 5,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 120000,
  },
  run: async (payload: WhatsappScheduledJobPayload) => {
    await executeWhatsappScheduledJob(payload)
  },
})

export const whatsappRetryFailedSends = task({
  id: "whatsapp-retry-failed-sends",
  retry: { maxAttempts: 3 },
  run: async () => {
    const result = await executeWhatsappRetryBatch()
    return result
  },
})

/**
 * New task: Process a single WhatsApp message by ID.
 *
 * Enqueued by the cron endpoints (process-pending-automations, retry-failed-whatsapp).
 * Each message is processed independently for isolation and scalability.
 */
export const whatsappSendMessage = task({
  id: "whatsapp-send-message",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 3000,
    maxTimeoutInMs: 60000,
  },
  run: async (payload: { messageId: string }) => {
    await processWhatsappMessageById(payload.messageId)
  },
})

/**
 * Processa jobs de moderação de texto pendentes.
 * Chamado a cada 5 minutos via cron-job.org → /api/moderation/process
 * Usa Llama Guard 3 (Cloudflare AI) para moderar nomes e descrições.
 */
export const notificationScheduledJob = task({
  id: "notification-scheduled-job",
  retry: {
    maxAttempts: 5,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 120000,
  },
  run: async (payload: NotificationScheduledJobPayload) => {
    await executeNotificationScheduledJob(payload)
  },
})

export const moderationTextJob = task({
  id: "moderation-text-job",
  retry: {
    maxAttempts: 1,
  },
  run: async () => {
    const metrics = await processPendingModerationJobs()
    return metrics
  },
})
