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
import {
  collectComplianceIntegrationSnapshot,
  hashNormalizedValue,
  maskEmailAddress,
  maskTaxDocument,
  safeEncryptCompliancePii,
  type StoredComplianceStoreSnapshot,
} from "@/lib/services/compliance/integration-history"
import { decryptCpfIfEncrypted } from "@/lib/crypto"

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
  activeRecurringSubscriptionsCount?: number
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
  ): Promise<{ success: boolean; error?: string; currentStatus?: string; deletionId?: string; partnerId?: string | null }> {
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
      return { success: true, currentStatus: existingDeletion.status, deletionId: existingDeletion.id, partnerId }
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

    return { success: true, deletionId: deletion.id, partnerId }
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
    let activeRecurringSubscriptionsCount = 0

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
        { count: members },
        { count: recSubs }
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
        admin.from("partner_users").select("id", { count: "exact", head: true }).eq("partner_id", partnerId),
        admin.from("recurring_subscriptions").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).in("status", ["active", "pending", "paused", "awaiting_restock", "awaiting_customer_decision", "past_due", "payment_failed"])
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
      activeRecurringSubscriptionsCount = recSubs || 0
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
      membersCount,
      activeRecurringSubscriptionsCount
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
    const { cancelAllMarketplaceSubscriptions } = await import("@/lib/services/recurring/limits")
    const result = await cancelAllMarketplaceSubscriptions(partnerId)
    if (result.failed > 0) {
      throw new Error(`Could not verify cancellation of ${result.failed} recurring customer subscription(s).`)
    }
    return result.cancelled
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
        SecureLogger.warn("WhatsApp connection is missing deletion credentials, skipping remote delete", { connectionId: conn.id })
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
   * Remove unreferenced R2 objects under the account owner's user prefix.
   * Referenced tenant objects are left for database-delete triggers to enqueue;
   * unknown key formats are preserved for a reviewed reconciliation pass.
   */
  static async purgeCloudflareR2(userId: string): Promise<{
    filesDeleted: number
    filesDeferredForDatabaseCleanup: number
    unclassifiedFilesPreserved: number
  }> {
    const config = getR2ServerConfig()
    if (!config.accessKeyId || !config.secretAccessKey || !config.accountId) {
      throw new Error("R2 server credentials not found")
    }
    if (!config.bucketName || !config.privateBucketName) {
      throw new Error("Both public and private R2 buckets are required before account file cleanup")
    }

    const s3 = new S3Client({
      region: "auto",
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`
    })

    const prefix = `users/${userId}/`
    let deletedCount = 0
    let referencedCount = 0
    let unclassifiedCount = 0
    const buckets = [...new Set([config.bucketName, config.privateBucketName].filter(Boolean))]
    const admin = getAdminClient()

    const classify = async (keys: string[], countResults = true) => {
      if (!keys.length) return new Map<string, boolean>()
      const { data, error } = await admin.rpc("classify_r2_reconciliation_keys", { p_keys: keys })
      if (error) throw new Error(`R2 cleanup classification failed: ${error.message}`)
      const rows = (Array.isArray(data) ? data : []) as Array<{ object_key: string; is_referenced: boolean }>
      const refs = new Map(rows.map((row) => [row.object_key, row.is_referenced]))
      if (countResults) {
        unclassifiedCount += keys.filter((key) => !refs.has(key)).length
        referencedCount += rows.filter((row) => row.is_referenced).length
      }
      return refs
    }

    try {
      for (const bucket of buckets) {
        let continuationToken: string | undefined
        do {
          const page = await s3.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }))
          const pageKeys = (page.Contents || []).flatMap(obj => obj.Key ? [obj.Key] : [])
          const refs = await classify(pageKeys)
          const deletable = pageKeys.filter((key) => refs.has(key) && !refs.get(key))
          for (let i = 0; i < deletable.length; i += 1000) {
            const delRes = await s3.send(new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: { Objects: deletable.slice(i, i + 1000).map((Key) => ({ Key })) },
            }))
            if (delRes.Errors?.length) throw new Error("R2 bulk delete returned object errors")
            deletedCount += delRes.Deleted?.length || 0
          }
          continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
        } while (continuationToken)

        let verifyToken: string | undefined
        do {
          const verify = await s3.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: verifyToken,
          }))
          const remainingKeys = (verify.Contents || []).flatMap(obj => obj.Key ? [obj.Key] : [])
          const refs = await classify(remainingKeys, false)
          if (remainingKeys.some((key) => refs.has(key) && !refs.get(key))) {
            throw new Error("R2 verification found unreferenced managed objects after account cleanup")
          }
          verifyToken = verify.IsTruncated ? verify.NextContinuationToken : undefined
        } while (verifyToken)
      }
      return {
        filesDeleted: deletedCount,
        filesDeferredForDatabaseCleanup: referencedCount,
        unclassifiedFilesPreserved: unclassifiedCount,
      }
    } finally {
      s3.destroy()
    }
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

    // Fetch user details for email hashing & encrypted compliance retention before deleting
    let emailHash = "unknown"
    let userEmail = ""
    let userFullName: string | null = null
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(userId)
      if (authUser?.user?.email) {
        userEmail = authUser.user.email
        emailHash = crypto
          .createHash("sha256")
          .update(userEmail.toLowerCase().trim())
          .digest("hex")
      }
      const metaName = authUser?.user?.user_metadata?.full_name || authUser?.user?.user_metadata?.name
      if (typeof metaName === "string" && metaName.trim()) {
        userFullName = metaName.trim()
      }
    } catch (e) {
      SecureLogger.error("Failed to query auth user email for compliance log hash", { userId, error: e })
    }

    if (!userFullName) {
      try {
        const { data: profile } = await admin
          .from("user_profiles")
          .select("full_name")
          .eq("user_id", userId)
          .maybeSingle()
        if (typeof profile?.full_name === "string" && profile.full_name.trim()) {
          userFullName = profile.full_name.trim()
        }
      } catch {
        // Non-blocking
      }
    }

    // Retrieve MP subscription details, integration history snapshot, and store fiscal snapshot
    let mpSubscriptionId = null
    const mpCustomerId = null
    let integrationsSnapshot: any[] = []
    let integrationAccountIds: string[] = []
    let integrationEmailHashes: string[] = []
    const partnerStoresSnapshot: StoredComplianceStoreSnapshot[] = []

    if (partnerId) {
      const [subRes, integrationData, storesRes] = await Promise.all([
        admin
          .from("subscriptions")
          .select("mercado_pago_subscription_id")
          .eq("partner_id", partnerId)
          .maybeSingle(),
        collectComplianceIntegrationSnapshot(admin, partnerId),
        admin
          .from("stores")
          .select("id, name, cnpj, cpf")
          .eq("partner_id", partnerId),
      ])

      mpSubscriptionId = subRes?.data?.mercado_pago_subscription_id || null
      integrationsSnapshot = integrationData.snapshot
      integrationAccountIds = integrationData.accountIds
      integrationEmailHashes = integrationData.emailHashes

      for (const store of storesRes?.data || []) {
        let rawDoc: string | null = store.cnpj || null
        if (!rawDoc && store.cpf) {
          try {
            rawDoc = await decryptCpfIfEncrypted(store.cpf)
          } catch {
            rawDoc = null
          }
        }
        const docInfo = maskTaxDocument(rawDoc)
        partnerStoresSnapshot.push({
          store_id: String(store.id),
          name: store.name ? String(store.name) : null,
          document_type: docInfo.type,
          document_masked: docInfo.masked,
          document_hash: docInfo.digits ? hashNormalizedValue(docInfo.digits) : null,
          document_encrypted: docInfo.digits ? safeEncryptCompliancePii(docInfo.digits) : null,
        })
      }
    }

    // 1. Anonymize Orders (must maintain customer_name to satisfy CHECK constraint orders_customer_not_null)
    if (partnerId) {
      const { data: orders } = await admin
        .from("orders")
        .update({
          buyer_id: null,
          customer_id: null,
          customer_name: "[CLIENTE ANONIMIZADO]",
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
        customer_id: null,
        customer_name: "[CLIENTE ANONIMIZADO]",
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
    const userIdHash = crypto.createHash("sha256").update(userId).digest("hex")

    const { data: existingCompliance } = await admin
      .from("compliance_logs")
      .select("id")
      .eq("user_id_hash", userIdHash)
      .maybeSingle()

    const compliancePayload = {
      user_id: userId,
      user_id_hash: userIdHash,
      partner_id: partnerId,
      email_hash: emailHash,
      email_encrypted: userEmail ? safeEncryptCompliancePii(userEmail.toLowerCase().trim()) : null,
      email_masked: maskEmailAddress(userEmail),
      user_full_name_encrypted: safeEncryptCompliancePii(userFullName),
      mp_subscription_id: mpSubscriptionId,
      mp_customer_id: mpCustomerId,
      integrations_snapshot: integrationsSnapshot,
      partner_stores_snapshot: partnerStoresSnapshot,
      integration_account_ids: integrationAccountIds,
      integration_email_hashes: integrationEmailHashes,
      request_ip: ip,
      request_country: country,
      user_agent: userAgent,
      request_timestamp: requestedTimestamp.toISOString(),
      requested_at: requestedTimestamp.toISOString(),
      deletion_version: deletionVersion,
      workflow_version: workflowVersion,
      deletion_reason: reason
    }

    const { error: complianceLogError } = existingCompliance?.id
      ? await admin.from("compliance_logs").update(compliancePayload).eq("id", existingCompliance.id)
      : await admin.from("compliance_logs").insert(compliancePayload)

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
    if (error && !/not found/i.test(error.message || "")) {
      throw new Error(`Failed to delete user from Supabase Auth: ${error.message}`)
    }
  }

  /**
   * Execute the complete account deletion pipeline synchronously/idempotently.
   * Used both immediately on user confirmation and by the Trigger.dev fallback task.
   */
  static async executeDeletionWorkflow(
    deletionId: string,
    userId: string,
    partnerId: string | null
  ): Promise<void> {
    const admin = getAdminClient()
    const startTime = Date.now()

    const { data: deletion, error: fetchError } = await admin
      .from("account_deletions")
      .select("*")
      .eq("id", deletionId)
      .maybeSingle()

    if (fetchError || !deletion) {
      SecureLogger.info("Account deletion workflow aborted: Deletion record not found.", { deletionId, userId, partnerId })
      return
    }

    if (deletion.status === "completed") {
      SecureLogger.info("Account deletion workflow skipped: Deletion already completed.", { deletionId, userId, partnerId })
      return
    }

    const resolvedPartnerId = partnerId || deletion.partner_id || null

    try {
      // Step 0: Pre-Delete Volumetry Report
      let plannedReport = deletion.checkpoints?.planned_report
      if (!plannedReport) {
        const report = await this.getPreDeleteReport(resolvedPartnerId, userId)
        const { data: cur } = await admin
          .from("account_deletions")
          .select("checkpoints")
          .eq("id", deletionId)
          .maybeSingle()

        const updatedCheckpoints = {
          ...(cur?.checkpoints || {}),
          planned_report: report
        }
        await admin
          .from("account_deletions")
          .update({ checkpoints: updatedCheckpoints })
          .eq("id", deletionId)

        plannedReport = report
      }

      // Step 1: Cloudflare R2 Purge (deleting_storage)
      let filesDeleted = deletion.checkpoints?.step_status?.deleting_storage?.filesDeleted || 0
      let filesDeferredForDatabaseCleanup = deletion.checkpoints?.step_status?.deleting_storage?.filesDeferredForDatabaseCleanup || 0
      let unclassifiedFilesPreserved = deletion.checkpoints?.step_status?.deleting_storage?.unclassifiedFilesPreserved || 0
      const deletingStorageCompleted = deletion.checkpoints?.step_status?.deleting_storage?.completed || false

      if (!deletingStorageCompleted) {
        await admin
          .from("account_deletions")
          .update({ status: "deleting_storage" })
          .eq("id", deletionId)

        const storageResult = await this.purgeCloudflareR2(userId)
        filesDeleted = storageResult.filesDeleted
        filesDeferredForDatabaseCleanup = storageResult.filesDeferredForDatabaseCleanup
        unclassifiedFilesPreserved = storageResult.unclassifiedFilesPreserved

        const { data: cur } = await admin
          .from("account_deletions")
          .select("checkpoints")
          .eq("id", deletionId)
          .maybeSingle()

        const stepStatus = cur?.checkpoints?.step_status || {}
        stepStatus.deleting_storage = {
          completed: true,
          filesDeleted,
          filesDeferredForDatabaseCleanup,
          unclassifiedFilesPreserved,
        }

        await admin
          .from("account_deletions")
          .update({ checkpoints: { ...(cur?.checkpoints || {}), step_status: stepStatus } })
          .eq("id", deletionId)
      }

      // Step 2: Evolution WhatsApp & MP Customer Cancel (deleting_external_services)
      let whatsappDisconnected = deletion.checkpoints?.step_status?.deleting_external_services?.whatsappDisconnected || 0
      let customerSubscriptionsCancelled = deletion.checkpoints?.step_status?.deleting_external_services?.customerSubscriptionsCancelled || 0
      const deletingExtCompleted = deletion.checkpoints?.step_status?.deleting_external_services?.completed || false

      if (!deletingExtCompleted) {
        await admin
          .from("account_deletions")
          .update({ status: "deleting_external_services" })
          .eq("id", deletionId)

        if (resolvedPartnerId) {
          whatsappDisconnected = await this.disconnectWhatsApp(resolvedPartnerId)
          customerSubscriptionsCancelled = await this.cancelCustomerSubscriptions(resolvedPartnerId)
        } else {
          whatsappDisconnected = 0
          customerSubscriptionsCancelled = 0
        }

        const { data: cur } = await admin
          .from("account_deletions")
          .select("checkpoints")
          .eq("id", deletionId)
          .maybeSingle()

        const stepStatus = cur?.checkpoints?.step_status || {}
        stepStatus.deleting_external_services = {
          completed: true,
          whatsappDisconnected,
          customerSubscriptionsCancelled
        }

        await admin
          .from("account_deletions")
          .update({ checkpoints: { ...(cur?.checkpoints || {}), step_status: stepStatus } })
          .eq("id", deletionId)
      }

      // Step 3: Clear Redis Caches & Indexers (deleting_marketplace)
      const deletingMarketplaceCompleted = deletion.checkpoints?.step_status?.deleting_marketplace?.completed || false

      if (!deletingMarketplaceCompleted) {
        await admin
          .from("account_deletions")
          .update({ status: "deleting_marketplace" })
          .eq("id", deletionId)

        await this.purgeRedis(resolvedPartnerId, userId)

        const { data: cur } = await admin
          .from("account_deletions")
          .select("checkpoints")
          .eq("id", deletionId)
          .maybeSingle()

        const stepStatus = cur?.checkpoints?.step_status || {}
        stepStatus.deleting_marketplace = { completed: true }

        await admin
          .from("account_deletions")
          .update({ checkpoints: { ...(cur?.checkpoints || {}), step_status: stepStatus } })
          .eq("id", deletionId)
      }

      // Step 4: Anonymization & Transactional DB Purge (deleting_database)
      let dbRowsDeleted = deletion.checkpoints?.step_status?.deleting_database?.dbRowsDeleted || 0
      let ordersAnonymized = deletion.checkpoints?.step_status?.deleting_database?.ordersAnonymized || 0
      let r2CleanupDeleted = deletion.checkpoints?.step_status?.deleting_database?.r2CleanupDeleted || 0
      let r2CleanupFailed = deletion.checkpoints?.step_status?.deleting_database?.r2CleanupFailed || 0
      const deletingDbCompleted = deletion.checkpoints?.step_status?.deleting_database?.completed || false

      if (!deletingDbCompleted) {
        await admin
          .from("account_deletions")
          .update({ status: "deleting_database" })
          .eq("id", deletionId)

        // Anonymize orders and audit logs BEFORE purgeDatabase deletes the partner row
        ordersAnonymized = await this.anonymizeOrdersAndLogs(
          userId,
          resolvedPartnerId,
          deletion.reason,
          deletion.request_ip,
          deletion.user_agent,
          deletion.request_country,
          deletion.requested_at
        )

        dbRowsDeleted = await this.purgeDatabase(resolvedPartnerId, userId)

        const { processR2CleanupBatch } = await import("@/lib/r2/cleanup-queue")
        for (let batchIndex = 0; batchIndex < 10; batchIndex++) {
          const batch = await processR2CleanupBatch(100)
          r2CleanupDeleted += batch.deleted
          r2CleanupFailed += batch.failed + batch.persistenceErrors
          if (batch.claimed < 100) break
        }

        const { data: cur } = await admin
          .from("account_deletions")
          .select("checkpoints")
          .eq("id", deletionId)
          .maybeSingle()

        const stepStatus = cur?.checkpoints?.step_status || {}
        stepStatus.deleting_database = {
          completed: true,
          dbRowsDeleted,
          ordersAnonymized,
          r2CleanupDeleted,
          r2CleanupFailed,
        }

        await admin
          .from("account_deletions")
          .update({ checkpoints: { ...(cur?.checkpoints || {}), step_status: stepStatus } })
          .eq("id", deletionId)
      } else {
        // Ensure any residual rows from an earlier partial run are purged before auth deletion
        const extraRows = await this.purgeDatabase(resolvedPartnerId, userId)
        dbRowsDeleted += extraRows
      }
      filesDeleted += r2CleanupDeleted

      // Step 5: Delete Supabase Auth User (deleting_auth)
      const deletingAuthCompleted = deletion.checkpoints?.step_status?.deleting_auth?.completed || false

      if (!deletingAuthCompleted) {
        await admin
          .from("account_deletions")
          .update({ status: "deleting_auth" })
          .eq("id", deletionId)

        await this.deleteAuthUser(userId)

        const { data: cur } = await admin
          .from("account_deletions")
          .select("checkpoints")
          .eq("id", deletionId)
          .maybeSingle()

        const stepStatus = cur?.checkpoints?.step_status || {}
        stepStatus.deleting_auth = { completed: true }

        await admin
          .from("account_deletions")
          .update({ checkpoints: { ...(cur?.checkpoints || {}), step_status: stepStatus } })
          .eq("id", deletionId)
      }

      // Step 6: Post-Delete Volumetry Report & Success
      const executionTime = Date.now() - startTime

      const actualReport = {
        productsDeleted: plannedReport.productsCount,
        servicesDeleted: plannedReport.servicesCount,
        ordersAnonymized,
        filesDeleted,
        filesDeferredForDatabaseCleanup,
        unclassifiedFilesPreserved,
        r2CleanupDeleted,
        r2CleanupFailed,
        whatsappDisconnected
      }

      const { data: currentDel } = await admin
        .from("account_deletions")
        .select("checkpoints")
        .eq("id", deletionId)
        .maybeSingle()

      const finalCheckpoints = {
        ...(currentDel?.checkpoints || {}),
        actual_report: actualReport,
        discrepancy_report: null
      }

      await admin
        .from("account_deletions")
        .update({
          status: "completed",
          error_log: null,
          checkpoints: finalCheckpoints
        })
        .eq("id", deletionId)

      const userIdHash = crypto.createHash("sha256").update(userId).digest("hex")
      const certificateMetrics = {
        deletionId,
        partnerId: resolvedPartnerId,
        userIdHash,
        startedAt: deletion.requested_at,
        finishedAt: new Date().toISOString(),
        durationMs: executionTime,
        dbRowsRemoved: dbRowsDeleted,
        filesRemoved: filesDeleted,
        redisKeysRemoved: plannedReport.redisKeysCount,
        filesDeferredForDatabaseCleanup,
        unclassifiedFilesPreserved,
        subscriptionsCancelled: customerSubscriptionsCancelled,
        whatsappInstancesRemoved: whatsappDisconnected,
        complianceRetained: "Minimized evidence may be retained for up to five years where necessary for legal obligations or the exercise of rights; this is a case-specific retention policy and not a blanket five-year retention rule under the CDC."
      }

      const sha256Report = crypto
        .createHash("sha256")
        .update(JSON.stringify(certificateMetrics))
        .digest("hex")

      const fullCertificate = {
        ...certificateMetrics,
        sha256Report
      }

      const { error: certificateError } = await admin
        .from("compliance_logs")
        .update({
          execution_time_ms: executionTime,
          certificate: fullCertificate,
          user_id: null
        })
        .eq("user_id_hash", userIdHash)

      if (certificateError) {
        throw new Error(`Failed to save account deletion certificate: ${certificateError.message}`)
      }
    } catch (err: any) {
      SecureLogger.error("Failed executing account deletion workflow", { deletionId, error: err.message })

      await admin
        .from("account_deletions")
        .update({
          status: "failed",
          error_log: err.message || "Unknown error occurred"
        })
        .eq("id", deletionId)

      throw err
    }
  }
}
