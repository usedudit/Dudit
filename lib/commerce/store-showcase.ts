import type { SupabaseClient } from "@supabase/supabase-js"

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
