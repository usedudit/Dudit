import { cache } from "react"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"

export const getUserSessionData = cache(async (userId: string) => {
    console.log(`[SUPABASE CALL] getUserSessionData(${userId})`)
    const supabase = await getSupabaseServerClient()

    const [profileRes, addressRes, cartRes, partnerRes, partnerUserRes] = await Promise.all([
        supabase.from("user_profiles").select("id, full_name").eq("user_id", userId).maybeSingle(),
        supabase.from("addresses").select("city, state, latitude, longitude")
            .eq("user_id", userId)
            .eq("is_default", true)
            .maybeSingle(),
        supabase.from("cart_items").select("quantity").eq("user_id", userId),
        supabase.from("partners").select("id").eq("user_id", userId).limit(1),
        supabase.from("partner_users").select("id").eq("user_id", userId).limit(1)
    ])

    const profileData = profileRes.data || null
    let addressData = addressRes.data || null

    if (profileRes.error) console.error("[SessionData] Profile fetch error:", profileRes.error)
    if (cartRes.error) console.error("[SessionData] Cart fetch error:", cartRes.error)

    const cartItems = cartRes.data || []
    const cartCount = cartItems.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0)

    const isPartner = !!(partnerRes.data?.length || partnerUserRes.data?.length)

    const result = {
        profile: profileData
            ? {
                id: profileData.id,
                full_name: profileData.full_name,
                city: addressData?.city || null,
                state: addressData?.state || null,
                latitude: addressData?.latitude || null,
                longitude: addressData?.longitude || null,
            }
            : null,
        cartCount,
        isPartner,
    }

    return result
})
