import { cache } from "react"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { scopeActiveOnly } from "@/lib/supabase/query-helpers"

/**
 * Fetches all services for a partner.
 * Wrapped in React cache() for per-request deduplication.
 */
export const getPartnerServicesCached = cache(async (partnerId: string) => {
    const supabase = await getSupabaseServerClient()
    const { data } = await scopeActiveOnly(supabase
        .from("services")
        .select("*")
        .eq("partner_id", partnerId))
        .order("created_at", { ascending: false })

    return data
})
