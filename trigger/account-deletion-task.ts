import { task, step } from "@trigger.dev/sdk/v3"
import { AccountDeletionService } from "@/lib/services/account-deletion.service"
import { getAdminClient } from "@/lib/supabase/admin"
import { SecureLogger } from "@/lib/secure-logger"
import crypto from "crypto"

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
    const admin = getAdminClient()
    const startTime = Date.now()

    // 1. Fetch the deletion request to verify it's still valid
    const { data: deletion, error: fetchError } = await admin
      .from("account_deletions")
      .select("*")
      .eq("id", payload.deletionId)
      .maybeSingle()

    if (fetchError || !deletion) {
      SecureLogger.info("Account deletion task aborted: Deletion record not found or cancelled.", { payload })
      return
    }

    if (deletion.status === "completed") {
      SecureLogger.info("Account deletion task aborted: Deletion already completed.", { payload })
      return
    }

    try {
      // ───────────────────────────────────────────────────────────────────────
      // Step 0: Pre-Delete Volumetry Report
      // ───────────────────────────────────────────────────────────────────────
      const plannedReport = await step.run("pre-delete-report", async () => {
        const report = await AccountDeletionService.getPreDeleteReport(payload.partnerId, payload.userId)
        
        // Save planned report in DB
        const updatedCheckpoints = {
          ...deletion.checkpoints,
          planned_report: report
        }
        await admin
          .from("account_deletions")
          .update({
            checkpoints: updatedCheckpoints
          })
          .eq("id", payload.deletionId)

        return report
      })

      // Update status to deleting storage
      await admin
        .from("account_deletions")
        .update({ status: "deleting_storage" })
        .eq("id", payload.deletionId)

      // ───────────────────────────────────────────────────────────────────────
      // Step 1: Cloudflare R2 and WhatsApp Purge
      // ───────────────────────────────────────────────────────────────────────
      const filesDeleted = await step.run("purge-cloudflare-r2", async () => {
        return await AccountDeletionService.purgeCloudflareR2(payload.userId)
      })

      const whatsappDisconnected = await step.run("disconnect-whatsapp", async () => {
        if (payload.partnerId) {
          return await AccountDeletionService.disconnectWhatsApp(payload.partnerId)
        }
        return 0
      })

      // ───────────────────────────────────────────────────────────────────────
      // Step 2: Cancel Mercado Pago Customer Subscriptions
      // ───────────────────────────────────────────────────────────────────────
      await step.run("cancel-customer-subscriptions", async () => {
        if (payload.partnerId) {
          await AccountDeletionService.cancelCustomerSubscriptions(payload.partnerId)
        }
      })

      // ───────────────────────────────────────────────────────────────────────
      // Step 3: Clear Redis Caches
      // ───────────────────────────────────────────────────────────────────────
      await step.run("purge-redis-cache", async () => {
        await AccountDeletionService.purgeRedis(payload.partnerId, payload.userId)
      })

      // Update status to deleting database
      await admin
        .from("account_deletions")
        .update({ status: "deleting_database" })
        .eq("id", payload.deletionId)

      // ───────────────────────────────────────────────────────────────────────
      // Step 4: Transactional DB Purge (linear execution via PG RPC)
      // ───────────────────────────────────────────────────────────────────────
      const dbRowsDeleted = await step.run("purge-database-records", async () => {
        return await AccountDeletionService.purgeDatabase(payload.partnerId, payload.userId)
      })

      // ───────────────────────────────────────────────────────────────────────
      // Step 5: Anonymization and Compliance Log
      // ───────────────────────────────────────────────────────────────────────
      const ordersAnonymized = await step.run("anonymize-compliance-data", async () => {
        return await AccountDeletionService.anonymizeOrdersAndLogs(
          payload.userId,
          payload.partnerId,
          deletion.reason,
          deletion.request_ip,
          deletion.user_agent,
          deletion.request_country,
          deletion.requested_at
        )
      })

      // Update status to deleting auth user
      await admin
        .from("account_deletions")
        .update({ status: "deleting_auth" })
        .eq("id", payload.deletionId)

      // ───────────────────────────────────────────────────────────────────────
      // Step 6: Delete Supabase Auth User
      // ───────────────────────────────────────────────────────────────────────
      await step.run("delete-supabase-auth-user", async () => {
        await AccountDeletionService.deleteAuthUser(payload.userId)
      })

      // ───────────────────────────────────────────────────────────────────────
      // Step 7: Post-Delete Volumetry Report & Success
      // ───────────────────────────────────────────────────────────────────────
      await step.run("post-delete-report-and-finalize", async () => {
        const executionTime = Date.now() - startTime

        const actualReport: PostDeleteReport = {
          productsDeleted: plannedReport.productsCount,
          servicesDeleted: plannedReport.servicesCount,
          ordersAnonymized: ordersAnonymized,
          filesDeleted: filesDeleted,
          whatsappDisconnected: whatsappDisconnected
        }

        // Compare reports and check for discrepancies
        const discrepancies: string[] = []
        if (filesDeleted !== plannedReport.filesCount) {
          discrepancies.push(`File count mismatch: Planned ${plannedReport.filesCount}, deleted ${filesDeleted}`)
        }

        const discrepancyReport = discrepancies.length > 0 ? discrepancies : null

        // Fetch current checkpoints
        const { data: currentDel } = await admin
          .from("account_deletions")
          .select("checkpoints")
          .eq("id", payload.deletionId)
          .maybeSingle()

        const finalCheckpoints = {
          ...(currentDel?.checkpoints || {}),
          actual_report: actualReport,
          discrepancy_report: discrepancyReport
        }

        // Finalize deletion status
        await admin
          .from("account_deletions")
          .update({
            status: "completed",
            checkpoints: finalCheckpoints
          })
          .eq("id", payload.deletionId)

        // Generate and save Deletion Certificate in compliance_logs
        const certificateMetrics = {
          deletionId: payload.deletionId,
          partnerId: payload.partnerId,
          userId: payload.userId,
          startedAt: deletion.requested_at,
          finishedAt: new Date().toISOString(),
          durationMs: executionTime,
          dbRowsRemoved: dbRowsDeleted,
          filesRemoved: filesDeleted,
          redisKeysRemoved: plannedReport.redisKeysCount,
          subscriptionsCancelled: plannedReport.whatsappCount,
          whatsappInstancesRemoved: whatsappDisconnected,
          complianceRetained: "Orders (Orders & Order Items) anonymized and retained for 5 years per Art. 27 CDC; audit logs anonymized and retained for 5 years for security forensics."
        }

        const sha256Report = crypto
          .createHash("sha256")
          .update(JSON.stringify(certificateMetrics))
          .digest("hex")

        const fullCertificate = {
          ...certificateMetrics,
          sha256Report
        }

        // Update the compliance logs record with execution time and certificate
        await admin
          .from("compliance_logs")
          .update({
            execution_time_ms: executionTime,
            certificate: fullCertificate
          })
          .eq("user_id", payload.userId)
      })

    } catch (err: any) {
      SecureLogger.error("Failed executing account deletion workflow", { deletionId: payload.deletionId, error: err.message })
      
      // Update DB record to failed with log
      await admin
        .from("account_deletions")
        .update({
          status: "failed",
          error_log: err.message || "Unknown error occurred"
        })
        .eq("id", payload.deletionId)

      // Re-throw so Trigger.dev retries the task run
      throw err
    }
  },
})
