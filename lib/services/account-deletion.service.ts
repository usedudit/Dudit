import "server-only"
import { getAdminClient } from "@/lib/supabase/admin"
import { cancelMpSubscription } from "@/lib/services/mercadopago/subscriptions"
import { decrypt } from "@/lib/cryptoService"
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3"
import { getR2ServerConfig } from "@/lib/r2/r2-server-config"
import { SecureLogger } from "@/lib/secure-logger"
import { auditLog } from "@/lib/security/audit-logger"
import { redis } from "@/lib/redis"
import crypto from "crypto"

export interface PreDeleteReport {
  productsCount: number
  servicesCount: number
  ordersCount: number
  customersCount: number
  suppliersCount: number
  quotesCount: number
  filesCount: number
  whatsappCount: number
  serviceOrdersCount: number
  appointmentsCount: number
  returnRequestsCount: number
  redisKeysCount: number
  estimatedTimeMs: number
}

export interface PostDeleteReport {
  productsDeleted: number
  servicesDeleted: number
  ordersAnonymized: number
  filesDeleted: number
  whatsappDisconnected: number
}

export class AccountDeletionService {
  /**
   * Asserts that a partner is NOT in a pending deletion or deleting status.
   * Throws ForbiddenError if the account is locked.
   */
  static async assertNotLocked(partnerId: string): Promise<void> {
    const admin = getAdminClient()
    const { data: deletion } = await admin
      .from("account_deletions")
      .select("status")
      .eq("partner_id", partnerId)
      .not("status", "eq", "completed")
      .maybeSingle()

    if (deletion) {
      const { ForbiddenError } = await import("@/lib/auth/authorization")
      throw new ForbiddenError("Esta conta está em processo de exclusão pendente ou em andamento.")
    }
  }

  /**
   * Request account deletion (Fase I).
   * Suspends billing, schedules the grace period, and queues the Trigger.dev workflow.
   */
  static async requestDeletion(
    userId: string,
    reason: string | null,
    ip: string,
    userAgent: string | null,
    country: string
  ): Promise<{ success: boolean; gracePeriodEndsAt?: string; error?: string }> {
    const admin = getAdminClient()

    // 1. Get active partner of the user
    const { data: partner, error: partnerError } = await admin
      .from("partners")
      .select("id, user_id")
      .eq("user_id", userId)
      .maybeSingle()

    if (partnerError) {
      SecureLogger.error("Failed to query partner during deletion request", { userId, error: partnerError.message })
      return { success: false, error: "Erro ao buscar dados do parceiro." }
    }

    const partnerId = partner?.id || null

    // 2. Check if a deletion is already pending
    const { data: existingDeletion } = await admin
      .from("account_deletions")
      .select("id, status")
      .eq("user_id", userId)
      .not("status", "eq", "completed")
      .maybeSingle()

    if (existingDeletion) {
      return { success: false, error: "Já existe uma solicitação de exclusão pendente para esta conta." }
    }

    // 3. Grace period is 48 hours
    const requestedAt = new Date()
    const gracePeriodEndsAt = new Date(requestedAt.getTime() + 48 * 60 * 60 * 1000)

    // 4. Create the deletion record
    const { data: deletion, error: insertError } = await admin
      .from("account_deletions")
      .insert({
        user_id: userId,
        partner_id: partnerId,
        status: "pending_deletion",
        requested_at: requestedAt.toISOString(),
        grace_period_ends_at: gracePeriodEndsAt.toISOString(),
        request_ip: ip || "unknown",
        request_country: country || "BR",
        user_agent: userAgent || null,
        reason: reason || null,
        checkpoints: {
          planned_report: null,
          actual_report: null,
          step_status: {},
          discrepancy_report: null
        }
      })
      .select("id")
      .single()

    if (insertError || !deletion) {
      SecureLogger.error("Failed to create account deletion record", { userId, error: insertError?.message })
      return { success: false, error: "Erro ao registrar solicitação de exclusão." }
    }

    // 5. Cancel platform subscription immediately (billing stops)
    if (partnerId) {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("id, mercado_pago_subscription_id")
        .eq("partner_id", partnerId)
        .eq("status", "active")
        .maybeSingle()

      if (sub) {
        await admin
          .from("account_deletions")
          .update({ status: "cancelling_subscription" })
          .eq("id", deletion.id)

        try {
          const cancelResult = await cancelMpSubscription(sub.id, userId)
          if (!cancelResult.success) {
            SecureLogger.warn("Platform MP subscription cancellation failed during request phase", {
              partnerId,
              subId: sub.id,
              error: cancelResult.error
            })
          }
        } catch (mpErr) {
          SecureLogger.error("Failed to call MP cancellation during request phase", { partnerId, error: mpErr })
        }
      }
    }

    // Update status to waiting grace period
    await admin
      .from("account_deletions")
      .update({ status: "waiting_grace_period" })
      .eq("id", deletion.id)

    // 6. Queue Trigger.dev workflow task
    try {
      if (process.env.TRIGGER_SECRET_KEY) {
        // @ts-ignore
        const { tasks } = await import("@trigger.dev/sdk/v3")
        const run = await tasks.trigger("account-deletion-task", {
          deletionId: deletion.id,
          userId,
          partnerId
        }, {
          delay: "48h"
        })

        await admin
          .from("account_deletions")
          .update({ trigger_run_id: run.id })
          .eq("id", deletion.id)
      } else {
        SecureLogger.warn("TRIGGER_SECRET_KEY not set. Account deletion scheduled locally in DB, but Trigger.dev task was not enqueued.", { deletionId: deletion.id })
      }
    } catch (triggerErr) {
      SecureLogger.error("Failed to enqueue Trigger.dev deletion task", { deletionId: deletion.id, error: triggerErr })
    }

    await auditLog({
      action: "account.deletion_requested" as any,
      actorUserId: userId,
      partnerId,
      metadata: { grace_period_ends_at: gracePeriodEndsAt.toISOString(), reason }
    })

    return { success: true, gracePeriodEndsAt: gracePeriodEndsAt.toISOString() }
  }

