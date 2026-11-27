import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import {
  TINY_PROVIDER,
  exportDuditOrderToTiny,
  updateTinyOrderStatus,
  syncDuditStockToTiny,
} from "./tiny/tiny-integration"
import {
  BLING_PROVIDER,
  exportDuditOrderToBling,
  updateBlingOrderStatus,
  syncDuditStockToBling,
} from "./bling/bling-integration"

export interface StockSyncItemInput {
  productId?: string | null
  variantId?: string | null
  sku?: string | null
  newStock?: number
}

/**
 * Busca os ERPs conectados (Tiny / Bling) para um parceiro.
 */
async function getConnectedErpProviders(
  supabase: ReturnType<typeof createAdminClient>,
  partnerId: string
): Promise<Set<string>> {
  const { data: activeIntegrations } = await supabase
    .from("partner_integrations")
    .select("provider_slug")
    .eq("partner_id", partnerId)
    .eq("status", "connected")
    .in("provider_slug", [TINY_PROVIDER, BLING_PROVIDER])

  return new Set((activeIntegrations || []).map((r: any) => r.provider_slug))
}

function isBenignStockSyncSkip(error?: string): boolean {
  if (!error) return false
  const lower = error.toLowerCase()
  return (
    lower.includes("não conectado") ||
    lower.includes("desativada")
  )
}

/**
 * Exporta um pedido da Dudit para o ERP conectado (Tiny e/ou Bling).
 * Idempotente e seguro para chamadas não-bloqueantes.
 * Caso o pedido já tenha tido baixa física de estoque (`inventory_deducted = true`)
 * e a exportação automática de pedidos esteja desativada no ERP, ainda assim
 * garante a sincronização de estoque se `sync_stock` estiver ativo.
 */
export async function exportOrderToConnectedErps(orderId: string): Promise<{
  exportedProviders: string[]
  syncedStockProviders: string[]
}> {
  const supabase = createAdminClient()
  const { data: order } = await supabase
    .from("orders")
    .select("partner_id, order_number, delivery_status, inventory_deducted, external_provider, external_sync_status, external_order_id")
    .eq("id", orderId)
    .maybeSingle()

  if (!order?.partner_id) return { exportedProviders: [], syncedStockProviders: [] }

  const providers = await getConnectedErpProviders(supabase, order.partner_id)
  if (providers.size === 0) return { exportedProviders: [], syncedStockProviders: [] }

  const alreadySyncedTiny =
    order.external_sync_status === "synced" &&
    Boolean(order.external_order_id) &&
    order.external_provider === TINY_PROVIDER

  const alreadySyncedBling =
    order.external_sync_status === "synced" &&
    Boolean(order.external_order_id) &&
    order.external_provider === BLING_PROVIDER

  const deliveryStatus = String((order as any).delivery_status || "").toLowerCase()
  const isDeducted =
    Boolean((order as any).inventory_deducted) ||
    deliveryStatus === "delivered" ||
    deliveryStatus === "sent"

  const exportedProviders: string[] = []
  const syncedStockProviders = new Set<string>()
  const providersNeedingFallbackStockSync = new Set<string>()

  if (providers.has(TINY_PROVIDER) && !alreadySyncedTiny) {
    try {
      const res = await exportDuditOrderToTiny(orderId)
      if (res.success) {
        exportedProviders.push(TINY_PROVIDER)
        if (isDeducted) syncedStockProviders.add(TINY_PROVIDER)
      } else {
        if (isDeducted) providersNeedingFallbackStockSync.add(TINY_PROVIDER)
        if (res.error && !res.error.toLowerCase().includes("desativada")) {
          console.error(`[erp-sync] Tiny export failed for order ${orderId}:`, res.error)
        }
      }
    } catch (err) {
      if (isDeducted) providersNeedingFallbackStockSync.add(TINY_PROVIDER)
      console.error(`[erp-sync] Tiny export exception for order ${orderId}:`, err)
    }
  }

  if (providers.has(BLING_PROVIDER) && !alreadySyncedBling) {
    try {
      const res = await exportDuditOrderToBling(orderId)
      if (res.success) {
        exportedProviders.push(BLING_PROVIDER)
        if (isDeducted) syncedStockProviders.add(BLING_PROVIDER)
      } else {
        if (isDeducted) providersNeedingFallbackStockSync.add(BLING_PROVIDER)
        if (res.error && !res.error.toLowerCase().includes("desativada")) {
          console.error(`[erp-sync] Bling export failed for order ${orderId}:`, res.error)
        }
      }
    } catch (err) {
      if (isDeducted) providersNeedingFallbackStockSync.add(BLING_PROVIDER)
      console.error(`[erp-sync] Bling export exception for order ${orderId}:`, err)
    }
  }

  // Se o pedido já baixou estoque físico (ex: PDV) e algum ERP conectado não exportou o pedido
  // (ex: auto_export_orders = false), ainda assim reflete a baixa física no estoque do ERP.
  if (providersNeedingFallbackStockSync.size > 0) {
    const fallbackList = Array.from(providersNeedingFallbackStockSync)
    await syncOrderStockToConnectedErps(
      orderId,
      `Baixa venda Dudit #${order.order_number || orderId}`,
      fallbackList
    )
    fallbackList.forEach((p) => syncedStockProviders.add(p))
  }

  return {
    exportedProviders,
    syncedStockProviders: Array.from(syncedStockProviders),
  }
}

