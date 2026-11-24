import "server-only"
import { getAdminClient } from "@/lib/supabase/admin"
import { decrypt } from "@/lib/cryptoService"
import { SecureLogger } from "@/lib/secure-logger"
import { auditLog } from "@/lib/security/audit-logger"
import { redis } from "@/lib/redis"
import {
  countActiveStoreRecurringSubscriptions,
  cancelStoreMarketplaceSubscriptions,
} from "@/lib/services/recurring/limits"

export interface StorePreDeleteReport {
  storeId: string
  storeName: string
  isHeadquarters: boolean
  productsCount: number
  servicesCount: number
  ordersCount: number
  customersCount: number
  suppliersCount: number
  quotesCount: number
  serviceOrdersCount: number
  appointmentsCount: number
  returnRequestsCount: number
  whatsappCount: number
  membersCount: number
  couponsCount: number
  promotionsCount: number
  transactionsCount: number
  activeRecurringSubscriptionsCount: number
}

export interface StoreDeletionResult {
  storeId: string
  storeName: string
  dbRowsDeleted: number
  whatsappDisconnected: number
  r2CleanupDeleted: number
  r2CleanupFailed: number
  fallbackStoreId: string | null
}

export class StoreDeletionService {
  /**
   * Validates that a store exists for the partner, is NOT headquarters,
   * and is NOT the only store remaining.
   */
  static async validateStoreDeletable(
    partnerId: string,
    storeId: string,
  ): Promise<{
    valid: boolean
    error?: string
    store?: { id: string; name: string; slug: string | null; is_headquarters: boolean }
    fallbackStoreId?: string | null
  }> {
    const admin = getAdminClient()

    const { data: stores, error } = await admin
      .from("stores")
      .select("id, name, slug, is_headquarters, is_active")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: true })

    if (error) {
      SecureLogger.error("Failed to fetch partner stores for deletion validation", {
        partnerId,
        storeId,
        error: error.message,
      })
      return { valid: false, error: "Erro ao validar a loja para exclusão." }
    }

    const list = stores || []
    const target = list.find((s: any) => s.id === storeId)

    if (!target) {
      return { valid: false, error: "Filial não encontrada." }
    }

    if (target.is_headquarters) {
      return { valid: false, error: "A loja matriz não pode ser excluída." }
    }

    if (list.length <= 1) {
      return { valid: false, error: "Não é possível excluir a única loja cadastrada." }
    }

    const remaining = list.filter((s: any) => s.id !== storeId)
    const fallback =
      remaining.find((s: any) => s.is_headquarters && s.is_active !== false) ||
      remaining.find((s: any) => s.is_active !== false) ||
      remaining[0] ||
      null

    return {
      valid: true,
      store: {
        id: target.id,
        name: target.name,
        slug: target.slug ?? null,
        is_headquarters: Boolean(target.is_headquarters),
      },
      fallbackStoreId: fallback?.id ?? null,
    }
  }

  /**
   * Computes a dry-run volumetry report of everything that will be permanently deleted
   * for this specific store/branch.
   */
  static async getPreDeleteReport(
    partnerId: string,
    storeId: string,
  ): Promise<{ success: boolean; report?: StorePreDeleteReport; error?: string }> {
    const validation = await this.validateStoreDeletable(partnerId, storeId)
    if (!validation.valid || !validation.store) {
      return { success: false, error: validation.error || "Loja não pode ser excluída." }
    }

    const admin = getAdminClient()

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
      { count: members },
      { count: coupons },
      { count: promotions },
      { count: txs },
      activeRecurringSubscriptionsCount,
    ] = await Promise.all([
      admin.from("products").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("store_id", storeId),
      admin.from("services").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("store_id", storeId),
      admin.from("orders").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("store_id", storeId),
      admin.from("customers").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("store_id", storeId),
      admin.from("suppliers").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("store_id", storeId),
      admin.from("quotes").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("store_id", storeId),
      admin.from("service_orders").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("store_id", storeId),
      admin.from("appointments").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("store_id", storeId),
      admin.from("return_requests").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("store_id", storeId),
      admin.from("partner_whatsapp_connections").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("store_id", storeId),
      admin.from("store_members").select("id", { count: "exact", head: true }).eq("store_id", storeId),
      admin.from("coupons").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("store_id", storeId),
      admin.from("promotions").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("store_id", storeId),
      admin.from("transactions").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("store_id", storeId),
      countActiveStoreRecurringSubscriptions(partnerId, storeId),
    ])

    return {
      success: true,
      report: {
        storeId,
        storeName: validation.store.name,
        isHeadquarters: validation.store.is_headquarters,
        productsCount: prod || 0,
        servicesCount: serv || 0,
        ordersCount: ord || 0,
        customersCount: cust || 0,
        suppliersCount: supp || 0,
        quotesCount: qte || 0,
        serviceOrdersCount: so || 0,
        appointmentsCount: appt || 0,
        returnRequestsCount: rr || 0,
        whatsappCount: wa || 0,
        membersCount: members || 0,
        couponsCount: coupons || 0,
        promotionsCount: promotions || 0,
        transactionsCount: txs || 0,
        activeRecurringSubscriptionsCount,
      },
    }
  }

  /**
   * Disconnect and delete external Evolution API WhatsApp instances linked strictly to this store.
   */
  static async disconnectStoreWhatsApp(partnerId: string, storeId: string): Promise<number> {
    const admin = getAdminClient()
    let disconnectedCount = 0

    const { data: conns, error } = await admin
      .from("partner_whatsapp_connections")
      .select("id, instance_name, api_key_encrypted")
      .eq("partner_id", partnerId)
      .eq("store_id", storeId)

    if (error) {
      SecureLogger.warn("Failed to load store WhatsApp connections for deletion", {
        partnerId,
        storeId,
        error: error.message,
      })
      return 0
    }

    for (const conn of conns || []) {
      if (!conn.instance_name || !conn.api_key_encrypted) continue
      try {
        const apiKey = decrypt(conn.api_key_encrypted, "whatsapp")
        const evoUrl = process.env.WHATSAPP_EVOLUTION_API_URL || "https://api.dudit.com.br/whatsapp"
        const response = await fetch(`${evoUrl}/instance/delete/${conn.instance_name}`, {
          method: "DELETE",
          headers: { apikey: apiKey },
        })
        if (response.ok || response.status === 404) {
          disconnectedCount++
        } else {
          SecureLogger.warn("Failed to delete store WhatsApp instance on Evolution API", {
            storeId,
            connectionId: conn.id,
            status: response.status,
          })
        }
      } catch (err) {
        SecureLogger.error("Error disconnecting store WhatsApp instance during deletion", {
          storeId,
          connectionId: conn.id,
          error: err,
        })
      }
    }

    return disconnectedCount
  }

  /**
   * Purge Redis keys and invalidate all Marketplace & ERP Next.js caches for the deleted store.
   */
  static async purgeStoreCaches(params: {
    partnerId: string
    storeId: string
    slug: string | null
    productIds: string[]
    serviceIds: string[]
    affectedUserIds: string[]
  }): Promise<void> {
    const { partnerId, storeId, slug, productIds, serviceIds, affectedUserIds } = params

    // 1. Purge Redis keys (store, products, services)
    if (redis) {
      try {
        const pipeline = redis.pipeline()
        pipeline.del(`data:v2:loja:${storeId}`)
        pipeline.zrem("explore:index:vitrines", `loja:${storeId}`)
        pipeline.zrem("explore:index:all", `loja:${storeId}`)

        for (const prodId of productIds) {
          pipeline.del(`data:v2:produto:${prodId}`)
          pipeline.zrem("explore:index:produtos", `produto:${prodId}`)
          pipeline.zrem("explore:index:all", `produto:${prodId}`)
        }

        for (const servId of serviceIds) {
          pipeline.del(`data:v2:servico:${servId}`)
          pipeline.zrem("explore:index:servicos", `servico:${servId}`)
          pipeline.zrem("explore:index:all", `servico:${servId}`)
        }

        await pipeline.exec()
      } catch (err) {
        SecureLogger.error("Failed to purge Redis keys during store deletion", {
          partnerId,
          storeId,
          error: err,
        })
      }
    }

    // 2. Invalidate Next.js / RAM caches (Marketplace + ERP)
    try {
      const { invalidateStoreCache } = await import("@/lib/cache/invalidation")
      await invalidateStoreCache(storeId, partnerId, slug || undefined, { silent: false })
    } catch { }

    try {
      const { removeFromExploreRedis } = await import("@/lib/redis-sync")
      await removeFromExploreRedis(storeId, "loja", false)
    } catch { }

    try {
      const {
        revalidateExploreSearch,
        revalidateProducts,
        revalidateServices,
        revalidateOrders,
        revalidateCustomers,
        revalidateSuppliers,
        revalidateQuotes,
        revalidateTransactions,
        revalidateCoupons,
        revalidateStockMovements,
        revalidateReports,
        revalidateMarketplace,
        revalidateUserAccess,
        safeRevalidateTag,
        safeRevalidatePath,
      } = await import("@/lib/utils/revalidation")
      const { TAGS } = await import("@/lib/utils/revalidation-tags")

      await Promise.all([
        revalidateExploreSearch({ silent: false }),
        revalidateMarketplace(),
        revalidateProducts(partnerId),
        revalidateServices(partnerId),
        revalidateOrders(partnerId),
        revalidateCustomers(partnerId),
        revalidateSuppliers(partnerId),
        revalidateQuotes(partnerId),
        revalidateTransactions(partnerId),
        revalidateCoupons(partnerId),
        revalidateStockMovements(partnerId),
        revalidateReports(partnerId),
        safeRevalidateTag(TAGS.partner(partnerId)),
        safeRevalidateTag(TAGS.storeProfile(storeId)),
        safeRevalidateTag("store-services"),
        safeRevalidateTag("store-products"),
        safeRevalidateTag("store-profile"),
        slug ? safeRevalidateTag(`store-${slug}`) : Promise.resolve(),
        ...productIds.map((id) => safeRevalidateTag(`product-${id}`)),
        ...serviceIds.map((id) => safeRevalidateTag(`service-${id}`)),
        ...affectedUserIds.map((uid) => revalidateUserAccess(uid)),
      ])

      await safeRevalidatePath("/erp/lojas")
      await safeRevalidatePath("/", "layout")
    } catch (err) {
      SecureLogger.error("Failed to revalidate Next.js caches during store deletion", {
        partnerId,
        storeId,
        error: err,
      })
    }
  }

  /**
   * Executes the full, atomic store/branch deletion pipeline:
   * 1. Validates store is deletable (exists, belongs to partner, not headquarters, not last store).
   * 2. Verifies no active recurring subscriptions remain for this store.
   * 3. Snapshots IDs for Redis/cache invalidation and member access refresh.
   * 4. Disconnects store-scoped WhatsApp instances.
   * 5. Calls `execute_store_deletion_db` RPC to atomically purge all store data & the store itself.
   * 6. Drains R2 cleanup queue (enqueued by DB delete triggers).
   * 7. Purges Redis & Next.js caches (Marketplace + ERP).
   * 8. Writes audit log with deletion reason.
   */
  static async executeStoreDeletion(params: {
    storeId: string
    partnerId: string
    actorUserId: string
    reason?: string | null
  }): Promise<StoreDeletionResult> {
    const { storeId, partnerId, actorUserId, reason } = params
    const admin = getAdminClient()

    const validation = await this.validateStoreDeletable(partnerId, storeId)
    if (!validation.valid || !validation.store) {
      throw new Error(validation.error || "Esta loja não pode ser excluída.")
    }

    const activeRecurringCount = await countActiveStoreRecurringSubscriptions(partnerId, storeId)
    if (activeRecurringCount > 0) {
      throw new Error(
        `Esta filial possui ${activeRecurringCount} assinatura(s) recorrente(s) ativa(s). Cancele todas antes de excluir a filial.`,
      )
    }

    // Snapshot store items & members BEFORE deleting from DB
    const [{ data: products }, { data: services }, { data: members }] = await Promise.all([
      admin.from("products").select("id").eq("partner_id", partnerId).eq("store_id", storeId),
      admin.from("services").select("id").eq("partner_id", partnerId).eq("store_id", storeId),
      admin
        .from("store_members")
        .select("partner_users(user_id)")
        .eq("store_id", storeId),
    ])

    const productIds = (products || []).map((p: any) => String(p.id))
    const serviceIds = (services || []).map((s: any) => String(s.id))
    const affectedUserIds = Array.from(
      new Set([
        actorUserId,
        ...(members || [])
          .map((m: any) => (Array.isArray(m.partner_users) ? m.partner_users[0]?.user_id : m.partner_users?.user_id))
          .filter(Boolean)
          .map(String),
      ]),
    )

    // Disconnect external WhatsApp instances strictly scoped to this store
    const whatsappDisconnected = await this.disconnectStoreWhatsApp(partnerId, storeId)

    // Execute atomic DB cascade deletion via Postgres RPC
    const { data: rowsDeleted, error: rpcError } = await admin.rpc("execute_store_deletion_db", {
      p_store_id: storeId,
      p_partner_id: partnerId,
      p_actor_user_id: actorUserId,
    })

    if (rpcError) {
      throw new Error(`Falha ao excluir dados da filial: ${rpcError.message}`)
    }

    const dbRowsDeleted = Number(rowsDeleted || 0)

    // Drain R2 object deletion outbox (enqueued by DB triggers on deleted rows)
    let r2CleanupDeleted = 0
    let r2CleanupFailed = 0
    try {
      const { processR2CleanupBatch } = await import("@/lib/r2/cleanup-queue")
      for (let i = 0; i < 10; i++) {
        const batch = await processR2CleanupBatch(100)
        r2CleanupDeleted += batch.deleted
        r2CleanupFailed += batch.failed + batch.persistenceErrors
        if (batch.claimed < 100) break
      }
    } catch (r2Err) {
      // Non-blocking: hourly R2 cleanup cron will drain any remaining jobs
      SecureLogger.warn("R2 cleanup batch draining encountered an error during store deletion", {
        storeId,
        partnerId,
        error: r2Err,
      })
    }

    // Purge Redis and Next.js caches across Marketplace & ERP
    await this.purgeStoreCaches({
      partnerId,
      storeId,
      slug: validation.store.slug,
      productIds,
      serviceIds,
      affectedUserIds,
    })

    // Record audit trail
    await auditLog({
      action: "store.deleted",
      actorUserId,
      partnerId,
      metadata: {
        storeId,
        storeName: validation.store.name,
        reason: reason || null,
        dbRowsDeleted,
        productsDeleted: productIds.length,
        servicesDeleted: serviceIds.length,
        whatsappDisconnected,
        r2CleanupDeleted,
      },
    })

    return {
      storeId,
      storeName: validation.store.name,
      dbRowsDeleted,
      whatsappDisconnected,
      r2CleanupDeleted,
      r2CleanupFailed,
      fallbackStoreId: validation.fallbackStoreId ?? null,
    }
  }

  /**
   * Cancels all active recurring subscriptions linked strictly to this store.
   */
  static async cancelStoreRecurringSubscriptions(
    partnerId: string,
    storeId: string,
  ): Promise<{ cancelled: number; failed: number }> {
    return cancelStoreMarketplaceSubscriptions(partnerId, storeId)
  }
}