  /**
   * Cancel pending account deletion.
   * Restores status and cancels the Trigger.dev task run.
   */
  static async cancelDeletion(userId: string): Promise<{ success: boolean; error?: string }> {
    const admin = getAdminClient()

    const { data: deletion, error: queryError } = await admin
      .from("account_deletions")
      .select("id, partner_id, trigger_run_id, status")
      .eq("user_id", userId)
      .not("status", "eq", "completed")
      .maybeSingle()

    if (queryError || !deletion) {
      return { success: false, error: "Nenhuma solicitação de exclusão ativa encontrada." }
    }

    if (deletion.status !== "waiting_grace_period" && deletion.status !== "pending_deletion") {
      return { success: false, error: "A exclusão da conta já entrou em fase de processamento final e não pode ser cancelada." }
    }

    // Cancel Trigger.dev run if running/scheduled
    if (deletion.trigger_run_id && process.env.TRIGGER_SECRET_KEY) {
      try {
        // @ts-ignore
        const { runs } = await import("@trigger.dev/sdk/v3")
        await runs.cancel(deletion.trigger_run_id)
      } catch (cancelErr) {
        SecureLogger.error("Failed to cancel scheduled Trigger.dev run", { runId: deletion.trigger_run_id, error: cancelErr })
      }
    }

    // Remove the deletion tracking record
    const { error: deleteError } = await admin
      .from("account_deletions")
      .delete()
      .eq("id", deletion.id)

    if (deleteError) {
      SecureLogger.error("Failed to delete account_deletions tracking record", { deletionId: deletion.id, error: deleteError.message })
      return { success: false, error: "Erro ao restaurar a conta." }
    }

    await auditLog({
      action: "account.deletion_cancelled" as any,
      actorUserId: userId,
      partnerId: deletion.partner_id,
      metadata: { deletion_id: deletion.id }
    })

    return { success: true }
  }

