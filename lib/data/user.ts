import { cache } from "react"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"

type MarketplaceSessionData = {
    profile: {
        id: string
        full_name: string | null
        city: string | null
        state: string | null
        latitude: number | null
        longitude: number | null
        avatar_url: string | null
    } | null
    cartCount: number
}

async function getMarketplaceSessionCore(userId: string, logLabel: string): Promise<MarketplaceSessionData> {
    console.log(`[SUPABASE CALL] ${logLabel}(${userId})`)
    const supabase = await getSupabaseServerClient()

    const [profileRes, addressRes, cartRes] = await Promise.all([
        supabase.from("user_profiles").select("id, full_name, avatar_url").eq("user_id", userId).maybeSingle(),
        supabase.from("addresses").select("city, state, latitude, longitude")
            .eq("user_id", userId)
            .eq("is_default", true)
            .maybeSingle(),
        // Linhas de assinatura são artefato do checkout direto da página do
        // plano e não contam como itens da sacola.
        supabase.from("cart_items").select("quantity")
            .eq("user_id", userId)
            .or("item_type.is.null,item_type.neq.subscription"),
    ])

    if (profileRes.error) console.error("[SessionData] Profile fetch error:", profileRes.error)
    if (cartRes.error) console.error("[SessionData] Cart fetch error:", cartRes.error)

    const profileData = profileRes.data || null
    const addressData = addressRes.data || null
    const cartItems = cartRes.data || []

    return {
        profile: profileData
            ? {
                id: profileData.id,
                full_name: profileData.full_name,
                city: addressData?.city || null,
                state: addressData?.state || null,
                latitude: addressData?.latitude || null,
                longitude: addressData?.longitude || null,
                avatar_url: profileData.avatar_url || null,
            }
            : null,
        cartCount: cartItems.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0),
    }
}

/**
 * Only the session data needed to render the public marketplace home.
 * Partner membership is intentionally loaded by the routes that need it,
 * rather than making every visit to the home query ERP-related tables.
 */
export const getMarketplaceHomeSessionData = cache(async (userId: string) => {
    return getMarketplaceSessionCore(userId, "getMarketplaceHomeSessionData")
})

export const getUserSessionData = cache(async (userId: string) => {
    console.log(`[SUPABASE CALL] getUserSessionData(${userId})`)
    const supabase = await getSupabaseServerClient()

    const [core, partnerRes, partnerUserRes] = await Promise.all([
        getMarketplaceSessionCore(userId, "getUserSessionData/core"),
        supabase.from("partners").select("id").eq("user_id", userId).limit(1),
        supabase.from("partner_users").select("id").eq("user_id", userId).limit(1),
    ])

    const isPartner = !!(partnerRes.data?.length || partnerUserRes.data?.length)

    const result = {
        ...core,
        isPartner,
    }

    return result
})
