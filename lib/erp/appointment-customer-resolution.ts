import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Resolve client-supplied customer IDs and marketplace buyer IDs in a small
 * fixed number of partner-scoped reads, regardless of appointment batch size.
 */
export async function resolveAppointmentCustomerIds(
  supabase: SupabaseClient,
  partnerId: string,
  rawCustomerIds: Array<string | null | undefined>,
): Promise<Map<string, string | null>> {
  // Only UUIDs can be customer/auth IDs. Keeping that validation before the
  // filters preserves the original PostgREST input boundary.
  const candidates = Array.from(new Set(rawCustomerIds
    .map((id) => String(id || "").trim())
    .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))))
  const resolved = new Map<string, string | null>()
  if (candidates.length === 0) return resolved

  // Resolve actual customer IDs first, scoped to the active partner. Marketplace
  // buyer IDs are looked up only for candidates that were not direct matches.
  const { data: directCustomers } = await supabase
    .from("customers")
    .select("id")
    .eq("partner_id", partnerId)
    .in("id", candidates)
  for (const customer of directCustomers || []) {
    resolved.set(String(customer.id), String(customer.id))
  }

  const unresolved = candidates.filter((candidate) => !resolved.has(candidate))
  if (unresolved.length > 0) {
    // `buyer_id` may be the marketplace auth user ID. One partner-scoped OR
    // query replaces the former per-candidate lookup while retaining its
    // first-row behavior if either customer column matches.
    const candidateSet = new Set(unresolved)
    const { data: fallbackCustomers } = await supabase
      .from("customers")
      .select("id, user_id, marketplace_user_id")
      .eq("partner_id", partnerId)
      .or(`user_id.in.(${unresolved.join(",")}),marketplace_user_id.in.(${unresolved.join(",")})`)
    for (const customer of fallbackCustomers || []) {
      const customerId = String(customer.id)
      for (const candidate of [customer.user_id, customer.marketplace_user_id]) {
        const key = String(candidate || "")
        if (candidateSet.has(key) && !resolved.has(key)) resolved.set(key, customerId)
      }
    }
    for (const candidate of unresolved) {
      if (!resolved.has(candidate)) resolved.set(candidate, null)
    }
  }

  return resolved
}
