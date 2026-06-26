import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { unstable_cache } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

/**
 * Fetches all quotes for a partner, including customer name and items count.
 * Uses getAdminClient to bypass RLS (filtered by partner_id) and
 * implements cross-request caching (unstable_cache) + per-request deduplication (cache).
 */
export const getPartnerQuotesCached = cache(async (partnerId: string, limit: number = 50, offset: number = 0) => {
    return unstable_cache(
        async () => {
            const supabase = getAdminClient()
            const { data, error, count } = await supabase
                .from("quotes")
                .select(`
                    id,
                    quote_number,
                    status,
                    issue_date,
                    expiration_date,
                    total,
                    customer_id,
                    created_at,
                    updated_at,
                    customers (id, name, email),
                    items_count:quote_items(count)
                `, { count: 'exact' })
                .eq("partner_id", partnerId)
                .order("created_at", { ascending: false })
                .range(offset, offset + limit - 1)

            if (error) {
                console.error("[getPartnerQuotesCached] Error:", error)
                return { data: [], total: 0 }
            }

            // Mark expired quotes on read (virtual status, never for finalized)
            const now = new Date()
            now.setHours(0, 0, 0, 0)
            const finalizedStatuses = ['approved', 'rejected', 'expired', 'cancelled', 'converted_to_order']

            const mappedData = (data || []).map((q: any) => {
                if (
                    q.expiration_date &&
                    !finalizedStatuses.includes(q.status) &&
                    new Date(q.expiration_date) < now
                ) {
                    return { ...q, status: 'expired', _originalStatus: q.status }
                }
                return q
            })

            return { data: mappedData, total: count || 0 }
        },
        [TAGS.quotes(partnerId), String(limit), String(offset)],
        {
            tags: [TAGS.quotes(partnerId)]
        }
    )()
})

/**
 * Fetches a single quote with its items.
 * Used for detail/edit views.
 */
export const getQuoteWithItemsCached = cache(async (quoteId: string, partnerId: string) => {
    return unstable_cache(
        async () => {
            const supabase = getAdminClient()

            const { data: quote, error: quoteError } = await supabase
                .from("quotes")
                .select(`
                    *,
                    customers (
                        id, 
                        name, 
                        email, 
                        phone,
                        addresses (*)
                    )
                `)
                .eq("id", quoteId)
                .eq("partner_id", partnerId)
                .single()

            if (quoteError || !quote) {
                console.error("[getQuoteWithItems] Quote error:", quoteError)
                return null
            }

            const { data: items, error: itemsError } = await supabase
                .from("quote_items")
                .select(`
                    *,
                    products (id, name, sku, images, price, stock_quantity, allow_sell_without_stock)
                `)
                .eq("quote_id", quoteId)
                .order("sort_order", { ascending: true })

            if (itemsError) {
                console.error("[getQuoteWithItems] Items error:", itemsError)
            }

            let userProfile = null
            if (quote.user_id) {
                const { data: profile } = await supabase
                    .from("user_profiles")
                    .select("full_name")
                    .eq("user_id", quote.user_id)
                    .maybeSingle()
                if (profile) {
                    const { data: authData } = await supabase.auth.admin.getUserById(quote.user_id)
                    const authUser = authData?.user ? { email: authData.user.email } : null
                    userProfile = {
                        full_name: profile.full_name,
                        email: authUser?.email || null
                    }
                }
            }

            return {
                ...quote,
                items: items || [],
                user_profiles: userProfile
            }
        },
        [`quote-${quoteId}`],
        {
            tags: [TAGS.quotes(partnerId), `quote-${quoteId}`]
        }
    )()
})
