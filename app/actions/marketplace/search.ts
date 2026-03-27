"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { redis } from "@/lib/redis"

// Funções Helpers
import { cache } from "react"
import { MarketplaceSearchType } from "@/lib/types/marketplace"

function extractFirstVariantFallback(variants: any[] | null | undefined, basePrice: number) {
    if (!variants || variants.length === 0) return { fallback_variant_image: null, fallback_variant_price: null }
    const withImage = variants.find((v: any) => v.is_active && v.variant_options?.image)
    const first = variants.find((v: any) => v.is_active) || variants[0]
    const image = withImage?.variant_options?.image || null
    const priceAdj = first?.price_adjustment
    const price = priceAdj && priceAdj > 0 ? priceAdj : null
    return { fallback_variant_image: image, fallback_variant_price: price }
}

/**
 * FUNÇÃO DIRETA para uso em Server Components (SSR).
 * Sem rate limiting, sem overhead de serialização de Server Action.
 * NÃO EXPOSTA como export de "use server" — só pode ser importada pelo servidor.
 */

export const searchMarketplaceDirect = cache(async (
    query: string,
    type: MarketplaceSearchType,
    limits: { vitrines?: number; produtos?: number; servicos?: number; geral?: number; cursor?: number; lastId?: string } = {}
) => {
    return _searchMarketplaceCore(query, type, limits)
})

/**
 * SERVER ACTION para uso do CLIENT (infinite scroll, busca manual).
 * Aplica rate limiting para proteção contra bots.
 */
export const searchMarketplace = async (
    query: string,
    type: 'produtos' | 'servicos' | 'vitrines' | 'tudo' = 'tudo',
    limits: { vitrines?: number; produtos?: number; servicos?: number; geral?: number; cursor?: number; lastId?: string } = {}
) => {
    // Rate limit APENAS para chamadas do client (POST / Server Actions)
    const { success } = await requireRateLimit(RateLimitCategory.API_GENERAL)
    if (!success) {
        console.warn("[Security] Rate limit exceeded on searchMarketplace")
        return []
    }
    return _searchMarketplaceCore(query, type, limits)
}



const GLOBAL_VERSION_KEY = "marketplace:global_cache_version"

const serializeSearchKey = (query: string, type: string, limits: any) => {
    return [query, type, limits.vitrines, limits.produtos, limits.servicos, limits.geral, limits.cursor, limits.lastId].map(String).join(":")
}

async function _searchMarketplaceCore(
    query: string,
    type: 'produtos' | 'servicos' | 'vitrines' | 'tudo' = 'tudo',
    limits: { vitrines?: number; produtos?: number; servicos?: number; geral?: number; cursor?: number; lastId?: string } = {}
): Promise<any[]> {
    // Inline version read — avoids separate getCacheVersion function call
    let version: number = 1
    try { version = (await redis.get<number>(GLOBAL_VERSION_KEY)) || 1 } catch {}
    
    const queryHash = serializeSearchKey(query, type, limits)
    const safeHash = Buffer.from(queryHash).toString('base64').replace(/=/g, '')
    const cacheKey = `mp:cache:v${version}:search:${safeHash}`
    
    try {
        const cached = await redis.get<any[]>(cacheKey)
        if (cached && Array.isArray(cached)) {
            console.log(`[REDIS] HIT ${cacheKey}`)
            return cached
        }
        console.log(`[REDIS] MISS ${cacheKey}`)
    } catch (err) {
        console.error("[REDIS] Error reading query cache", err)
    }

    const result = await _searchMarketplaceInternal(query, type, limits)
    
    if (result && result.length > 0) {
        try {
            await redis.set(cacheKey, JSON.stringify(result), { ex: 60 * 60 * 24 }) // 24h caching, wiped by version bump
            console.log(`[REDIS] SET ${cacheKey}`)
        } catch (err) {
            console.error("[REDIS] Error setting query cache", err)
        }
    }
    
    return result
}

/**
 * CORE interno — lógica pura de busca original. Sem rate limiting.
 */