/**
 * Atualiza a situação do pedido (ex: cancelado, enviado, entregue) no ERP em que ele foi sincronizado.
 * Retorna os provedores nos quais o estoque do pedido já foi lançado/estornado diretamente via pedido.
 */
export async function updateOrderStatusOnConnectedErps(params: {
  orderId: string
  situacao: "aberto" | "aprovado" | "cancelado" | "enviado" | "entregue"
}): Promise<{ stockHandledProviders: string[] }> {
  const supabase = createAdminClient()
  const { data: order } = await supabase
    .from("orders")
    .select("external_provider, external_order_id")
    .eq("id", params.orderId)
    .maybeSingle()

  if (!order?.external_order_id) return { stockHandledProviders: [] }

  const stockHandledProviders: string[] = []

  if (order.external_provider === TINY_PROVIDER) {
    const res = await updateTinyOrderStatus(params).catch((err) => {
      console.error("[erp-sync] Tiny status update failed:", err)
      return { success: false as const, stockLaunched: false, stockReversed: false }
    })
    if (res?.stockLaunched || res?.stockReversed) {
      stockHandledProviders.push(TINY_PROVIDER)
    }
  } else if (order.external_provider === BLING_PROVIDER) {
    await updateBlingOrderStatus(params).catch((err) => {
      console.error("[erp-sync] Bling status update failed:", err)
    })
  }

  return { stockHandledProviders }
}

/**
 * Sincroniza alteração de estoque de um produto ou variação da Dudit para todos os ERPs conectados (Tiny e/ou Bling)
 */
export async function syncStockToConnectedErps(params: {
  partnerId: string
  productId?: string
  variantId?: string
  sku?: string
  newStock: number
  reason?: string
  onlyProviders?: string[]
}): Promise<void> {
  const supabase = createAdminClient()
  const connected = await getConnectedErpProviders(supabase, params.partnerId)
  if (connected.size === 0) return

  const allowed = params.onlyProviders ? new Set(params.onlyProviders) : null

  const jobs: Promise<any>[] = []
  if (connected.has(TINY_PROVIDER) && (!allowed || allowed.has(TINY_PROVIDER))) {
    jobs.push(
      syncDuditStockToTiny(params)
        .then((res) => {
          if (!res.success && !isBenignStockSyncSkip(res.error)) {
            console.warn(`[erp-sync] Tiny stock sync failed (partner=${params.partnerId}, product=${params.productId || "-"}, variant=${params.variantId || "-"}):`, res.error)
          }
        })
        .catch((err) => {
          console.error(`[erp-sync] Tiny stock sync exception:`, err)
        })
    )
  }
  if (connected.has(BLING_PROVIDER) && (!allowed || allowed.has(BLING_PROVIDER))) {
    jobs.push(
      syncDuditStockToBling(params)
        .then((res) => {
          if (!res.success && !isBenignStockSyncSkip(res.error)) {
            console.warn(`[erp-sync] Bling stock sync failed (partner=${params.partnerId}, product=${params.productId || "-"}, variant=${params.variantId || "-"}):`, res.error)
          }
        })
        .catch((err) => {
          console.error(`[erp-sync] Bling stock sync exception:`, err)
        })
    )
  }

  await Promise.allSettled(jobs)
}

/**
 * Sincroniza em lote o estoque atual (lido do banco da Dudit caso `newStock` não seja informado)
 * de múltiplos produtos/variações para todos os ERPs conectados, com deduplicação por item.
 */
