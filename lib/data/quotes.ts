import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { unstable_cache } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

/**
 * Fetches all quotes for a partner, including customer name and items count.
 * Uses getAdminClient to bypass RLS (filtered by partner_id) and
 * implements cross-request caching (unstable_cache) + per-request deduplication (cache).
 */
export const getPartnerQuotesCached = cache(async (partnerId: string) => {
    return unstable_cache(
        async () => {
            const supabase = getAdminClient()
            const { data, error } = await supabase
                .from("quotes")
                .select(`
                    id,
                    quote_number,
                    status,
                    issue_date,
                    expiration_date,
                    subtotal,
                    discount_type,
                    discount_value,
                    shipping_cost,
                    additional_costs,
                    total,
                    notes,
                    user_id,
                    customer_id,
                    created_at,
                    updated_at,
                    customers (id, name, email, phone),
                    user_profiles:user_id (full_name)
                `)
                .eq("partner_id", partnerId)
                .order("created_at", { ascending: false })

            if (error) {
                console.error("[getPartnerQuotesCached] Error:", error)
                return []
            }

            // Mark expired quotes on read (virtual status)
            const now = new Date()
            now.setHours(0, 0, 0, 0)

            return (data || []).map((q: any) => {
                // If the quote is still "sent" or "draft" but past expiration, show as expired
                if (
                    q.expiration_date &&
                    (q.status === 'draft' || q.status === 'sent') &&
                    new Date(q.expiration_date) < now
                ) {
                    return { ...q, status: 'expired', _originalStatus: q.status }
                }
                return q
            })
        },
        [TAGS.quotes(partnerId)],
        {
            tags: [TAGS.quotes(partnerId)],
            revalidate: 5
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
                    customers (id, name, email, phone)
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
                    products (id, name, sku, images, price)
                `)
                .eq("quote_id", quoteId)
                .order("sort_order", { ascending: true })

            if (itemsError) {
                console.error("[getQuoteWithItems] Items error:", itemsError)
            }

            return {
                ...quote,
                items: items || []
            }
        },
        [`quote-${quoteId}`],
        {
            tags: [TAGS.quotes(partnerId), `quote-${quoteId}`],
            revalidate: 5
        }
    )()
})
