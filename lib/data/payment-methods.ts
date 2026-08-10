import type { SupabaseClient } from "@supabase/supabase-js"

export function resolvePaymentMethodsForStore(
  supabase: SupabaseClient,
  params: { partnerId: string; storeId?: string | null },
  options?: { select?: string; activeOnly?: boolean }
) {
  const select = options?.select || "id, fee_percent, fee_fixed, fee_bearer, installment_fee_bearer, discount_percent, max_installments"
  const activeOnly = options?.activeOnly !== false

  let query = supabase
    .from("payment_methods")
    .select(select)
    .eq("partner_id", params.partnerId)

  if (activeOnly) {
    query = query.eq("is_active", true)
  }

  if (params.storeId) {
    query = query.or(`store_id.is.null,store_id.eq.${params.storeId}`)
  } else {
    query = query.is("store_id", null)
  }

  return query
}
