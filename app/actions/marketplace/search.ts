"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { redis } from "@/lib/redis"

// Funções Helpers
import { cache } from "react"
import { MarketplaceSearchType } from "@/lib/types/marketplace"
import { getCurrentUser } from "@/lib/auth/server-user"
import { getUserSessionData } from "@/lib/data/user"
import { enrichMarketplaceDistance } from "@/lib/services/location.service"
import { resolveCityAndStateFromSlug } from "./products"
import { buildMarketplaceTsQuery } from "@/lib/search/build-tsquery"

function extractFirstVariantFallback(variants: any[] | null | undefined, basePrice: number) {
    if (!variants || variants.length === 0) return { fallback_variant_image: null, fallback_variant_price: null }
    const withImage = variants.find((v: any) => v.is_active && v.variant_options?.image)
    const first = variants.find((v: any) => v.is_active) || variants[0]
    const image = withImage?.variant_options?.image || null
    const priceAdj = first?.price_adjustment
    const price = priceAdj && priceAdj > 0 ? priceAdj : null
    return { fallback_variant_image: image, fallback_variant_price: price }
}

function normalizePlan(item: any) {
    const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
    const partner = rawPartner ? {
        ...rawPartner,
        store_avatar: rawPartner.store_image_url || rawPartner.store_avatar || "https://img.dudit.com.br/static/Placeholder.png",
        latitude: rawPartner.latitude,
        longitude: rawPartner.longitude,
        city: rawPartner.addresses?.[0]?.city || null,
        state: rawPartner.addresses?.[0]?.state || null
    } : null

    let computedPrice = 0
    let firstImage: string | null = null

    if (item.recurring_plan_items && Array.isArray(item.recurring_plan_items)) {
        for (const planItem of item.recurring_plan_items) {
            const qty = Number(planItem.quantity || 1)
            let itemPrice = Number(planItem.unit_price || 0)
            
            if (itemPrice <= 0) {
                if (planItem.item_type === 'product' && planItem.products) {
                    itemPrice = Number(planItem.products.price || 0)
                } else if (planItem.item_type === 'service' && planItem.services) {
                    itemPrice = Number(planItem.services.price || 0)
                }
            }
            computedPrice += qty * itemPrice

            if (!firstImage && planItem.item_type === 'product' && planItem.products?.images) {
                const imgs = planItem.products.images
                if (Array.isArray(imgs) && imgs.length > 0) {
                    firstImage = imgs[0]
                }
            }
        }
    }

    const image = firstImage || rawPartner?.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"

    return {
        id: item.id,
        name: item.name,
        description: item.description,
        price: computedPrice,
        images: [image],
        itemType: 'plano',
        partners: partner,
        frequency_type: item.frequency_type,
        frequency_interval: item.frequency_interval,
        created_at: item.created_at,
        subcategoryName: null
    }
}

/**
 * FUNÇÃO DIRETA para uso em Server Components (SSR).
 * Sem rate limiting, sem overhead de serialização de Server Action.
 * NÃO EXPOSTA como export de "use server" - só pode ser importada pelo servidor.
 */

export const searchMarketplaceDirect = cache(async (
    query: string,
    type: MarketplaceSearchType,
    limits: { vitrines?: number; produtos?: number; servicos?: number; planos?: number; geral?: number; cursor?: number; lastId?: string; cidade?: string } = {}
) => {
    const { results } = await _searchMarketplaceCore(query, type, limits)
    const user = await getCurrentUser()
    if (!user) return results

    const sessionData = await getUserSessionData(user.id)
    const coords = sessionData?.profile?.latitude && sessionData?.profile?.longitude
        ? { lat: sessionData.profile.latitude, lng: sessionData.profile.longitude }
        : null

    return enrichMarketplaceDistance(results || [], coords)
})

export type MarketplaceListCursor = { createdAt?: string; id: string; rank?: number }

/**
 * SERVER ACTION para uso do CLIENT (infinite scroll, busca manual).
 * Aplica rate limiting para proteção contra bots.
 */
