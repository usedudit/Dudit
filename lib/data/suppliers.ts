import { cache } from "react"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"

/**
 * Fetches all suppliers for a partner.
 * Wrapped in React cache() for per-request deduplication.
 */
export const getPartnerSuppliersCached = cache(async (partnerId: string) => {
    const supabase = await getSupabaseServerClient()
    const { data } = await supabase
        .from("suppliers")
        .select("*")
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false })

    return data
})
