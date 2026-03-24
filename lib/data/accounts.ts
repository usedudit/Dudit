import { cache } from "react"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"

/**
 * Fetches all accounts payable for a partner, including supplier names.
 * Wrapped in React cache() for per-request deduplication.
 */
export const getAccountsPayableCached = cache(async (partnerId: string) => {
    const supabase = await getSupabaseServerClient()
    const { data } = await supabase
        .from("accounts_payable")
        .select("*, suppliers(name)")
        .eq("partner_id", partnerId)
        .order("due_date", { ascending: true })

    return data
})

/**
 * Fetches all accounts receivable for a partner, including customer and order info.
 * Wrapped in React cache() for per-request deduplication.
 */
export const getAccountsReceivableCached = cache(async (partnerId: string) => {
    const supabase = await getSupabaseServerClient()
    const { data } = await supabase
        .from("accounts_receivable")
        .select("*, customers(name), orders(order_number)")
        .eq("partner_id", partnerId)
        .order("due_date", { ascending: true })

    return data
})