export const searchMarketplace = async (
    query: string,
    type: 'produtos' | 'servicos' | 'vitrines' | 'tudo' | 'planos' = 'tudo',
    limits: { vitrines?: number; produtos?: number; servicos?: number; planos?: number; geral?: number; cursor?: MarketplaceListCursor | null; cidade?: string } = {}
) => {
    // Rate limit APENAS para chamadas do client (POST / Server Actions)
    const { success } = await requireRateLimit(RateLimitCategory.API_GENERAL)
    if (!success) {
        console.warn("[Security] Rate limit exceeded on searchMarketplace")
        return { items: [], nextCursor: null, hasMore: false as const }
    }

    const cursor = limits.cursor ?? null
    const cursorMs = cursor?.createdAt ? new Date(cursor.createdAt).getTime() : undefined
    const lastId = cursor?.id || undefined
    const cursorRank = typeof cursor?.rank === "number" ? cursor.rank : undefined

    const { results } = await _searchMarketplaceCore(query, type, {
        vitrines: limits.vitrines,
        produtos: limits.produtos,
        servicos: limits.servicos,
        planos: limits.planos,
        geral: limits.geral,
        cursor: Number.isFinite(cursorMs as any) ? cursorMs : undefined,
        lastId,
        cursorRank,
        cidade: limits.cidade,
    })

    const user = await getCurrentUser()
    const sessionData = user ? await getUserSessionData(user.id) : null
    const coords = sessionData?.profile?.latitude && sessionData?.profile?.longitude
        ? { lat: sessionData.profile.latitude, lng: sessionData.profile.longitude }
        : null
    const resultsWithDistance = enrichMarketplaceDistance(results || [], coords)

    // Normalize pagination response to the app-wide standard.
    const items = resultsWithDistance || []
    const last = items[items.length - 1]
    const nextCursor: MarketplaceListCursor | null = last?.id
        ? {
            id: String(last.id),
            ...(last.created_at ? { createdAt: String(last.created_at) } : {}),
            ...(typeof last._searchRank === "number" ? { rank: last._searchRank } : {}),
        }
        : null

    // This search backend doesn’t currently expose an exact hasMore flag.
    // We conservatively assume "hasMore" when we got a full page.
    // We assume "hasMore" when we got a full page.
    const limitCount =
        type === "tudo"
            ? (limits.geral ?? 40)
            : type === "vitrines"
                ? (limits.vitrines ?? 40) // Standardizing to 40 for client searches
                : type === "produtos"
                    ? (limits.produtos ?? 20)
                    : type === "planos"
                        ? (limits.planos ?? 20)
                        : (limits.servicos ?? 20)

    const hasMore = items.length >= limitCount && !!nextCursor
    return { items, nextCursor, hasMore }
}



const GLOBAL_VERSION_KEY = "marketplace:global_cache_version"

const serializeSearchKey = (query: string, type: string, limits: any) => {
    return [query, type, limits.vitrines, limits.produtos, limits.servicos, limits.geral, limits.cursor, limits.lastId].map(String).join(":")
}

async function _searchMarketplaceCore(
    query: string,
    type: 'produtos' | 'servicos' | 'vitrines' | 'tudo' | 'planos' = 'tudo',
    limits: { vitrines?: number; produtos?: number; servicos?: number; planos?: number; geral?: number; cursor?: number; lastId?: string; cursorRank?: number; cidade?: string } = {}
): Promise<{ results: any[], filteredIds: string[] }> {
    if (limits.cidade) {
        return searchMarketplaceByCity(query, type, limits.cidade, limits)
    }

    const isPagination = limits.cursor !== undefined || limits.lastId !== undefined

    // Inline version read
    const tV0 = performance.now()
    let version: number = 3 // Bumping to v3 for the latitude/longitude cache format change
    try { version = (await redis.get<number>(GLOBAL_VERSION_KEY)) || 3 } catch { }
    const tV1 = performance.now()
    if (tV1 - tV0 > 1000) console.warn(`[REDIS] SLOW VERSION READ: ${(tV1 - tV0).toFixed(1)}ms`)

    const queryHash = serializeSearchKey(query, type, limits)
    const safeHash = Buffer.from(queryHash).toString('base64').replace(/=/g, '')
    const cacheKey = `mp:cache:v${version}:ids:${safeHash}` // Specific key for IDs

    // 1. TRY CACHE HIT (IDs only)
    if (!isPagination) {
        try {
            const tR0 = performance.now()
            const cachedIds = await redis.get<string[]>(cacheKey)
            const tR1 = performance.now()

            if (tR1 - tR0 > 1000) console.warn(`[REDIS] SLOW ID FETCH (${cacheKey}): ${(tR1 - tR0).toFixed(1)}ms`)
            if (cachedIds && Array.isArray(cachedIds)) {
                console.log(`[REDIS] HIT (IDs) ${cacheKey} | Fetching ${cachedIds.length} objects...`)

                const dataKeys = cachedIds.map(id => `data:v2:${id}`)
                const objectsRaw = await redis.mget(...dataKeys)

                const objects = objectsRaw
                    .map((obj: any) => typeof obj === 'string' ? JSON.parse(obj) : obj)
                    .filter(Boolean)

                // If we found ALL objects in Redis, we can return immediately (Instant Update!)
                if (objects.length === cachedIds.length) {
                    return { results: objects, filteredIds: cachedIds }
                }

                console.log(`[REDIS] Partial Miss (${objects.length}/${cachedIds.length}). Falling back to Internal Search.`)
            }
        } catch (err) {
            console.error("[REDIS] Error reading ID cache", err)
        }
    }

    // 2. CACHE MISS / PARTIAL MISS: Run heavy search logic
    const { results, filteredIds } = await _searchMarketplaceInternal(query, type, limits)

    // 3. WRITE TO CACHE (IDs only)
    if (!isPagination && filteredIds && filteredIds.length > 0) {
        try {
            await redis.set(cacheKey, JSON.stringify(filteredIds), { ex: 60 * 60 * 24 })
            console.log(`[REDIS] SET (IDs) ${cacheKey}`)
        } catch (err) {
            console.error("[REDIS] Error setting ID cache", err)
        }
    }

    return { results, filteredIds }
}


