import "server-only"
import { getAdminClient } from "@/lib/supabase/admin"
import { cancelMpSubscription } from "@/lib/services/mercadopago/subscriptions"
import { decrypt } from "@/lib/cryptoService"
import { MERCADOPAGO_PROVIDER } from "@/lib/services/payments/mercadopago-integration"
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
  whatsappCount: number
  serviceOrdersCount: number
  appointmentsCount: number
  returnRequestsCount: number
  redisKeysCount: number
  estimatedTimeMs: number
  storesCount?: number
  storeNames?: string[]
  membersCount?: number
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
      .not("status", "eq", "failed")
      .maybeSingle()

    if (deletion) {
      const { ForbiddenError } = await import("@/lib/auth/authorization")
      throw new ForbiddenError("Esta conta está em processo de exclusão pendente ou em andamento.")
    }
  }

  /**
   * Request account deletion (Fase I).
   * Validates OWNER role, active Mercado Pago subscription, checks idempotency,
   * creates the deletions record with 'deleting_storage', cancels platform MP subscription,
   * and triggers the Trigger.dev job immediately.
   */
  static async requestDeletion(
    userId: string,
    reason: string | null,
    ip: string,
    userAgent: string | null,
    country: string
  ): Promise<{ success: boolean; error?: string; currentStatus?: string }> {
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

    if (partner) {
      // 1.1. Security rule check: Only OWNER (partners.user_id === userId) can delete
      if (partner.user_id !== userId) {
        return { success: false, error: "Somente o proprietário principal (OWNER) da conta pode realizar a exclusão." }
      }

      // 1.2. Mercado Pago check: block deletion only if there's a subscription
      // that is still actively billing. A subscription scheduled to cancel at
      // period end (cancel_at_period_end=true) has already been told to leave,
      // so it doesn't block account deletion.
      const { data: activeSub } = await admin
        .from("subscriptions")
        .select("id, status, cancel_at_period_end")
        .eq("partner_id", partner.id)
        .in("status", ["active", "trialing", "past_due"])
        .maybeSingle()

      if (activeSub && !activeSub.cancel_at_period_end) {
        return { success: false, error: "active_subscription" }
      }
    }

    // 2. Concurrency/Idempotency check: check if there's an active/in-progress deletion record
    const { data: existingDeletion } = await admin
      .from("account_deletions")
      .select("id, status")
      .eq("user_id", userId)
      .not("status", "eq", "completed")
      .not("status", "eq", "failed")
      .maybeSingle()

    if (existingDeletion) {
      return { success: true, currentStatus: existingDeletion.status }
    }

    const requestedAt = new Date()

    // 3. Create the deletion record
    const { data: deletion, error: insertError } = await admin
      .from("account_deletions")
      .insert({
        user_id: userId,
        user_id_hash: crypto.createHash("sha256").update(userId).digest("hex"),
        partner_id: partnerId,
        status: "deleting_storage",
        requested_at: requestedAt.toISOString(),
        grace_period_ends_at: requestedAt.toISOString(),
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

    // 4. Cancel platform subscription immediately (billing stops)
    if (partnerId) {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("id, mercado_pago_subscription_id")
        .eq("partner_id", partnerId)
        .eq("status", "active")
        .maybeSingle()

      if (sub) {
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

    // 5. Queue Trigger.dev workflow task immediately (zero delay)
    try {
      if (process.env.TRIGGER_SECRET_KEY) {
        // @ts-ignore
        const { tasks } = await import("@trigger.dev/sdk/v3")
        const run = await tasks.trigger("account-deletion-task", {
          deletionId: deletion.id,
          userId,
          partnerId
        })

        await admin
          .from("account_deletions")
          .update({ trigger_run_id: run.id })
          .eq("id", deletion.id)
      } else {
        SecureLogger.warn("TRIGGER_SECRET_KEY not set. Account deletion task was not queued.", { deletionId: deletion.id })
        await admin
          .from("account_deletions")
          .update({ status: "failed", error_log: "TRIGGER_SECRET_KEY is not configured; deletion task was not queued." })
          .eq("id", deletion.id)
        return { success: false, error: "Não foi possível iniciar a exclusão. Tente novamente mais tarde ou contate o suporte." }
      }
    } catch (triggerErr) {
      SecureLogger.error("Failed to enqueue Trigger.dev deletion task", { deletionId: deletion.id, error: triggerErr })
      await admin
        .from("account_deletions")
        .update({ status: "failed", error_log: "Trigger.dev task could not be queued." })
        .eq("id", deletion.id)
      return { success: false, error: "Não foi possível iniciar a exclusão. Tente novamente mais tarde ou contate o suporte." }
    }

    await auditLog({
      action: "account.deletion_requested" as any,
      actorUserId: userId,
      partnerId,
      metadata: { reason }
    })

    return { success: true }
  }

  /**
   * cancelDeletion is now a no-op (carência de 48h removida).
   */
  static async cancelDeletion(userId: string): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: "Cancelamento de exclusão indisponível (carência desativada)." }
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

    let storesCount = 0
    let storeNames: string[] = []
    let membersCount = 0

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
        { count: wa },
        { data: stores },
        { count: members }
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
        admin.from("partner_whatsapp_connections").select("id", { count: "exact", head: true }).eq("partner_id", partnerId),
        admin.from("stores").select("name").eq("partner_id", partnerId),
        admin.from("partner_users").select("id", { count: "exact", head: true }).eq("partner_id", partnerId)
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
      storesCount = stores?.length || 0
      storeNames = stores?.map((s: any) => s.name) || []
      membersCount = members || 0
    }

    const redisKeysCount = partnerId ? (1 + productsCount + servicesCount + 4) : 3
    const estimatedTimeMs = (whatsappCount * 2000) + 10000

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
      whatsappCount,
      storesCount,
      storeNames,
      membersCount
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
    let failures = 0

    const { data: subs, error: subsError } = await admin
      .from("recurring_subscriptions")
      .select("id, mp_preapproval_id")
      .eq("partner_id", partnerId)
      .not("mp_preapproval_id", "is", null)

    if (subsError) {
      throw new Error(`Failed to load customer subscriptions for deletion: ${subsError.message}`)
    }
    if (!subs || subs.length === 0) return 0

    const { data: integration, error: integrationError } = await admin
      .from("partner_integrations")
      .select("access_token_encrypted")
      .eq("partner_id", partnerId)
      .eq("provider_slug", MERCADOPAGO_PROVIDER)
      .maybeSingle()

    if (integrationError) {
      throw new Error(`Failed to load Mercado Pago integration for deletion: ${integrationError.message}`)
    }
    if (!integration?.access_token_encrypted) {
      throw new Error("Cannot verify cancellation of customer subscriptions: Mercado Pago credentials are unavailable.")
    }

    const storeAccessToken = decrypt(integration.access_token_encrypted, MERCADOPAGO_PROVIDER)
    for (const sub of subs) {
      if (!sub.mp_preapproval_id) continue
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
        if (response.ok || response.status === 404) {
          cancelledCount++
        } else {
          failures++
          SecureLogger.warn("Failed to cancel customer subscription on MP", {
            mpPreapprovalId: sub.mp_preapproval_id,
            status: response.status
          })
        }
      } catch (err) {
        failures++
        SecureLogger.error("Network error cancelling customer subscription on MP", {
          mpPreapprovalId: sub.mp_preapproval_id,
          error: err
        })
      }
    }

    if (failures > 0) {
      throw new Error(`Could not verify cancellation of ${failures} Mercado Pago customer subscription(s).`)
    }
    return cancelledCount
  }

  /**
   * Disconnect and delete external WhatsApp instances.
   */
  static async disconnectWhatsApp(partnerId: string): Promise<number> {
    const admin = getAdminClient()
    let disconnectedCount = 0
    let failures = 0

    const { data: conns, error: connectionError } = await admin
      .from("partner_whatsapp_connections")
      .select("id, instance_name, api_key_encrypted")
      .eq("partner_id", partnerId)

    if (connectionError) {
      throw new Error(`Failed to load WhatsApp connections for deletion: ${connectionError.message}`)
    }

    for (const conn of conns || []) {
      if (!conn.instance_name || !conn.api_key_encrypted) {
        failures++
        SecureLogger.warn("WhatsApp connection is missing deletion credentials", { connectionId: conn.id })
        continue
      }

      try {
        const apiKey = decrypt(conn.api_key_encrypted, "whatsapp")
        const evoUrl = process.env.WHATSAPP_EVOLUTION_API_URL || "https://api.dudit.com.br/whatsapp"
        const response = await fetch(`${evoUrl}/instance/delete/${conn.instance_name}`, {
          method: "DELETE",
          headers: { apikey: apiKey }
        })

        if (response.ok || response.status === 404) {
          disconnectedCount++
        } else {
          failures++
          SecureLogger.warn("Failed to delete WhatsApp instance on Evolution API server", {
            connectionId: conn.id,
            status: response.status
          })
        }
      } catch (err) {
        failures++
        SecureLogger.error("Error connecting to WhatsApp provider during deletion", {
          connectionId: conn.id,
          error: err
        })
      }
    }

    if (failures > 0) {
      throw new Error(`Could not verify deletion of ${failures} WhatsApp instance(s).`)
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
        pipeline.zrem("explore:index:vitrines", `loja:${partnerId}`)
        pipeline.zrem("explore:index:all", `loja:${partnerId}`)

        // 3. Find and queue deletion of all products
        const { data: products } = await admin
          .from("products")
          .select("id")
          .eq("partner_id", partnerId)

        if (products) {
          for (const prod of products) {
            pipeline.del(`data:v2:produto:${prod.id}`)
            pipeline.zrem("explore:index:produtos", `produto:${prod.id}`)
            pipeline.zrem("explore:index:all", `produto:${prod.id}`)
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
            pipeline.zrem("explore:index:servicos", `servico:${serv.id}`)
            pipeline.zrem("explore:index:all", `servico:${serv.id}`)
          }
        }
      }

      await pipeline.exec()

      // 5. Invalidate marketplace search cache
      try {
        const { revalidateExploreSearch } = await import("@/lib/utils/revalidation")
        await revalidateExploreSearch()
      } catch { }
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
    const mpCustomerId = null
    if (partnerId) {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("mercado_pago_subscription_id")
        .eq("partner_id", partnerId)
        .maybeSingle()

      mpSubscriptionId = sub?.mercado_pago_subscription_id || null
    }

    // 1. Anonymize Orders (must maintain customer_name to satisfy CHECK constraint orders_customer_not_null)
    if (partnerId) {
      const { data: orders } = await admin
        .from("orders")
        .update({
          buyer_id: null,
          customer_name: "[CLIENTE ANONIMIZADO]",
          customer_email: null,
          customer_phone: null,
          customer_cpf: null,
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
        customer_name: "[CLIENTE ANONIMIZADO]",
        customer_email: null,
        customer_phone: null,
        customer_cpf: null,
        delivery_address: "[DADOS ANONIMIZADOS - CONTA EXCLUÍDA]",
        notes: null
      })
      .eq("buyer_id", userId)
      .select("id")

    anonymizedCount += (boughtOrders?.length || 0)

    // 2. Anonymize Audit Logs (change_lines cannot be null per DB constraint)
    await admin
      .from("audit_logs")
      .update({
        user_id: null,
        actor_user_id: null,
        actor_name: "[DADOS ANONIMIZADOS]",
        actor_email: null,
        change_lines: ["[DADOS ANONIMIZADOS - CONTA EXCLUÍDA]"],
        new_values: null
      })
      .or(`user_id.eq.${userId},actor_user_id.eq.${userId}`)

    await admin
      .from("admin_audit_logs")
      .update({
        admin_user_id: null
      })
      .eq("admin_user_id", userId)

    // 3. Write minimal compliance log (include requested_at to satisfy NOT NULL constraint)
    const workflowVersion = "v3"
    const deletionVersion = "1.0.0"
    const requestedTimestamp = new Date(requestedAt)

    const { error: complianceLogError } = await admin
      .from("compliance_logs")
      .insert({
        user_id: userId,
        user_id_hash: crypto.createHash("sha256").update(userId).digest("hex"),
        partner_id: partnerId,
        email_hash: emailHash,
        mp_subscription_id: mpSubscriptionId,
        mp_customer_id: mpCustomerId,
        request_ip: ip,
        request_country: country,
        user_agent: userAgent,
        request_timestamp: requestedTimestamp.toISOString(),
        requested_at: requestedTimestamp.toISOString(),
        deletion_version: deletionVersion,
        workflow_version: workflowVersion,
        deletion_reason: reason
      })

    if (complianceLogError) {
      throw new Error(`Failed to retain account deletion evidence: ${complianceLogError.message}`)
    }

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
