import { task } from "@trigger.dev/sdk/v3"
import { AccountDeletionService } from "@/lib/services/account-deletion.service"

export type AccountDeletionPayload = {
  deletionId: string
  userId: string
  partnerId: string | null
}

export const accountDeletionTask = task({
  id: "account-deletion-task",
  retry: {
    maxAttempts: 5,
    factor: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 300000
  },
  run: async (payload: AccountDeletionPayload) => {
    await AccountDeletionService.executeDeletionWorkflow(
      payload.deletionId,
      payload.userId,
      payload.partnerId
    )
  },
})
