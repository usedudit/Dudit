import type { SupabaseClient } from "@supabase/supabase-js"
import { isStoreOpen } from "@/lib/utils/opening-hours"

/**
 * Checks whether a store's showcase (vitrine) is currently active.
 * Returns false if explicitly disabled on the store or partner record.
 */
export async function isStoreShowcaseActive(
  client: SupabaseClient,
  params: { storeId?: string | null; partnerId?: string | null }
): Promise<boolean> {
  const { storeId, partnerId } = params

  if (storeId) {
    const { data: store } = await client
      .from("stores")
      .select("is_showcase_active, partner_id")
      .eq("id", storeId)
      .maybeSingle()

    if (store && store.is_showcase_active === false) {
      return false
    }

    const effectivePartnerId = partnerId || store?.partner_id
    if (effectivePartnerId) {
      const { data: partner } = await client
        .from("partners")
        .select("is_showcase_active")
        .eq("id", effectivePartnerId)
        .maybeSingle()
      if (partner && partner.is_showcase_active === false) {
        return false
      }
    }
    return true
  }

  if (partnerId) {
    const { data: store } = await client
      .from("stores")
      .select("is_showcase_active")
      .eq("partner_id", partnerId)
      .maybeSingle()

    if (store && store.is_showcase_active === false) {
      return false
    }

    const { data: partner } = await client
      .from("partners")
      .select("is_showcase_active")
      .eq("id", partnerId)
      .maybeSingle()

    if (partner && partner.is_showcase_active === false) {
      return false
    }

    return true
  }

  return true
}

export const INACTIVE_SHOWCASE_ERROR = "Esta vitrine está temporariamente inativa e não está aceitando novos pedidos."
export const STORE_CLOSED_ERROR = "Esta loja está fechada no momento e não está aceitando novos pedidos fora do horário de funcionamento."

export interface StoreOrderAcceptanceResult {
  allowed: boolean
  reason?: "showcase_inactive" | "store_closed" | "store_inactive"
  message?: string
}

/**
 * Checks whether a store can currently accept orders, verifying showcase active status,
 * store active status, and if accept_orders_when_closed is respected with opening_hours.
 */
export async function canStoreAcceptOrders(
  client: SupabaseClient,
  params: { storeId?: string | null; partnerId?: string | null; nowDate?: Date }
): Promise<StoreOrderAcceptanceResult> {
  const { storeId, partnerId, nowDate = new Date() } = params

  let storeRecord: any = null
  let partnerRecord: any = null

  if (storeId) {
    const { data: store } = await client
      .from("stores")
      .select("id, partner_id, is_active, is_showcase_active, accept_orders_when_closed, opening_hours, timezone")
      .eq("id", storeId)
      .maybeSingle()
    storeRecord = store
  }

  const effectivePartnerId = partnerId || storeRecord?.partner_id
  if (effectivePartnerId) {
    const { data: partner } = await client
      .from("partners")
      .select("id, is_active, is_showcase_active")
      .eq("id", effectivePartnerId)
      .maybeSingle()
    partnerRecord = partner
  }

  if (!storeRecord && effectivePartnerId) {
    const { data: fallbackStore } = await client
      .from("stores")
      .select("id, partner_id, is_active, is_showcase_active, accept_orders_when_closed, opening_hours, timezone")
      .eq("partner_id", effectivePartnerId)
      .maybeSingle()
    storeRecord = fallbackStore
  }

  // 1. Vitrine inativa
  if (storeRecord && storeRecord.is_showcase_active === false) {
    return { allowed: false, reason: "showcase_inactive", message: INACTIVE_SHOWCASE_ERROR }
  }
  if (partnerRecord && partnerRecord.is_showcase_active === false) {
    return { allowed: false, reason: "showcase_inactive", message: INACTIVE_SHOWCASE_ERROR }
  }

  // 2. Loja inativa
  if (storeRecord && storeRecord.is_active === false) {
    return { allowed: false, reason: "store_inactive", message: "Esta loja está temporariamente indisponível." }
  }
  if (partnerRecord && partnerRecord.is_active === false) {
    return { allowed: false, reason: "store_inactive", message: "Esta loja está temporariamente indisponível." }
  }

  // 3. Loja fechada e configurada para não receber pedidos fora do horário
  const acceptOrdersWhenClosed = storeRecord?.accept_orders_when_closed ?? true
  if (acceptOrdersWhenClosed === false && storeRecord?.opening_hours) {
    const open = isStoreOpen(storeRecord.opening_hours, nowDate, storeRecord.timezone)
    if (!open) {
      return { allowed: false, reason: "store_closed", message: STORE_CLOSED_ERROR }
    }
  }

  return { allowed: true }
}