  /**
   * Get the pre-deletion volumetry report
   */
  static async getPreDeleteReport(partnerId: string | null, userId: string): Promise<PreDeleteReport> {
    const admin = getAdminClient()

    let productsCount = 0
    let servicesCount = 0
    let ordersCount = 0
    let customersCount = 0
    let suppliersCount = 0
    let quotesCount = 0
    let serviceOrdersCount = 0
    let appointmentsCount = 0
    let returnRequestsCount = 0
    let whatsappCount = 0
    let filesCount = 0

    if (partnerId) {
      const [
        { count: prod },
        { count: serv },
        { count: ord },
        { count: cust },
        { count: supp },
        { count: qte },
        { count: so },
        { count: appt },
        { count: rr },
        { count: wa }
      ] = await Promise.all([
        admin.from("products").select("id", { count: "exact", head: true }).eq("partner_id", partnerId),
        admin.from("services").select("id", { count: "exact", head: true }).eq("partner_id", partnerId),
        admin.from("orders").select("id", { count: "exact", head: true }).eq("partner_id", partnerId),
        admin.from("customers").select("id", { count: "exact", head: true }).eq("partner_id", partnerId),
        admin.from("suppliers").select("id", { count: "exact", head: true }).eq("partner_id", partnerId),
        admin.from("quotes").select("id", { count: "exact", head: true }).eq("partner_id", partnerId),
        admin.from("service_orders").select("id", { count: "exact", head: true }).eq("partner_id", partnerId),
        admin.from("appointments").select("id", { count: "exact", head: true }).eq("partner_id", partnerId),
        admin.from("return_requests").select("id", { count: "exact", head: true }).eq("partner_id", partnerId),
        admin.from("partner_whatsapp_connections").select("id", { count: "exact", head: true }).eq("partner_id", partnerId)
      ])

      productsCount = prod || 0
      servicesCount = serv || 0
      ordersCount = ord || 0
      customersCount = cust || 0
      suppliersCount = supp || 0
      quotesCount = qte || 0
      serviceOrdersCount = so || 0
      appointmentsCount = appt || 0
      returnRequestsCount = rr || 0
      whatsappCount = wa || 0
    }

    // Estimate file count from Cloudflare R2
    try {
      const config = getR2ServerConfig()
      if (config.accessKeyId && config.secretAccessKey) {
        const s3 = new S3Client({
          region: "auto",
          credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
          endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`
        })

        const res = await s3.send(new ListObjectsV2Command({
          Bucket: config.bucketName,
          Prefix: `users/${userId}/`
        }))

        filesCount = res.Contents?.length || 0
      }
    } catch (err) {
      SecureLogger.error("Failed to count R2 files in pre-delete report", { userId, error: err })
    }

    const redisKeysCount = partnerId ? (1 + productsCount + servicesCount + 4) : 3
    const estimatedTimeMs = (whatsappCount * 2000) + (filesCount * 50) + 10000

    return {
      productsCount,
      servicesCount,
      ordersCount,
      customersCount,
      suppliersCount,
      quotesCount,
      serviceOrdersCount,
      appointmentsCount,
      returnRequestsCount,
      redisKeysCount,
      estimatedTimeMs,
      filesCount,
      whatsappCount
    }
  }

  /**
   * Execute a simulated delete dry-run, returning what would be deleted.
   */
  static async executeDryRun(userId: string): Promise<{ success: boolean; report?: PreDeleteReport; error?: string }> {
    try {
      const admin = getAdminClient()
      const { data: partner, error: partnerError } = await admin
        .from("partners")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle()

      if (partnerError) {
        return { success: false, error: "Erro ao buscar dados do parceiro." }
      }

      const report = await this.getPreDeleteReport(partner?.id || null, userId)
      return { success: true, report }
    } catch (e: any) {
      SecureLogger.error("Failed to run deletion dry-run simulation", { userId, error: e.message })
      return { success: false, error: "Ocorreu um erro interno ao simular a exclusão." }
    }
  }

  /**
   * Cancel customer preapprovals (subscriptions) linked to the partner.
   */
  static async cancelCustomerSubscriptions(partnerId: string): Promise<number> {
    const admin = getAdminClient()
    let cancelledCount = 0

    // Fetch active customer subscriptions of this partner
    const { data: subs } = await admin
      .from("recurring_subscriptions")
      .select("id, mp_preapproval_id")
      .eq("partner_id", partnerId)
      .not("mp_preapproval_id", "is", null)

    if (subs && subs.length > 0) {
      // Find decrypted token of the partner
      const { data: partner } = await admin
        .from("partners")
        .select("mp_access_token_encrypted")
        .eq("id", partnerId)
        .single()

      if (partner?.mp_access_token_encrypted) {
        const storeAccessToken = decrypt(partner.mp_access_token_encrypted, "mercadopago")

        for (const sub of subs) {
          if (sub.mp_preapproval_id) {
            try {
              const response = await fetch(
                `https://api.mercadopago.com/preapproval/${sub.mp_preapproval_id}`,
                {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${storeAccessToken}`
                  },
                  body: JSON.stringify({ status: "cancelled" })
                }
              )
              if (response.ok) {
                cancelledCount++
              } else {
                SecureLogger.warn("Failed to cancel customer subscription on MP", {
                  mpPreapprovalId: sub.mp_preapproval_id,
                  status: response.status
                })
              }
            } catch (err) {
              SecureLogger.error("Network error cancelling customer subscription on MP", {
                mpPreapprovalId: sub.mp_preapproval_id,
                error: err
              })
            }
          }
        }
      }
    }

    return cancelledCount
  }

  /**
   * Disconnect and delete external WhatsApp instances.
   */
  static async disconnectWhatsApp(partnerId: string): Promise<number> {
    const admin = getAdminClient()
    let disconnectedCount = 0

    const { data: conns } = await admin
      .from("partner_whatsapp_connections")
      .select("id, instance_name, api_key_encrypted")
      .eq("partner_id", partnerId)

    if (conns && conns.length > 0) {
      for (const conn of conns) {
        if (conn.instance_name && conn.api_key_encrypted) {
          try {
            const apiKey = decrypt(conn.api_key_encrypted, "whatsapp")
            // Call WhatsApp Evolution client or API directly to delete instance
            const evoUrl = process.env.WHATSAPP_EVOLUTION_API_URL || "https://api.dudit.com.br/whatsapp"
            const response = await fetch(`${evoUrl}/instance/delete/${conn.instance_name}`, {
              method: "DELETE",
              headers: {
                "apikey": apiKey
              }
            })

            if (response.ok) {
              disconnectedCount++
            } else {
              SecureLogger.warn("Failed to delete WhatsApp instance on Evolution API server", {
                instanceName: conn.instance_name,
                status: response.status
              })
            }
          } catch (err) {
            SecureLogger.error("Error connecting to Evolution API server during deletion", {
              instanceName: conn.instance_name,
              error: err
            })
          }
        }
      }
    }

    return disconnectedCount
  }

  /**
   * Clear Redis keys and indexes.
   */
  static async purgeRedis(partnerId: string | null, userId: string): Promise<void> {
    if (!redis) return

    try {
      const admin = getAdminClient()
      const pipeline = redis.pipeline()

      // 1. Queue deletion of partner import sessions
      pipeline.del(`import_session:${userId}:produtos`)
      pipeline.del(`import_session:${userId}:clientes`)
      pipeline.del(`import_session:${userId}:servicos`)

      if (partnerId) {
        // 2. Delete Vitrine cache
        pipeline.del(`data:v2:loja:${partnerId}`)
        pipeline.zrem("explore:index:vitrines", partnerId)
        pipeline.zrem("explore:index:all", partnerId)

        // 3. Find and queue deletion of all products
        const { data: products } = await admin
          .from("products")
          .select("id")
          .eq("partner_id", partnerId)

        if (products) {
          for (const prod of products) {
            pipeline.del(`data:v2:produto:${prod.id}`)
            pipeline.zrem("explore:index:produtos", prod.id)
            pipeline.zrem("explore:index:all", prod.id)
          }
        }

        // 4. Find and queue deletion of all services
        const { data: services } = await admin
          .from("services")
          .select("id")
          .eq("partner_id", partnerId)

        if (services) {
          for (const serv of services) {
            pipeline.del(`data:v2:servico:${serv.id}`)
            pipeline.zrem("explore:index:servicos", serv.id)
            pipeline.zrem("explore:index:all", serv.id)
          }
        }
      }

      await pipeline.exec()

      // 5. Invalidate global search cache
      const GLOBAL_VERSION_KEY = "marketplace:global_cache_version"
      await redis.incr(GLOBAL_VERSION_KEY)
    } catch (err) {
      SecureLogger.error("Failed to purge Redis cache during deletion", { partnerId, userId, error: err })
    }
  }

  /**
   * Purge files in Cloudflare R2 bucket under user prefix.
   * Performs list -> delete -> list again -> verify empty.
   */
  static async purgeCloudflareR2(userId: string): Promise<number> {
    const config = getR2ServerConfig()
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error("R2 server credentials not found")
    }

    const s3 = new S3Client({
      region: "auto",
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`
    })

    const prefix = `users/${userId}/`
    let deletedCount = 0

    // List objects
    const listRes = await s3.send(new ListObjectsV2Command({
      Bucket: config.bucketName,
      Prefix: prefix
    }))

    const objects = listRes.Contents || []

    if (objects.length > 0) {
      const keys = objects.map(obj => ({ Key: obj.Key! }))

      // Bulk Delete
      const delRes = await s3.send(new DeleteObjectsCommand({
        Bucket: config.bucketName,
        Delete: { Objects: keys }
      }))

      deletedCount = delRes.Deleted?.length || 0

      // Double-check verification listing
      const verifyRes = await s3.send(new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: prefix
      }))

      if (verifyRes.Contents && verifyRes.Contents.length > 0) {
        throw new Error(`R2 Verification Failed: Prefix ${prefix} is not empty after bulk delete. Objects remaining: ${verifyRes.Contents.length}`)
      }
    }

    return deletedCount
  }

  /**
   * Delete transactional records linear from database calling Postgres RPC function.
   */
  static async purgeDatabase(partnerId: string | null, userId: string): Promise<number> {
    const admin = getAdminClient()
    const { data, error } = await admin.rpc("execute_account_deletion_db", {
      p_user_id: userId,
      p_partner_id: partnerId
    })

    if (error) {
      throw new Error(`execute_account_deletion_db function execution failed: ${error.message}`)
    }

    return (data as number) || 0
  }

  /**
   * Anonymize orders, order items, and audit logs.
   * Strip all PII (names, emails, phones, IPs) and insert compliance log.
   */
  static async anonymizeOrdersAndLogs(
    userId: string,
    partnerId: string | null,
    reason: string | null,
    ip: string,
    userAgent: string | null,
    country: string,
    requestedAt: string
  ): Promise<number> {
    const admin = getAdminClient()
    let anonymizedCount = 0

    // Fetch user details for email hashing before deleting
    let emailHash = "unknown"
    let userEmail = ""
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(userId)
      if (authUser?.user?.email) {
        userEmail = authUser.user.email
        emailHash = crypto
          .createHash("sha256")
          .update(userEmail.toLowerCase().trim())
          .digest("hex")
      }
    } catch (e) {
      SecureLogger.error("Failed to query auth user email for compliance log hash", { userId, error: e })
    }

    // Retrieve MP subscription details
    let mpSubscriptionId = null
    let mpCustomerId = null
    if (partnerId) {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("mercado_pago_subscription_id")
        .eq("partner_id", partnerId)
        .maybeSingle()

      mpSubscriptionId = sub?.mercado_pago_subscription_id || null

      const { data: partner } = await admin
        .from("partners")
        .select("mp_customer_id")
        .eq("id", partnerId)
        .maybeSingle()

      mpCustomerId = partner?.mp_customer_id || null
    }

    // 1. Anonymize Orders
    if (partnerId) {
      const { data: orders } = await admin
        .from("orders")
        .update({
          buyer_id: null,
          delivery_address: "[DADOS ANONIMIZADOS - CONTA EXCLUÍDA]",
          notes: null
        })
        .eq("partner_id", partnerId)
        .select("id")

      anonymizedCount += (orders?.length || 0)
    }

    // Also anonymize orders where this user was the buyer!
    const { data: boughtOrders } = await admin
      .from("orders")
      .update({
        buyer_id: null,
        delivery_address: "[DADOS ANONIMIZADOS - CONTA EXCLUÍDA]",
        notes: null
      })
      .eq("buyer_id", userId)
      .select("id")

    anonymizedCount += (boughtOrders?.length || 0)

    // 2. Anonymize Audit Logs
    await admin
      .from("audit_logs")
      .update({
        user_id: null,
        change_lines: null,
        new_values: null
      })
      .eq("user_id", userId)

    await admin
      .from("admin_audit_logs")
      .update({
        admin_user_id: null
      })
      .eq("admin_user_id", userId)

    // 3. Write minimal compliance log
    const workflowVersion = "v3"
    const deletionVersion = "1.0.0"
    const requestedTimestamp = new Date(requestedAt)

    await admin
      .from("compliance_logs")
      .insert({
        user_id: userId,
        partner_id: partnerId,
        email_hash: emailHash,
        mp_subscription_id: mpSubscriptionId,
        mp_customer_id: mpCustomerId,
        request_ip: ip,
        request_country: country,
        user_agent: userAgent,
        request_timestamp: requestedTimestamp.toISOString(),
        deletion_version: deletionVersion,
        workflow_version: workflowVersion,
        deletion_reason: reason
      })

    return anonymizedCount
  }

  /**
   * Delete user from auth (last step).
   */
  static async deleteAuthUser(userId: string): Promise<void> {
    const admin = getAdminClient()
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) {
      throw new Error(`Failed to delete user from Supabase Auth: ${error.message}`)
    }
  }
}
