import { cache } from "react"
import { createAdminClient } from "@/lib/supabase/server"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { unstable_cache } from "next/cache"

/**
 * Cross-request cached partner status check (uses unstable_cache for CDN/edge caching).
 * Used in ERP layout for the initial partner gate.
 */
export const getPartnerStatus = async (userId: string) => {
    const cachedFn = unstable_cache(
        async () => {
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
        ['partner-status', userId],
        {
            revalidate: 10,  // Reduced from 60 to 10 seconds for faster updates
            tags: ['partner-status']
        }
    )
    return cachedFn()
}

/**
 * Per-request cached full partner record lookup by user ID.
 * Uses React cache() for deduplication within the same server request.
 * Returns the full partner record (select *) or null.
 */
export const getPartnerByUserIdCached = cache(async (userId: string) => {
    const supabase = await getSupabaseServerClient()
    const { data } = await supabase
        .from("partners")
        .select("*, addresses(*)")
        .eq("user_id", userId)
        .maybeSingle()

    if (data && data.addresses && data.addresses.length > 0) {
        const defaultAddress = data.addresses.find((a: any) => a.is_default) || data.addresses[0];
        data.zip_code = defaultAddress.zip_code;
        data.street = defaultAddress.street;
        data.number = defaultAddress.number;
        data.complement = defaultAddress.complement;
        data.neighborhood = defaultAddress.neighborhood;
        data.city = defaultAddress.city;
        data.state = defaultAddress.state;
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