async function _searchMarketplaceInternal(
    query: string,
    type: 'produtos' | 'servicos' | 'vitrines' | 'tudo' = 'tudo',
    limits: { vitrines?: number; produtos?: number; servicos?: number; geral?: number; cursor?: number; lastId?: string } = {}
): Promise<any[]> {
    const t0 = performance.now()
    const { vitrines: vitLimit = 4, produtos: prodLimit = 20, servicos: servLimit = 20, geral = 40, cursor, lastId } = limits

    // ANTI-SCRAPING / DEPTH RESTRICTION
    if (cursor && Date.now() - cursor > 1000 * 60 * 60 * 24 * 365 * 10) {
        console.warn(`[Security] Scraping attempt or invalid cursor depth: ${cursor}`)
        return []
    }

    // Se tem query de busca em texto puro, fazemos fallback pro Postgres FTS (busca aproximada)
    if (query) {
        return searchMarketplacePostgresFTS(query, type, limits)
    }

    try {
        const limitCount = type === 'tudo' ? geral : (type === 'vitrines' ? vitLimit : (type === 'produtos' ? prodLimit : servLimit))
        const indexKey = type === 'tudo' ? 'explore:index:all' : `explore:index:${type}`

        const tRedisZero = performance.now()

        // COMPOSITE CURSOR LOGIC (Evita duplicados quando dois itens têm exatamente o mesmo score/timestamp)
        // Usamos range EXCLUSIVA com `(` para não re-incluir itens do cursor anterior
        const startScore = cursor ? `(${cursor}` : "+inf"
        const ids = (await redis.zrange(indexKey, startScore as any, "-inf", { byScore: true, rev: true, offset: 0, count: limitCount + 5 })) as string[]

        if (!ids || ids.length === 0) return []

        let filteredIds = ids
        if (lastId) {
            // Mapping client types to Redis prefixes
            const prefixMap: Record<string, string> = {
                'tudo': 'produto',
                'produtos': 'produto',
                'servicos': 'servico',
                'vitrines': 'loja'
            }
            const prefix = prefixMap[type] || 'produto'
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
        if (!filteredIds.length) return []

        const dataKeys = filteredIds.map(id => `data:${id}`)

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

            const promises = []

            if (produtosIds.length > 0) {
                promises.push(
                    supabase.from("products").select(`
                        id, name, description, price, promotional_price, images, rating, category, created_at,
                        partners(id, store_name, store_image_url, addresses(city, state)),
                        product_variants(variant_options, price_adjustment, is_active)
                    `).in("id", produtosIds)
                )
            }
            if (servicosIds.length > 0) {
                promises.push(
                    supabase.from("services").select(`
                        id, name, description, price, images, rating, category, created_at,
                        partners(id, store_name, store_image_url, addresses(city, state))
                    `).in("id", servicosIds)
                )
            }
            if (lojasIds.length > 0) {
                promises.push(
                    supabase.from("partners").select(`
                        id, store_name, store_description, store_image_url, rating, created_at, addresses(city, state)
                    `).in("id", lojasIds)
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
                        images: [item.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"],
                        rating: item.rating, itemType: 'loja', category: 'Loja Parceira',
                        partners: {
                            id: item.id, store_name: item.store_name,
                            store_avatar: item.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
                            city: item.addresses?.[0]?.city || null, state: item.addresses?.[0]?.state || null
                        }, created_at: item.created_at
                    }
                }

                const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
                const partner = rawPartner ? {
                    ...rawPartner,
                    store_avatar: rawPartner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
                    city: rawPartner.addresses?.[0]?.city || null, state: rawPartner.addresses?.[0]?.state || null
                } : null

                if (item.product_variants !== undefined) {
                    const variantFallback = extractFirstVariantFallback(item.product_variants, Number(item.price))
                    const { product_variants, ...rest } = item
                    return { ...rest, itemType: 'produto', partners: partner, ...variantFallback }
                }

                return { ...item, itemType: 'servico', partners: partner }
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
        const tFinal = performance.now()

        const totalRequested = filteredIds.length
        const hits = totalRequested - missingIndices.length
        const hitRate = totalRequested > 0 ? ((hits / totalRequested) * 100).toFixed(1) : "0.0"
        const redisLatency = (tRedisKeys - tRedisZero).toFixed(1)
        const mgetLatency = (tFinal - tRedisKeys).toFixed(1)
        const source = missingIndices.length === 0 ? 'Redis' : (hits === 0 ? 'Postgres' : 'Mixed')

        console.log(`[Search Metrics] Source: ${source} | Hit Rate: ${hitRate}% (${hits}/${totalRequested}) | Total: ${(tFinal - t0).toFixed(1)}ms | ZRANGE: ${redisLatency}ms | MGET: ${mgetLatency}ms | DB Fallbacks: ${missingIndices.length} | Type: ${type}`)

        return cleanData

    } catch (error) {
        console.error("[Redis DOWN] Falling back to Postgres:", error)
        // DEGRADED MODE: Use Postgres with same limits to maintain full UX
        try {
            console.warn(`[DEGRADED MODE] Redis unavailable, using Postgres fallback`)
            return await searchMarketplacePostgresFTS("", type, { vitrines: vitLimit, produtos: prodLimit, servicos: servLimit })
        } catch (pgError) {
            console.error("[TOTAL FAILURE] Both Redis and Postgres failed. Returning empty:", pgError)
            return []
        }
    }
}

// Lógica de FTS (Full-Text Search) antiga preservada
async function searchMarketplacePostgresFTS(
    query: string,
    type: 'produtos' | 'servicos' | 'vitrines' | 'tudo' = 'tudo',
    limits: { vitrines?: number; produtos?: number; servicos?: number; cursor?: number; lastId?: string } = {}
) {
    const { vitrines: vitLimit = 4, produtos: prodLimit = 20, servicos: servLimit = 20 } = limits
    const supabase = getAdminClient()
    let results: any[] = []

    const qRaw = query ? query.trim() : ""
    const qClean = qRaw.replace(/-/g, ' ')
    const makeFuzzy = (s: string) => `%${s.split('').join('%')}%`
    const qFuzzy = makeFuzzy(qRaw.replace(/-/g, ''))

    const stateMatch = qRaw.match(/-([a-z]{2})$/i)
    const detectedState = stateMatch ? stateMatch[1].toUpperCase() : null

    const cursorDate = limits.cursor ? new Date(limits.cursor).toISOString() : null

    try {
        if (type === 'tudo' || type === 'vitrines') {
            let req = supabase.from("partners").select(`id, store_name, store_description, store_image_url, rating, addresses(city, state)`).eq("is_active", true)
            let reqJoined = req
            if (qRaw) {
                let orFilter = `store_name.ilike.%${qRaw}%,store_description.ilike.%${qRaw}%,store_name.ilike.%${qClean}%`
                if (detectedState) {
                    orFilter += `,addresses.state.eq.${detectedState}`
                } else {
                    orFilter += `,addresses.city.ilike.${qFuzzy},addresses.state.ilike.%${qRaw}%`
                }
                reqJoined = reqJoined.or(orFilter)
            } else if (detectedState) {
                reqJoined = reqJoined.filter("addresses.state", "eq", detectedState)
            }
            if (cursorDate) reqJoined = reqJoined.lt("created_at", cursorDate)
            const { data: partData } = await reqJoined.order("created_at", { ascending: false }).limit(vitLimit)
            if (partData) {
                results.push(...partData.map((item: any) => ({
                    id: item.id, name: item.store_name, description: item.store_description,
                    images: [item.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"],
                    rating: item.rating, itemType: 'loja', category: 'Loja Parceira',
                    partners: {
                        id: item.id, store_name: item.store_name,
                        store_avatar: item.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
                        city: item.addresses?.[0]?.city || null, state: item.addresses?.[0]?.state || null
                    }
                })))
            }
        }

        if (type === 'tudo' || type === 'produtos') {
            let req = supabase.from("products").select(`
                id, name, description, price, promotional_price, images, rating, category, created_at,
                partners(id, store_name, store_image_url, addresses(city, state)),
                product_variants(variant_options, price_adjustment, is_active)
            `).eq("is_active", true).eq("show_in_marketplace", true)
            let reqJoined = req
            if (qRaw) {
                let orFilter = `name.ilike.%${qRaw}%,description.ilike.%${qRaw}%,name.ilike.%${qClean}%,category.ilike.%${qRaw}%`
                reqJoined = reqJoined.or(orFilter)
            }
            if (cursorDate) reqJoined = reqJoined.lt("created_at", cursorDate)
            const { data: prodData } = await reqJoined.order("created_at", { ascending: false }).limit(prodLimit)
            if (prodData) {
                results.push(...prodData.map((item: any) => {
                    const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
                    const partner = rawPartner ? {
                        ...rawPartner,
                        store_avatar: rawPartner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
                        city: rawPartner.addresses?.[0]?.city || null, state: rawPartner.addresses?.[0]?.state || null
                    } : null
                    const variantFallback = extractFirstVariantFallback((item as any).product_variants, Number(item.price))
                    const { product_variants, ...rest } = item
                    return { ...rest, itemType: 'produto', partners: partner, ...variantFallback }
                }))
            }
        }

        if (type === 'tudo' || type === 'servicos') {
            let req = supabase.from("services").select(`
                id, name, description, price, images, rating, category, created_at,
                partners(id, store_name, store_image_url, addresses(city, state))
            `).eq("is_active", true)
            let reqJoined = req
            if (qRaw) {
                let orFilter = `name.ilike.%${qRaw}%,description.ilike.%${qRaw}%,name.ilike.%${qClean}%,category.ilike.%${qRaw}%`
                reqJoined = reqJoined.or(orFilter)
            }
            if (cursorDate) reqJoined = reqJoined.lt("created_at", cursorDate)
            const { data: servData } = await reqJoined.order("created_at", { ascending: false }).limit(servLimit)
            if (servData) {
                results.push(...servData.map((item: any) => {
                    const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
                    const partner = rawPartner ? {
                        ...rawPartner,
                        store_avatar: rawPartner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
                        city: rawPartner.addresses?.[0]?.city || null, state: rawPartner.addresses?.[0]?.state || null
                    } : null
                    return { ...item, itemType: 'servico', partners: partner }
                }))
            }
        }

        return results
    } catch (error) {
        console.error("Search FTS Postgres Error:", error)
        return []
    }
}
