import "server-only"
import { cache } from "react"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"

/**
 * Single request-scoped ERP context resolver.
 * Combines `partner_users` (invited) and `partners` (owned) logic
 * to eliminate duplicate queries across the ERP layout, pages, and actions.
 */
export const getERPContext = cache(async (userId: string) => {
    const supabase = await getSupabaseServerClient()

    const [partnerUsersRes, partnersRes] = await Promise.all([
        supabase.from("partner_users").select("partner_id, role_id")
            .eq("user_id", userId),
        supabase.from("partners").select("id, user_id, store_name")
            .eq("user_id", userId),
    ])

    return {
        partnerUserRecords: partnerUsersRes.data || [],
        ownedPartners: partnersRes.data || [],
    }
})