/**
 * CORE interno - lógica pura de busca original. Sem rate limiting.
 */
async function _searchMarketplaceInternal(
    query: string,
    type: 'produtos' | 'servicos' | 'vitrines' | 'tudo' | 'planos' = 'tudo',
    limits: { vitrines?: number; produtos?: number; servicos?: number; planos?: number; geral?: number; cursor?: number; lastId?: string; cursorRank?: number } = {}
): Promise<{ results: any[], filteredIds: string[] }> {
    const { vitrines: vitLimit = 4, produtos: prodLimit = 20, servicos: servLimit = 20, planos: planosLimit = 20, geral = 40, cursor, lastId, cursorRank } = limits

    // ANTI-SCRAPING / DEPTH RESTRICTION
    if (cursor && Date.now() - cursor > 1000 * 60 * 60 * 24 * 365 * 10) {
        console.warn(`[Security] Scraping attempt or invalid cursor depth: ${cursor}`)
        return { results: [], filteredIds: [] }
    }

    // Se tem query de busca em texto puro, fazemos fallback pro Postgres FTS (busca aproximada)
    if (query) {
        return searchMarketplacePostgresFTS(query, type, limits)
    }

    try {
        const limitCount = type === 'tudo' ? geral : (type === 'vitrines' ? vitLimit : (type === 'produtos' ? prodLimit : (type === 'planos' ? planosLimit : servLimit)))
        const indexKey = type === 'tudo' ? 'explore:index:all' : `explore:index:${type}`

        const tRedisZero = performance.now()

        // COMPOSITE CURSOR LOGIC (Evita duplicados quando dois itens têm exatamente o mesmo score/timestamp)
        // Usamos range EXCLUSIVA com `(` para não re-incluir itens do cursor anterior
        const startScore = cursor ? `(${cursor}` : "+inf"
        const ids = (await redis.zrange(indexKey, startScore as any, "-inf", { byScore: true, rev: true, offset: 0, count: limitCount + 5 })) as string[]

        if (!ids || ids.length === 0) {
            // SAFE FALLBACK: Se o índice do Redis estiver vazio (ex: após limpeza ou falha de sync),
            // tentamos buscar no Postgres FTS para não deixar o marketplace vazio.
            // Apenas para a primeira página (sem cursor/lastId).
            if (!cursor && !lastId) {
                console.log(`[REDIS] Index ${indexKey} is empty. Falling back to Postgres FTS for ${type}.`)
                return await searchMarketplacePostgresFTS(query, type, limits)
            }
            return { results: [], filteredIds: [] }
        }

        let filteredIds = ids
        if (lastId) {
            let prefix = 'produto'
            switch (type) {
                case 'tudo':
                case 'produtos':
                    prefix = 'produto'
                    break
                case 'servicos':
                    prefix = 'servico'
                    break
                case 'vitrines':
                    prefix = 'loja'
                    break
                case 'planos':
                    prefix = 'plano'
                    break
            }
            // Buscando o index que foi visto por útimo
            const lastIdx = ids.findIndex(id => id.endsWith(`:${lastId}`))
            if (lastIdx !== -1) {
                // Ignoramos todos os elementos que vieram antes e incluindo o lastId
                filteredIds = ids.slice(lastIdx + 1)
            } else {
                // Se não achou o lastId no lote, mas tinha um score, pra não duplicar ou dar ruim, fazemos fallback de exclusividade
                // Isso ocorre raramente se o item mudar de score entre buscas
            }
        }

        filteredIds = filteredIds.slice(0, limitCount)
        if (!filteredIds.length) return { results: [], filteredIds: [] }

        const dataKeys = filteredIds.map(id => `data:v2:${id}`)

        const tRedisKeys = performance.now()
        const cachedObjectsRaw = await redis.mget(...dataKeys)

        const cachedObjects = cachedObjectsRaw.map((obj: any) =>
            typeof obj === 'string' ? JSON.parse(obj) : obj
        )

        const missingIndices = cachedObjects.reduce((acc: number[], obj: any, idx: number) => {
            if (!obj) acc.push(idx)
            return acc
        }, [])

        let finalData = [...cachedObjects]

        // SAFE POSTGRES FALLBACK logic (sem writes na rota de read para evitar bottleneck na view)
        if (missingIndices.length > 0) {
            const supabase = getAdminClient()
            const missingIds = missingIndices.map(idx => filteredIds[idx])

            const produtosIds = missingIds.filter((id: string) => id.startsWith('produto:')).map((id: string) => id.replace('produto:', ''))
            const servicosIds = missingIds.filter((id: string) => id.startsWith('servico:')).map((id: string) => id.replace('servico:', ''))
            const lojasIds = missingIds.filter((id: string) => id.startsWith('loja:')).map((id: string) => id.replace('loja:', ''))
            const planosIds = missingIds.filter((id: string) => id.startsWith('plano:')).map((id: string) => id.replace('plano:', ''))

            const promises = []

            if (produtosIds.length > 0) {
                promises.push(
                    supabase.from("products").select(`
                        id, name, description, price, promotional_price, stock_available, stock_quantity, images, video_thumbnail, rating,
                        category_id, category:product_categories!category_id(name), created_at,
                        marketplace_category_id, marketplace_category:marketplace_product_categories!marketplace_category_id(name, parent:marketplace_product_categories!parent_id(name)),
                        partners(id, store_name, store_image_url, latitude, longitude, addresses(city, state)),
                        product_variants(variant_options, price_adjustment, is_active),
                        show_price_in_store
                    `)
                        .in("id", produtosIds)
                        .eq("is_active", true)
                        .eq("show_in_marketplace", true)
                )
            }
            if (servicosIds.length > 0) {
                promises.push(
                    supabase.from("services").select(`
                        id, name, description, price, promotional_price, images, rating, category, category_id, duration_minutes, billing_unit, price_type, created_at,
                        service_categories:service_categories!category_id(name),
                        partners(id, store_name, store_image_url, latitude, longitude, addresses(city, state)),
                        show_price_in_store
                    `)
                        .in("id", servicosIds)
                        .eq("is_active", true)
                        .eq("show_in_marketplace", true)
                )
            }
            if (lojasIds.length > 0) {
                promises.push(
                    supabase.from("partners").select(`
                        id, store_name, store_description, store_image_url, banner_url, logo_moderation_status, banner_moderation_status, rating, latitude, longitude, created_at, category_id, category:marketplace_partner_categories!category_id(name, slug, parent:marketplace_partner_categories!parent_id(name)), addresses(city, state), reviews(count)
                    `).in("id", lojasIds)
                )
            }
            if (planosIds.length > 0) {
                promises.push(
                    supabase.from("recurring_plans").select(`
                        id, name, description, status, show_in_marketplace, partner_id, frequency_type, frequency_interval, created_at,
                        partners(id, store_name, store_image_url, latitude, longitude, addresses(city, state)),
                        recurring_plan_items(
                            id, item_type, product_id, variant_id, service_id, quantity, unit_price,
                            products:product_id(id, name, price, images),
                            services:service_id(id, name, price, duration_minutes)
                        )
                    `)
                        .in("id", planosIds)
                        .eq("status", "active")
                        .eq("show_in_marketplace", true)
                )
            }

            const results = await Promise.all(promises)
            let fallbackRecords: any[] = []

            results.forEach((res) => {
                if (res.data) fallbackRecords = fallbackRecords.concat(res.data)
            })

            const normalizeRecord = (item: any) => {
                if (item.store_name) {
                    return {
                        id: item.id, name: item.store_name, description: item.store_description,
                        images: [item.banner_url || item.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"],
                        rating: item.rating, itemType: 'loja', category: item.category?.parent?.name || item.category?.name || 'Loja Parceira',
                        partners: {
                            id: item.id, store_name: item.store_name,
                            store_avatar: item.store_image_url || item.store_avatar || "https://img.dudit.com.br/static/Placeholder.png",
                            banner_url: item.banner_url || null,
                            logo_moderation_status: item.logo_moderation_status || "approved",
                            banner_moderation_status: item.banner_moderation_status || "approved",
                            latitude: item.latitude, longitude: item.longitude,
                            city: item.addresses?.[0]?.city || null, state: item.addresses?.[0]?.state || null,
                            reviewsCount: item.reviews?.[0]?.count || 0
                        }, created_at: item.created_at
                    }
                }

                if (item.frequency_type !== undefined) {
                    return normalizePlan(item)
                }

                const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
                const partner = rawPartner ? {
                    ...rawPartner,
                    store_avatar: rawPartner.store_image_url || rawPartner.store_avatar || "https://img.dudit.com.br/static/Placeholder.png",
                    latitude: rawPartner.latitude, longitude: rawPartner.longitude,
                    city: rawPartner.addresses?.[0]?.city || null, state: rawPartner.addresses?.[0]?.state || null
                } : null

                if (item.product_variants !== undefined) {
                    const variantFallback = extractFirstVariantFallback(item.product_variants, Number(item.price))
                    const { product_variants, ...rest } = item
                    return {
                        ...rest,
                        category: item.marketplace_category?.parent?.name || item.marketplace_category?.name || item.category?.name || null,
                        subcategoryName: item.marketplace_category?.parent ? item.marketplace_category.name : (item.subcategory?.name || null),
                        itemType: 'produto',
                        partners: partner,
                        ...variantFallback
                    }
                }

                const serviceCategoryName = item.service_categories?.name || item.category || null
                return { ...item, category: serviceCategoryName, itemType: 'servico', partners: partner, subcategoryName: serviceCategoryName }
            }

            for (const idx of missingIndices) {
                const globalId = filteredIds[idx]
                const rawId = globalId.split(':')[1]

                const found = fallbackRecords.find(r => r.id === rawId)
                if (found) {
                    const normalized = normalizeRecord(found)
                    finalData[idx] = normalized
                    // NÃO SALVA NO REDIS AQUI: O Webhook/Cron job cuidará disso para manter O(1) reads puros.
                }
            }
        }

        const cleanData = finalData.filter(Boolean)
        if (process.env.NODE_ENV !== "production" && cleanData.length < filteredIds.length) {
            console.warn(`[MarketplaceTrace] API/search: ${filteredIds.length - cleanData.length} ids sem objeto (${type}, query="${query}")`)
        }
        const tFinal = performance.now()

        const totalRequested = filteredIds.length
        const hits = totalRequested - missingIndices.length
        const hitRate = totalRequested > 0 ? ((hits / totalRequested) * 100).toFixed(1) : "0.0"
        const redisLatency = (tRedisKeys - tRedisZero).toFixed(1)
        const mgetLatency = (tFinal - tRedisKeys).toFixed(1)
        const source = missingIndices.length === 0 ? 'Redis' : (hits === 0 ? 'Postgres' : 'Mixed')

        return { results: cleanData, filteredIds: filteredIds }

    } catch (error) {
        console.error("[Redis DOWN] Falling back to Postgres:", error)
        try {
            console.warn(`[DEGRADED MODE] Redis unavailable, using Postgres fallback`)
            return await searchMarketplacePostgresFTS("", type, { vitrines: vitLimit, produtos: prodLimit, servicos: servLimit })
        } catch (pgError) {
            console.error("[TOTAL FAILURE] Both Redis and Postgres failed. Returning empty:", pgError)
            return { results: [], filteredIds: [] }
        }
    }
}



// Lógica de FTS (Full-Text Search) — PostgreSQL ts_rank_cd via RPC
type MarketplaceSearchHit = { item_type: string; id: string; rank: number; created_at: string }

async function hydrateMarketplaceSearchHits(
    hits: MarketplaceSearchHit[],
    supabase: ReturnType<typeof getAdminClient>
): Promise<any[]> {
    if (!hits.length) return []

    const produtosIds = hits.filter(h => h.item_type === "produto").map(h => h.id)
    const servicosIds = hits.filter(h => h.item_type === "servico").map(h => h.id)
    const lojasIds = hits.filter(h => h.item_type === "loja").map(h => h.id)
    const planosIds = hits.filter(h => h.item_type === "plano").map(h => h.id)

    const promises = []

    if (produtosIds.length > 0) {
        promises.push(
            supabase.from("products").select(`
                id, name, description, price, promotional_price, stock_available, stock_quantity, images, rating,
                category_id, category:product_categories!category_id(name), created_at,
                marketplace_category_id, marketplace_category:marketplace_product_categories!marketplace_category_id(name, parent:marketplace_product_categories!parent_id(name)),
                subcategory_id, subcategory:product_categories!subcategory_id(name),
                partners(id, store_name, store_image_url, latitude, longitude, addresses(city, state)),
                product_variants(variant_options, price_adjustment, is_active),
                show_price_in_store
            `)
                .in("id", produtosIds)
                .eq("is_active", true)
                .eq("show_in_marketplace", true)
        )
    }
    if (servicosIds.length > 0) {
        promises.push(
            supabase.from("services").select(`
                id, name, description, price, promotional_price, images, rating, category, category_id, duration_minutes, billing_unit, price_type, created_at,
                service_categories:service_categories!category_id(name),
                partners(id, store_name, store_image_url, latitude, longitude, addresses(city, state)),
                show_price_in_store
            `)
                .in("id", servicosIds)
                .eq("is_active", true)
                .eq("show_in_marketplace", true)
        )
    }
    if (lojasIds.length > 0) {
        promises.push(
            supabase.from("partners").select(`
                id, store_name, store_description, store_image_url, banner_url, logo_moderation_status, banner_moderation_status, rating, latitude, longitude, created_at, category_id, category:marketplace_partner_categories!category_id(name, slug, parent:marketplace_partner_categories!parent_id(name)), addresses(city, state), reviews(count)
            `).in("id", lojasIds)
        )
    }
    if (planosIds.length > 0) {
        promises.push(
            supabase.from("recurring_plans").select(`
                id, name, description, status, show_in_marketplace, partner_id, frequency_type, frequency_interval, created_at,
                partners(id, store_name, store_image_url, latitude, longitude, addresses(city, state)),
                recurring_plan_items(
                    id, item_type, product_id, variant_id, service_id, quantity, unit_price,
                    products:product_id(id, name, price, images),
                    services:service_id(id, name, price, duration_minutes)
                )
            `)
                .in("id", planosIds)
                .eq("status", "active")
                .eq("show_in_marketplace", true)
        )
    }

    const queryResults = await Promise.all(promises)
    const recordMap = new Map<string, any>()

    queryResults.forEach((res) => {
        if (res.data) {
            for (const row of res.data) {
                recordMap.set(String(row.id), row)
            }
        }
    })

    const results: any[] = []

    for (const hit of hits) {
        const item = recordMap.get(hit.id)
        if (!item) continue

        if (hit.item_type === "loja") {
            results.push({
                id: item.id,
                name: item.store_name,
                description: item.store_description,
                images: [item.banner_url || item.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"],
                rating: item.rating,
                itemType: "loja",
                category: item.category?.parent?.name || item.category?.name || "Loja Parceira",
                partners: {
                    id: item.id,
                    store_name: item.store_name,
                    store_avatar: item.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
                    banner_url: item.banner_url || null,
                    logo_moderation_status: item.logo_moderation_status || "approved",
                    banner_moderation_status: item.banner_moderation_status || "approved",
                    latitude: item.latitude,
                    longitude: item.longitude,
                    city: item.addresses?.[0]?.city || null,
                    state: item.addresses?.[0]?.state || null,
                    reviewsCount: item.reviews?.[0]?.count || 0,
                },
                created_at: item.created_at,
                _searchRank: hit.rank,
            })
            continue
        }

        if (hit.item_type === "plano") {
            results.push({ ...normalizePlan(item), _searchRank: hit.rank })
            continue
        }

        const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
        const partner = rawPartner ? {
            ...rawPartner,
            store_avatar: rawPartner.store_image_url || rawPartner.store_avatar || "https://img.dudit.com.br/static/Placeholder.png",
            latitude: rawPartner.latitude,
            longitude: rawPartner.longitude,
            city: rawPartner.addresses?.[0]?.city || null,
            state: rawPartner.addresses?.[0]?.state || null,
        } : null

        if (hit.item_type === "produto") {
            const variantFallback = extractFirstVariantFallback(item.product_variants, Number(item.price))
            const { product_variants, ...rest } = item
            results.push({
                ...rest,
                category: item.marketplace_category?.parent?.name || item.marketplace_category?.name || item.category?.name || null,
                subcategoryName: item.marketplace_category?.parent ? item.marketplace_category.name : (item.subcategory?.name || null),
                itemType: "produto",
                partners: partner,
                ...variantFallback,
                _searchRank: hit.rank,
            })
            continue
        }

        const serviceCategoryName = item.service_categories?.name || item.category || null
        results.push({
            ...item,
            category: serviceCategoryName,
            itemType: "servico",
            partners: partner,
            subcategoryName: serviceCategoryName,
            _searchRank: hit.rank,
        })
    }

    return results
}

async function searchMarketplacePostgresFTS(
    query: string,
    type: 'produtos' | 'servicos' | 'vitrines' | 'tudo' | 'planos' = 'tudo',
    limits: { vitrines?: number; produtos?: number; servicos?: number; planos?: number; geral?: number; cursor?: number; lastId?: string; cursorRank?: number; partnerIds?: string[] } = {}
) {
    const { vitrines: vitLimit = 4, produtos: prodLimit = 20, servicos: servLimit = 20, planos: planosLimit = 20, geral = 40, lastId, cursorRank, partnerIds } = limits
    const supabase = getAdminClient()

    const tsQuery = buildMarketplaceTsQuery(query)
    if (!tsQuery) {
        return { results: [], filteredIds: [] }
    }

    const limitCount = type === 'tudo'
        ? geral
        : type === 'vitrines'
            ? vitLimit
            : type === 'produtos'
                ? prodLimit
                : type === 'planos'
                    ? planosLimit
                    : servLimit

    try {
        const { data: hits, error } = await supabase.rpc("search_marketplace", {
            p_tsquery: tsQuery,
            p_type: type,
            p_limit: limitCount,
            p_cursor_rank: cursorRank ?? null,
            p_cursor_id: lastId ?? null,
            p_partner_ids: partnerIds?.length ? partnerIds : null,
        })

        if (error) {
            console.error("Search FTS RPC Error:", error)
            return { results: [], filteredIds: [] }
        }

        const rankedHits = (hits || []) as MarketplaceSearchHit[]
        const results = await hydrateMarketplaceSearchHits(rankedHits, supabase)
        const finalIds = results.map(r => `${r.itemType}:${r.id}`)
        return { results, filteredIds: finalIds }
    } catch (error) {
        console.error("Search FTS Postgres Error:", error)
        return { results: [], filteredIds: [] }
    }
}

async function searchMarketplaceByCity(
    query: string,
    type: 'produtos' | 'servicos' | 'vitrines' | 'tudo' | 'planos',
    cidadeSlug: string,
    limits: { vitrines?: number; produtos?: number; servicos?: number; planos?: number; geral?: number; lastId?: string; cursorRank?: number }
) {
    const supabase = getAdminClient()
    const parts = cidadeSlug.split("-")
    const state = parts.pop()?.toUpperCase() || ""
    const targetCitySlug = parts.join("-")

    const resolved = await resolveCityAndStateFromSlug(cidadeSlug)
    const dbCity = resolved?.city
    const dbState = resolved?.state || state

    let partnersQuery = supabase
        .from("partners")
        .select("id, addresses!inner(city, state)")
        .eq("is_active", true)
        .eq("addresses.state", dbState)

    if (dbCity) {
        partnersQuery = partnersQuery.eq("addresses.city", dbCity)
    } else {
        partnersQuery = partnersQuery.ilike("addresses.city", targetCitySlug.replace(/-/g, ' '))
    }

    const partnersRes = await partnersQuery
    const partnerIds = (partnersRes.data || []).map((p: any) => p.id)

    if (!partnerIds.length) {
        return { results: [], filteredIds: [] }
    }

    if (query.trim()) {
        return searchMarketplacePostgresFTS(query, type, {
            ...limits,
            partnerIds,
            lastId: limits.lastId,
            cursorRank: limits.cursorRank,
        })
    }

    // Browse mode within city: fetch marketplace items for local partners (no text query)
    const limitCount = type === 'tudo'
        ? (limits.geral ?? 40)
        : type === 'vitrines'
            ? (limits.vitrines ?? 40)
            : type === 'produtos'
                ? (limits.produtos ?? 20)
                : type === 'planos'
                    ? (limits.planos ?? 20)
                    : (limits.servicos ?? 20)

    let rawProducts: any[] = []
    let rawServices: any[] = []
    let rawPlans: any[] = []
    let filteredPartners: any[] = []

    const partnerDetailsRes = await supabase
        .from("partners")
        .select(`
            id, store_name, store_description, store_image_url, banner_url,
            logo_moderation_status, banner_moderation_status, rating, latitude, longitude,
            created_at,
            category_id,
            category:marketplace_partner_categories!category_id(name, slug, parent:marketplace_partner_categories!parent_id(name)),
            addresses!inner(city, state),
            reviews(count)
        `)
        .eq("is_active", true)
        .in("id", partnerIds)
        .order("created_at", { ascending: false })
        .limit(type === 'vitrines' || type === 'tudo' ? limitCount : 0)

    filteredPartners = partnerDetailsRes.data || []

    if (partnerIds.length > 0) {
        const promises = []
        if (type === 'tudo' || type === 'produtos') {
            promises.push(
                supabase
                    .from("products")
                    .select(`
                        id, name, description, price, promotional_price, stock_available, stock_quantity, images, rating,
                        category_id, category:product_categories!category_id(name), created_at,
                        marketplace_category_id, marketplace_category:marketplace_product_categories!marketplace_category_id(name, parent:marketplace_product_categories!parent_id(name)),
                        subcategory_id, subcategory:product_categories!subcategory_id(name),
                        partners!inner(id, store_name, store_image_url, latitude, longitude, addresses!inner(city, state)),
                        product_variants(variant_options, price_adjustment, is_active),
                        show_price_in_store
                    `)
                    .eq("is_active", true)
                    .eq("show_in_marketplace", true)
                    .in("partner_id", partnerIds)
                    .order("created_at", { ascending: false })
                    .limit(type === 'produtos' || type === 'tudo' ? limitCount : 0)
            )
        }
        if (type === 'tudo' || type === 'servicos') {
            promises.push(
                supabase
                    .from("services")
                    .select(`
                        id, name, description, price, promotional_price, images, rating, category, category_id, duration_minutes, billing_unit, price_type, created_at,
                        service_categories:service_categories!category_id(name),
                        partners!inner(id, store_name, store_image_url, latitude, longitude, addresses!inner(city, state)),
                        show_price_in_store
                    `)
                    .eq("is_active", true)
                    .eq("show_in_marketplace", true)
                    .in("partner_id", partnerIds)
                    .order("created_at", { ascending: false })
                    .limit(type === 'servicos' || type === 'tudo' ? limitCount : 0)
            )
        }
        if (type === 'tudo' || type === 'planos') {
            promises.push(
                supabase
                    .from("recurring_plans")
                    .select(`
                        id, name, description, status, show_in_marketplace, partner_id, frequency_type, frequency_interval, created_at,
                        partners!inner(id, store_name, store_image_url, latitude, longitude, addresses!inner(city, state)),
                        recurring_plan_items(
                            id, item_type, product_id, variant_id, service_id, quantity, unit_price,
                            products:product_id(id, name, price, images),
                            services:service_id(id, name, price, duration_minutes)
                        )
                    `)
                    .eq("status", "active")
                    .eq("show_in_marketplace", true)
                    .in("partner_id", partnerIds)
                    .order("created_at", { ascending: false })
                    .limit(type === 'planos' || type === 'tudo' ? limitCount : 0)
            )
        }

        const resList = await Promise.all(promises)
        let idx = 0
        if (type === 'tudo' || type === 'produtos') {
            rawProducts = resList[idx++]?.data || []
        }
        if (type === 'tudo' || type === 'servicos') {
            rawServices = resList[idx++]?.data || []
        }
        if (type === 'tudo' || type === 'planos') {
            rawPlans = resList[idx++]?.data || []
        }
    }

    const normalizedPartners = filteredPartners.map((item: any) => ({
        id: item.id,
        name: item.store_name,
        description: item.store_description,
        images: [item.banner_url || item.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"],
        rating: item.rating,
        itemType: 'loja',
        category: item.category?.parent?.name || item.category?.name || 'Loja Parceira',
        partners: {
            id: item.id,
            store_name: item.store_name,
            store_avatar: item.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
            banner_url: item.banner_url || null,
            logo_moderation_status: item.logo_moderation_status || "approved",
            banner_moderation_status: item.banner_moderation_status || "approved",
            latitude: item.latitude,
            longitude: item.longitude,
            city: item.addresses?.[0]?.city || null,
            state: item.addresses?.[0]?.state || null,
            reviewsCount: item.reviews?.[0]?.count || 0
        },
        created_at: item.created_at
    }))

    const normalizedProducts = rawProducts.map((item: any) => {
        const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
        const partner = rawPartner ? {
            ...rawPartner,
            store_avatar: rawPartner.store_image_url || rawPartner.store_avatar || "https://img.dudit.com.br/static/Placeholder.png",
            latitude: rawPartner.latitude,
            longitude: rawPartner.longitude,
            city: rawPartner.addresses?.[0]?.city || null,
            state: rawPartner.addresses?.[0]?.state || null
        } : null
        const variantFallback = extractFirstVariantFallback(item.product_variants, Number(item.price))
        const { product_variants, ...rest } = item
        return {
            ...rest,
            category: item.marketplace_category?.parent?.name || item.marketplace_category?.name || item.category?.name || null,
            subcategoryName: item.marketplace_category?.parent ? item.marketplace_category.name : (item.subcategory?.name || null),
            itemType: 'produto',
            partners: partner,
            ...variantFallback
        }
    })

    const normalizedServices = rawServices.map((item: any) => {
        const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
        const partner = rawPartner ? {
            ...rawPartner,
            store_avatar: rawPartner.store_image_url || rawPartner.store_avatar || "https://img.dudit.com.br/static/Placeholder.png",
            latitude: rawPartner.latitude,
            longitude: rawPartner.longitude,
            city: rawPartner.addresses?.[0]?.city || null,
            state: rawPartner.addresses?.[0]?.state || null
        } : null
        const serviceCategoryName = item.service_categories?.name || item.category || null
        return { ...item, category: serviceCategoryName, itemType: 'servico', partners: partner, subcategoryName: serviceCategoryName }
    })

    const normalizedPlans = rawPlans.map((item: any) => normalizePlan(item))

    let results: any[] = []
    if (type === 'tudo') {
        results = [...normalizedPartners, ...normalizedProducts, ...normalizedServices, ...normalizedPlans]
    } else if (type === 'vitrines') {
        results = normalizedPartners
    } else if (type === 'produtos') {
        results = normalizedProducts
    } else if (type === 'servicos') {
        results = normalizedServices
    } else if (type === 'planos') {
        results = normalizedPlans
    }

    results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const finalIds = results.map(r => `${r.itemType}:${r.id}`)
    return { results, filteredIds: finalIds }
}