export async function syncItemsStockToConnectedErps(params: {
  partnerId: string
  items: StockSyncItemInput[]
  reason?: string
  onlyProviders?: string[]
  excludeProviders?: string[]
}): Promise<void> {
  const { partnerId, items, reason, onlyProviders, excludeProviders } = params
  if (!partnerId || !Array.isArray(items) || items.length === 0) return

  const supabase = createAdminClient()
  const connected = await getConnectedErpProviders(supabase, partnerId)
  if (connected.size === 0) return

  const allowed = onlyProviders ? new Set(onlyProviders) : null
  const excluded = excludeProviders ? new Set(excludeProviders) : null
  const activeProviders = Array.from(connected).filter(
    (p) => (!allowed || allowed.has(p)) && (!excluded || !excluded.has(p))
  )
  if (activeProviders.length === 0) return

  // Deduplica por variante ou produto para evitar chamadas redundantes ao ERP
  const uniqueMap = new Map<string, StockSyncItemInput>()
  for (const item of items) {
    if (!item) continue
    const key = item.variantId
      ? `variant:${item.variantId}`
      : item.productId
        ? `product:${item.productId}`
        : item.sku
          ? `sku:${item.sku}`
          : null
    if (!key) continue
    uniqueMap.set(key, item)
  }

  for (const item of uniqueMap.values()) {
    try {
      let resolvedStock = item.newStock
      if (resolvedStock === undefined || !Number.isFinite(Number(resolvedStock))) {
        if (item.variantId) {
          const { data: vRow } = await supabase
            .from("product_variants")
            .select("stock_quantity")
            .eq("id", item.variantId)
            .maybeSingle()
          if (!vRow) continue
          resolvedStock = Number(vRow.stock_quantity || 0)
        } else if (item.productId) {
          const { data: pRow } = await supabase
            .from("products")
            .select("stock_quantity")
            .eq("id", item.productId)
            .maybeSingle()
          if (!pRow) continue
          resolvedStock = Number(pRow.stock_quantity || 0)
        } else {
          continue
        }
      }

      const syncPayload = {
        partnerId,
        productId: item.productId || undefined,
        variantId: item.variantId || undefined,
        sku: item.sku || undefined,
        newStock: Math.max(0, Number(resolvedStock || 0)),
        reason,
      }

      const jobs: Promise<any>[] = []
      if (activeProviders.includes(TINY_PROVIDER)) {
        jobs.push(
          syncDuditStockToTiny(syncPayload)
            .then((res) => {
              if (!res.success && !isBenignStockSyncSkip(res.error)) {
                console.warn(`[erp-sync] Tiny batch stock sync failed (product=${item.productId || "-"}, variant=${item.variantId || "-"}):`, res.error)
              }
            })
            .catch((err) => {
              console.error(`[erp-sync] Tiny batch stock sync exception:`, err)
            })
        )
      }
      if (activeProviders.includes(BLING_PROVIDER)) {
        jobs.push(
          syncDuditStockToBling(syncPayload)
            .then((res) => {
              if (!res.success && !isBenignStockSyncSkip(res.error)) {
                console.warn(`[erp-sync] Bling batch stock sync failed (product=${item.productId || "-"}, variant=${item.variantId || "-"}):`, res.error)
              }
            })
            .catch((err) => {
              console.error(`[erp-sync] Bling batch stock sync exception:`, err)
            })
        )
      }

      await Promise.allSettled(jobs)
    } catch (err) {
      console.error("[erp-sync] Error syncing item stock:", err)
    }
  }
}

/**
 * Sincroniza o estoque físico atual de todos os itens de um pedido para os ERPs conectados.
 */
export async function syncOrderStockToConnectedErps(
  orderId: string,
  reason?: string,
  onlyProviders?: string[]
): Promise<void> {
  const supabase = createAdminClient()
  const { data: order } = await supabase
    .from("orders")
    .select("partner_id, order_number, order_items(product_id, variant_id)")
    .eq("id", orderId)
    .maybeSingle()

  if (!order?.partner_id) return
  const orderItems = Array.isArray((order as any).order_items) ? (order as any).order_items : []
  if (orderItems.length === 0) return

  await syncItemsStockToConnectedErps({
    partnerId: order.partner_id,
    items: orderItems
      .filter((it: any) => it?.product_id)
      .map((it: any) => ({
        productId: it.product_id,
        variantId: it.variant_id || null,
      })),
    reason: reason || `Atualização pedido Dudit #${order.order_number || orderId}`,
    onlyProviders,
  })
}
