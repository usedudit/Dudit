import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { unstable_cache } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { generateShortId, isUuid } from "@/lib/utils/short-id"

/**
 * Fetches all quotes for a partner, including customer name and items count.
 * Uses getAdminClient to bypass RLS (filtered by partner_id) and
 * implements cross-request caching (unstable_cache) + per-request deduplication (cache).
 */
const partnerQuotesCacheMap = new Map<string, any>()

export const getPartnerQuotesCached = cache(async (partnerId: string, storeId: string, limit: number = 50, offset: number = 0) => {
    const mapKey = `${partnerId}:${storeId}:${limit}:${offset}`
    let cachedFn = partnerQuotesCacheMap.get(mapKey)
    if (!cachedFn) {
        cachedFn = unstable_cache(
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
            [TAGS.quotes(partnerId), storeId, String(limit), String(offset)],
            {
                tags: [TAGS.quotes(partnerId)]
            }
        )
        partnerQuotesCacheMap.set(mapKey, cachedFn)
    }
    return cachedFn(partnerId, storeId, limit, offset)
})

/**
 * Fetches a single quote with its items.
 * Used for detail/edit views.
 */
const quoteWithItemsCacheMap = new Map<string, any>()

export const getQuoteWithItemsCached = cache(async (quoteId: string, partnerId: string) => {
    let cachedFn = quoteWithItemsCacheMap.get(quoteId)
    if (!cachedFn) {
        cachedFn = unstable_cache(
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

                if (!quote.public_token || isUuid(quote.public_token)) {
                    const newToken = generateShortId()
                    await supabase.from("quotes").update({ public_token: newToken }).eq("id", quoteId)
                    quote.public_token = newToken
                }

                const { data: items, error: itemsError } = await supabase
                    .from("quote_items")
                    .select(`
                        *,
                        products (
                            id, 
                            name, 
                            sku, 
                            images, 
                            price, 
                            stock_quantity, 
                            allow_sell_without_stock,
                            product_variants (
                                id,
                                variant_name,
                                sku,
                                variant_options
                            )
                        )
                    `)
                    .eq("quote_id", quoteId)
                    .order("sort_order", { ascending: true })

                if (itemsError) {
                    console.error("[getQuoteWithItems] Items error:", itemsError)
                }

                const mappedItems = (items || []).map((item: any) => {
                    let resolvedImage = item.products?.images?.[0] || 'https://img.dudit.com.br/static/Placeholder.png';
                    if (item.custom_name && item.products?.product_variants) {
                        const customName = item.custom_name.trim();
                        const productName = item.products.name || "";
                        const suffix = customName.startsWith(productName)
                            ? customName.slice(productName.length).replace(/^[\s-–-]+/, "").trim()
                            : customName;

                        const match = item.products.product_variants.find(
                            (v: any) =>
                                v.variant_name?.toLowerCase().trim() === suffix.toLowerCase() ||
                                v.variant_name?.toLowerCase().trim() === customName.toLowerCase() ||
                                (item.product_sku_snapshot && v.sku?.toLowerCase().trim() === item.product_sku_snapshot.toLowerCase().trim())
                        );
                        if (match?.variant_options?.image) {
                            resolvedImage = match.variant_options.image;
                        }
                    }
                    return {
                        ...item,
                        image: resolvedImage
                    };
                });

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
                    items: mappedItems,
                    user_profiles: userProfile
                }
            },
            [`quote-${quoteId}`],
            {
                tags: [TAGS.quotes(partnerId), `quote-${quoteId}`]
            }
        )
        quoteWithItemsCacheMap.set(quoteId, cachedFn)
    }
    return cachedFn()
})
