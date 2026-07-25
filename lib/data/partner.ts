import { cache } from "react"
import { createAdminClient } from "@/lib/supabase/server"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { unstable_cache } from "next/cache"

/**
 * Cross-request cached partner status check (uses unstable_cache for CDN/edge caching).
 * Used in ERP layout for the initial partner gate.
 */
const getPartnerStatusCached = unstable_cache(
    async (userId: string) => {
        try {
            const supabase = createAdminClient()
            const { data } = await supabase
                .from("partners")
                .select("id")
                .eq("user_id", userId)
                .maybeSingle()
            return data
        } catch (error) {
            console.error("Error fetching partner status:", error)
            return null
        }
    },
    ['partner-status'],
    {
        revalidate: 10,  // Reduced from 60 to 10 seconds for faster updates
        tags: ['partner-status']
    }
)

export const getPartnerStatus = cache(async (userId: string) => {
    return getPartnerStatusCached(userId)
})

/**
 * Per-request cached full partner record lookup by user ID.
 * Uses React cache() for deduplication within the same server request.
 * Returns the full partner record (select *) or null.
 */
export const getPartnerByUserIdCached = cache(async (userId: string) => {
    const supabase = await getSupabaseServerClient()
    const { data: partner } = await supabase
        .from("partners")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle()

    if (!partner) return null

    const data: any = { ...partner }

    const { data: store } = await supabase
        .from("stores")
        .select("id, name, description, logo_url, banner_url, opening_hours, phone, addresses(*)")
        .eq("partner_id", partner.id)
        .order("is_headquarters", { ascending: false })
        .limit(1)
        .maybeSingle()

    if (store) {
        data.store = store
        data.store_name = store.name
        data.store_description = store.description
        data.store_image_url = store.logo_url
        data.banner_url = store.banner_url
        data.opening_hours = store.opening_hours
        data.phone = store.phone
        const storeAddress = (store as any).addresses?.find((a: any) => a.is_default) || (store as any).addresses?.[0]
        if (storeAddress) {
            data.zip_code = storeAddress.zip_code;
            data.street = storeAddress.street;
            data.number = storeAddress.number;
            data.complement = storeAddress.complement;
            data.neighborhood = storeAddress.neighborhood;
            data.city = storeAddress.city;
            data.state = storeAddress.state;
        }
    }

    if (data && data.cpf) {
        try {
            const { decryptCPF } = await import("@/lib/crypto")
            data.cpf = await decryptCPF(data.cpf)
        } catch (e) {
            console.error("[PartnerData] CPF decryption error:", e)
        }
    }

    return data
})

/**
 * Per-request cached partner payment methods.
 * Uses React cache() for deduplication within the same server request.
 */
export const getPartnerPaymentMethodsCached = cache(async (partnerId: string) => {
    const supabase = await getSupabaseServerClient()
    const { data } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("partner_id", partnerId)

    return data
})
