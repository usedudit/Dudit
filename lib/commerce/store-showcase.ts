import type { SupabaseClient } from "@supabase/supabase-js"
import { isStoreOpen } from "@/lib/utils/opening-hours"

/**
 * Checks whether a store or partner record has an active (non-expired)
 * administrative showcase suspension.
 */
export function isShowcaseAdminSuspended(
  record?: { showcase_suspended_at?: string | null; showcase_suspended_until?: string | null } | null,
  nowMs: number = Date.now()
): boolean {
  if (!record?.showcase_suspended_at) return false
  if (!record.showcase_suspended_until) return true
  const untilMs = Date.parse(record.showcase_suspended_until)
  if (Number.isNaN(untilMs)) return true
  return untilMs > nowMs
}

/**
 * Checks whether a store's showcase (vitrine) is currently active.
 * Returns false if administratively suspended or explicitly disabled on the store or partner record.
 */
export async function isStoreShowcaseActive(
  client: SupabaseClient,
  params: { storeId?: string | null; partnerId?: string | null }
): Promise<boolean> {
  const { storeId, partnerId } = params

  if (storeId) {
    const { data: store } = await client
      .from("stores")
      .select("is_showcase_active, showcase_suspended_at, showcase_suspended_until, partner_id")
      .eq("id", storeId)
      .maybeSingle()

    if (store && (store.is_showcase_active === false || isShowcaseAdminSuspended(store))) {
      return false
    }

    const effectivePartnerId = partnerId || store?.partner_id
    if (effectivePartnerId) {
      const { data: partner } = await client
        .from("partners")
        .select("is_showcase_active, showcase_suspended_at, showcase_suspended_until")
        .eq("id", effectivePartnerId)
        .maybeSingle()
      if (partner && (partner.is_showcase_active === false || isShowcaseAdminSuspended(partner))) {
        return false
      }
    }
    return true
  }

  if (partnerId) {
    const { data: store } = await client
      .from("stores")
      .select("is_showcase_active, showcase_suspended_at, showcase_suspended_until")
      .eq("partner_id", partnerId)
      .maybeSingle()

    if (store && (store.is_showcase_active === false || isShowcaseAdminSuspended(store))) {
      return false
    }

    const { data: partner } = await client
      .from("partners")
      .select("is_showcase_active, showcase_suspended_at, showcase_suspended_until")
      .eq("id", partnerId)
      .maybeSingle()

    if (partner && (partner.is_showcase_active === false || isShowcaseAdminSuspended(partner))) {
      return false
    }

    return true
  }

  return true
}

export const INACTIVE_SHOWCASE_ERROR = "Esta vitrine está temporariamente inativa e não está aceitando novos pedidos."
export const ADMIN_SUSPENDED_SHOWCASE_ERROR = "A vitrine online desta loja está temporariamente indisponível no marketplace."
export const STORE_CLOSED_ERROR = "Esta loja está fechada no momento e não está aceitando novos pedidos fora do horário de funcionamento."

export interface StoreOrderAcceptanceResult {
  allowed: boolean
  reason?: "showcase_inactive" | "store_closed" | "store_inactive"
  message?: string
}

/**
 * Checks whether a store can currently accept orders, verifying showcase active status,
 * administrative showcase suspension, store active status, and opening hours.
 */
export async function canStoreAcceptOrders(
  client: SupabaseClient,
  params: { storeId?: string | null; partnerId?: string | null; nowDate?: Date }
): Promise<StoreOrderAcceptanceResult> {
  const { storeId, partnerId, nowDate = new Date() } = params
  const nowMs = nowDate.getTime()

  let storeRecord: any = null
  let partnerRecord: any = null

  if (storeId) {
    const { data: store } = await client
      .from("stores")
      .select("id, partner_id, is_active, is_showcase_active, showcase_suspended_at, showcase_suspended_until, accept_orders_when_closed, opening_hours, timezone")
      .eq("id", storeId)
      .maybeSingle()
    storeRecord = store
  }

  const effectivePartnerId = partnerId || storeRecord?.partner_id
  if (effectivePartnerId) {
    const { data: partner } = await client
      .from("partners")
      .select("id, is_active, is_showcase_active, showcase_suspended_at, showcase_suspended_until")
      .eq("id", effectivePartnerId)
      .maybeSingle()
    partnerRecord = partner
  }

  if (!storeRecord && effectivePartnerId) {
    const { data: fallbackStore } = await client
      .from("stores")
      .select("id, partner_id, is_active, is_showcase_active, showcase_suspended_at, showcase_suspended_until, accept_orders_when_closed, opening_hours, timezone")
      .eq("partner_id", effectivePartnerId)
      .maybeSingle()
    storeRecord = fallbackStore
  }

  // 1a. Vitrine suspensa pela administração
  if (isShowcaseAdminSuspended(storeRecord, nowMs) || isShowcaseAdminSuspended(partnerRecord, nowMs)) {
    return { allowed: false, reason: "showcase_inactive", message: ADMIN_SUSPENDED_SHOWCASE_ERROR }
  }

  // 1b. Vitrine pausada pelo lojista
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
