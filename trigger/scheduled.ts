import { task } from "@trigger.dev/sdk/v3"
import { executeWhatsappScheduledJob, executeWhatsappRetryBatch } from "./whatsapp-jobs"
import type { WhatsappScheduledJobPayload } from "./whatsapp-jobs"

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
