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
      let plannedReport = deletion.checkpoints?.planned_report
      if (!plannedReport) {
        plannedReport = await step.run("pre-delete-report", async () => {
          const report = await AccountDeletionService.getPreDeleteReport(payload.partnerId, payload.userId)
          
          // Save planned report in DB
          const { data: cur } = await admin
            .from("account_deletions")
            .select("checkpoints")
            .eq("id", payload.deletionId)
            .maybeSingle()
          
          const updatedCheckpoints = {
            ...(cur?.checkpoints || {}),
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
      }

      // ───────────────────────────────────────────────────────────────────────
      // Step 1: Cloudflare R2 Purge (deleting_storage)
      // ───────────────────────────────────────────────────────────────────────
      let filesDeleted = deletion.checkpoints?.step_status?.deleting_storage?.filesDeleted || 0
      let deletingStorageCompleted = deletion.checkpoints?.step_status?.deleting_storage?.completed || false

      if (!deletingStorageCompleted) {
        await admin
          .from("account_deletions")
          .update({ status: "deleting_storage" })
          .eq("id", payload.deletionId)

        filesDeleted = await step.run("purge-cloudflare-r2", async () => {
          return await AccountDeletionService.purgeCloudflareR2(payload.userId)
        })

        const { data: cur } = await admin
          .from("account_deletions")
          .select("checkpoints")
          .eq("id", payload.deletionId)
          .maybeSingle()

        const stepStatus = cur?.checkpoints?.step_status || {}
        stepStatus.deleting_storage = { completed: true, filesDeleted }

        await admin
          .from("account_deletions")
          .update({ checkpoints: { ...(cur?.checkpoints || {}), step_status: stepStatus } })
          .eq("id", payload.deletionId)
      }

      // ───────────────────────────────────────────────────────────────────────
      // Step 2: Evolution WhatsApp & MP Customer Cancel (deleting_external_services)
      // ───────────────────────────────────────────────────────────────────────
      let whatsappDisconnected = deletion.checkpoints?.step_status?.deleting_external_services?.whatsappDisconnected || 0
      let deletingExtCompleted = deletion.checkpoints?.step_status?.deleting_external_services?.completed || false

      if (!deletingExtCompleted) {
        await admin
          .from("account_deletions")
          .update({ status: "deleting_external_services" })
          .eq("id", payload.deletionId)

        whatsappDisconnected = await step.run("disconnect-whatsapp", async () => {
          if (payload.partnerId) {
            return await AccountDeletionService.disconnectWhatsApp(payload.partnerId)
          }
          return 0
        })

        await step.run("cancel-customer-subscriptions", async () => {
          if (payload.partnerId) {
            await AccountDeletionService.cancelCustomerSubscriptions(payload.partnerId)
          }
        })

        const { data: cur } = await admin
          .from("account_deletions")
          .select("checkpoints")
          .eq("id", payload.deletionId)
          .maybeSingle()

        const stepStatus = cur?.checkpoints?.step_status || {}
        stepStatus.deleting_external_services = { completed: true, whatsappDisconnected }

        await admin
          .from("account_deletions")
          .update({ checkpoints: { ...(cur?.checkpoints || {}), step_status: stepStatus } })
          .eq("id", payload.deletionId)
      }

      // ───────────────────────────────────────────────────────────────────────
      // Step 3: Clear Redis Caches & Indexers (deleting_marketplace)
      // ───────────────────────────────────────────────────────────────────────
      let deletingMarketplaceCompleted = deletion.checkpoints?.step_status?.deleting_marketplace?.completed || false

      if (!deletingMarketplaceCompleted) {
        await admin
          .from("account_deletions")
          .update({ status: "deleting_marketplace" })
          .eq("id", payload.deletionId)

        await step.run("purge-redis-cache", async () => {
          await AccountDeletionService.purgeRedis(payload.partnerId, payload.userId)
        })

        const { data: cur } = await admin
          .from("account_deletions")
          .select("checkpoints")
          .eq("id", payload.deletionId)
          .maybeSingle()

        const stepStatus = cur?.checkpoints?.step_status || {}
        stepStatus.deleting_marketplace = { completed: true }

        await admin
          .from("account_deletions")
          .update({ checkpoints: { ...(cur?.checkpoints || {}), step_status: stepStatus } })
          .eq("id", payload.deletionId)
      }

      // ───────────────────────────────────────────────────────────────────────
      // Step 4: Transactional DB Purge & Anonymization (deleting_database)
      // ───────────────────────────────────────────────────────────────────────
      let dbRowsDeleted = deletion.checkpoints?.step_status?.deleting_database?.dbRowsDeleted || 0
      let ordersAnonymized = deletion.checkpoints?.step_status?.deleting_database?.ordersAnonymized || 0
      let deletingDbCompleted = deletion.checkpoints?.step_status?.deleting_database?.completed || false

      if (!deletingDbCompleted) {
        await admin
          .from("account_deletions")
          .update({ status: "deleting_database" })
          .eq("id", payload.deletionId)

        dbRowsDeleted = await step.run("purge-database-records", async () => {
          return await AccountDeletionService.purgeDatabase(payload.partnerId, payload.userId)
        })

        ordersAnonymized = await step.run("anonymize-compliance-data", async () => {
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

        const { data: cur } = await admin
          .from("account_deletions")
          .select("checkpoints")
          .eq("id", payload.deletionId)
          .maybeSingle()

        const stepStatus = cur?.checkpoints?.step_status || {}
        stepStatus.deleting_database = { completed: true, dbRowsDeleted, ordersAnonymized }

        await admin
          .from("account_deletions")
          .update({ checkpoints: { ...(cur?.checkpoints || {}), step_status: stepStatus } })
          .eq("id", payload.deletionId)
      }

      // ───────────────────────────────────────────────────────────────────────
      // Step 5: Delete Supabase Auth User (deleting_auth)
      // ───────────────────────────────────────────────────────────────────────
      let deletingAuthCompleted = deletion.checkpoints?.step_status?.deleting_auth?.completed || false

      if (!deletingAuthCompleted) {
        await admin
          .from("account_deletions")
          .update({ status: "deleting_auth" })
          .eq("id", payload.deletionId)

        await step.run("delete-supabase-auth-user", async () => {
          await AccountDeletionService.deleteAuthUser(payload.userId)
        })

        const { data: cur } = await admin
          .from("account_deletions")
          .select("checkpoints")
          .eq("id", payload.deletionId)
          .maybeSingle()

        const stepStatus = cur?.checkpoints?.step_status || {}
        stepStatus.deleting_auth = { completed: true }

        await admin
          .from("account_deletions")
          .update({ checkpoints: { ...(cur?.checkpoints || {}), step_status: stepStatus } })
          .eq("id", payload.deletionId)
      }

      // ───────────────────────────────────────────────────────────────────────
      // Step 6: Post-Delete Volumetry Report & Success
      // ───────────────────────────────────────────────────────────────────────
      await step.run("post-delete-report-and-finalize", async () => {
        const executionTime = Date.now() - startTime

        const actualReport = {
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
