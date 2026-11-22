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

/**
 * Exporta um pedido da Dudit para o ERP conectado (Tiny e/ou Bling).
 * Idempotente e seguro para chamadas não-bloqueantes.
 */
export async function exportOrderToConnectedErps(orderId: string): Promise<void> {
  const supabase = createAdminClient()
  const { data: order } = await supabase
    .from("orders")
    .select("partner_id, external_sync_status, external_order_id")
    .eq("id", orderId)
    .maybeSingle()

  if (!order?.partner_id) return
  if (order.external_sync_status === "synced" && order.external_order_id) return

  const { data: activeIntegrations } = await supabase
    .from("partner_integrations")
    .select("provider_slug")
    .eq("partner_id", order.partner_id)
    .eq("status", "connected")
    .in("provider_slug", [TINY_PROVIDER, BLING_PROVIDER])

  const providers = new Set((activeIntegrations || []).map((r: any) => r.provider_slug))

  if (providers.has(TINY_PROVIDER)) {
    await exportDuditOrderToTiny(orderId).catch((err) => {
      console.error("[erp-sync] Tiny export failed:", err)
    })
  } else if (providers.has(BLING_PROVIDER)) {
    await exportDuditOrderToBling(orderId).catch((err) => {
      console.error("[erp-sync] Bling export failed:", err)
    })
  }
}

/**
 * Atualiza a situação do pedido (ex: cancelado) no ERP em que ele foi sincronizado
 */
export async function updateOrderStatusOnConnectedErps(params: {
  orderId: string
  situacao: "aberto" | "aprovado" | "cancelado" | "enviado" | "entregue"
}): Promise<void> {
  const supabase = createAdminClient()
  const { data: order } = await supabase
    .from("orders")
    .select("external_provider, external_order_id")
    .eq("id", params.orderId)
    .maybeSingle()

  if (!order?.external_order_id) return

  if (order.external_provider === TINY_PROVIDER) {
    await updateTinyOrderStatus(params).catch((err) => {
      console.error("[erp-sync] Tiny status update failed:", err)
    })
  } else if (order.external_provider === BLING_PROVIDER) {
    await updateBlingOrderStatus(params).catch((err) => {
      console.error("[erp-sync] Bling status update failed:", err)
    })
  }
}

/**
 * Sincroniza alteração manual de estoque da Dudit para todos os ERPs conectados (Tiny e/ou Bling)
 */
export async function syncStockToConnectedErps(params: {
  partnerId: string
  productId?: string
  variantId?: string
  sku?: string
  newStock: number
  reason?: string
}): Promise<void> {
  const supabase = createAdminClient()
  const { data: activeIntegrations } = await supabase
    .from("partner_integrations")
    .select("provider_slug")
    .eq("partner_id", params.partnerId)
    .eq("status", "connected")
    .in("provider_slug", [TINY_PROVIDER, BLING_PROVIDER])

  const providers = new Set((activeIntegrations || []).map((r: any) => r.provider_slug))

  const jobs: Promise<any>[] = []
  if (providers.has(TINY_PROVIDER)) {
    jobs.push(syncDuditStockToTiny(params).catch(() => {}))
  }
  if (providers.has(BLING_PROVIDER)) {
    jobs.push(syncDuditStockToBling(params).catch(() => {}))
  }

  await Promise.allSettled(jobs)
}
