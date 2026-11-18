"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { unstable_cache } from "next/cache"
import { cache } from "react"
import { MarketplaceSearchType } from "@/lib/types/marketplace"
import { getCurrentUser } from "@/lib/auth/server-user"
import { getUserSessionData } from "@/lib/data/user"
import { enrichMarketplaceDistance, calculateDistance } from "@/lib/services/location.service"
import { resolveCityAndStateFromSlug } from "./products"
import { normalizeSearchQuery } from "@/lib/search/normalize"
import { applySellerDiversity, calcCategoryBrowseScore } from "@/lib/marketplace/ranking"
import { recordMarketplaceSearchTelemetry } from "@/lib/services/analytics.service"

function extractFirstVariantFallback(variants: any[] | null | undefined, basePrice?: number) {
    if (!variants || variants.length === 0) return { fallback_variant_image: null, fallback_variant_price: null }
    const activeVariants = variants.filter((v: any) => v.is_active !== false)
    const withImage = activeVariants.find((v: any) => v.variant_options?.image) || variants.find((v: any) => v.variant_options?.image)
    const image = withImage?.variant_options?.image || null

    const prices = (activeVariants.length > 0 ? activeVariants : variants)
        .map((v: any) => Number(v.price_adjustment || 0))
        .filter((p: number) => p > 0)

    const lowestPrice = prices.length > 0 ? Math.min(...prices) : null

    return { fallback_variant_image: image, fallback_variant_price: lowestPrice }
}

// ─── Badges de vitrine (Últimos N / Destaque / promoções) ──────────────────
// Mesma lógica da homepage (discover.ts applyUrgencyBadges) para que o
// ItemCard renderize os badges no /explorar exatamente como no home.

async function decorateExploreItems(items: any[], options: { includePromotions?: boolean } = {}): Promise<any[]> {
    if (!Array.isArray(items) || items.length === 0) return items

    // Clona produtos: os arrays podem ser compartilhados com o searchMemoryCache
    // e não podem ser mutados com badges de um usuário específico.
    const decorated = items.map((item) => (item && item.itemType === "produto" ? { ...item } : item))

    let userId: string | null = null
    try {
        const user = await getCurrentUser()
        userId = user?.id ?? null
    } catch { }

    const seed = `dudit-${userId ?? "anon"}-${new Date().toDateString()}`
    for (const item of decorated) {
        if (!item || item.itemType !== "produto") continue
        if (item._sales === undefined) item._sales = Number(item.sales_last_30_days ?? 0) || 0
        if (item._stock === undefined) item._stock = Number(item.stock_quantity ?? item.stock_available ?? 0) || 0
        if (item._badgeLabel) continue

        let h = 0
        const s = `${seed}-${item.id}-launch-badge`
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i)
        const bucket = Math.abs(h) % 100
        const stock = item._stock

        if (stock > 0 && stock <= 5 && bucket < 45) {
            item._badgeLabel = `Últimos ${stock}`
            item._badgeVariant = "red"
        } else if (bucket >= 75 && bucket < 90) {
            item._badgeLabel = "Destaque"
            item._badgeVariant = "purple"
        }
    }

    if (options.includePromotions) {
        try {
            const partnerIds = new Set<string>()
            for (const item of decorated) {
                if (!item || item.itemType !== "produto") continue
                const raw = Array.isArray(item.partners) ? item.partners[0] : item.partners
                if (raw?.id) partnerIds.add(String(raw.id))
            }
            if (partnerIds.size > 0) {
                const { listActivePromotionsForPartnersAction } = await import("@/app/actions/shared/promotions")
                const promoMap = await listActivePromotionsForPartnersAction([...partnerIds])
                if (promoMap.size > 0) {
                    for (const item of decorated) {
                        if (!item || item.itemType !== "produto") continue
                        const raw = Array.isArray(item.partners) ? item.partners[0] : item.partners
                        const promos = raw?.id ? promoMap.get(String(raw.id)) : undefined
                        if (promos && promos.length > 0) item._promotions = promos
                    }
                }
            }
        } catch { /* promoções de campanha são best-effort */ }
    }

    return decorated
}

function applyShowcasePenalty(items: any[]): any[] {
    const active: any[] = []
    const inactive: any[] = []
    for (const item of items) {
        const rawStore = Array.isArray(item.stores) ? item.stores[0] : item.stores
        if (rawStore?.is_showcase_active === false) {
            inactive.push(item)
        } else {
            active.push(item)
        }
    }
    return [...active, ...inactive]
}

function normalizePlan(item: any) {
    const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
    const rawStore = Array.isArray(item.stores) ? item.stores[0] : item.stores
    const storeAddr = rawStore?.addresses?.[0] || rawPartner?.addresses?.[0]
    const storeImage = rawStore?.logo_url
    const partner = rawPartner ? {
        ...rawPartner,
        store_name: rawStore?.name,
        slug: rawStore?.slug,
        store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
        store_image_url: storeImage,
        city: storeAddr?.city || null,
        state: storeAddr?.state || null,
        neighborhood: storeAddr?.neighborhood || null
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

            if (!firstImage) {
                if (planItem.item_type === 'product' && planItem.products?.images) {
                    const imgs = planItem.products.images
                    if (Array.isArray(imgs) && imgs.length > 0) {
                        firstImage = imgs[0]
                    }
                } else if (planItem.item_type === 'service' && planItem.services?.images) {
                    const imgs = planItem.services.images
                    if (Array.isArray(imgs) && imgs.length > 0) {
                        firstImage = imgs[0]
                    }
                }
            }
        }
    }

    // Prioriza a imagem principal cadastrada no próprio plano recorrente; fallback para o primeiro item (produto/serviço) ou logo da loja
    const ownImages = (Array.isArray(item.images) ? item.images : [])
        .filter((img: any): img is string => typeof img === "string" && img.trim().length > 0)
    const fallbackImage = firstImage || rawStore?.logo_url || "https://img.dudit.com.br/static/Placeholder.png"
    const finalImages = ownImages.length > 0 ? ownImages : [fallbackImage]

    const planRep = Number(rawStore?.marketplace_reputation || 0)
    return {
        id: item.id,
        short_id: item.short_id || null,
        name: item.name,
        description: item.description,
        price: computedPrice,
        images: finalImages,
        moderation_status: item.moderation_status || null,
        moderation_reason: item.moderation_reason || null,
        itemType: 'plano',
        partners: partner,
        frequency_type: item.frequency_type,
        frequency_interval: item.frequency_interval,
        created_at: item.created_at,
        subcategoryName: null,
        marketplace_score: Number(item.marketplace_score || 0),
        views_count: Number(item.views_count || 0),
        favorites_count: Number(item.favorites_count || 0),
        marketplace_reputation: planRep,
        seller_reputation: planRep,
    }
}

const cityCoordsCache = new Map<string, { lat: number; lng: number } | null>()
const cityCoordsInflight = new Map<string, Promise<{ lat: number; lng: number } | null>>()

const normalizePlaceValue = (value: string | null | undefined) =>
    (value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()

function itemDistanceKm(item: any): number {
    const distance = item?.partners?.distance_km ?? item?.distance_km
    return typeof distance === "number" && Number.isFinite(distance) ? distance : Infinity
}

/**
 * Ordena os resultados distantes pelo ranqueamento do marketplace (_searchRank da FTS,
 * ou marketplace_score como fallback) com um leve empate por proximidade.
 * A distancia pode reordenar itens cujo rank difere em no maximo 10% da faixa da lista;
 * nunca sobrepoe a relevancia do ranqueamento.
 */
function sortDistantByRankAndDistance<T>(items: T[]): T[] {
    const list = items as any[]
    const bases = list.map((item) => {
        if (typeof item?._searchRank === "number" && Number.isFinite(item._searchRank)) return item._searchRank
        if (typeof item?.marketplace_score === "number" && Number.isFinite(item.marketplace_score)) return item.marketplace_score
        return null
    })
    const finite = bases.filter((value): value is number => value !== null)
    const min = finite.length > 0 ? Math.min(...finite) : 0
    const span = finite.length > 0 ? Math.max(...finite) - min : 0

    const scored = list.map((item, index) => {
        const base = bases[index]
        const baseNorm = base === null ? 0 : (span > 0 ? (base - min) / span : 1)
        const distance = itemDistanceKm(item)
        const distanceNorm = Number.isFinite(distance) ? Math.min(distance / 1000, 1) : 1
        return { item, score: baseNorm - 0.1 * distanceNorm }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.map((entry) => entry.item)
}

/**
 * A busca por cidade filtra por partner_id (RPC FTS), mas um parceiro pode ter lojas em
 * varios municipios. Itens publicados na loja de outra cidade voltariam como "locais".
 * Este filtro mantem apenas itens realmente dentro do escopo (cidade ou raio) buscado.
 */
function isItemWithinSearchScope(
    item: any,
    scope: {
        city: string | null
        state: string | null
        center: { lat: number; lng: number } | null
        radius: number | null
    }
): boolean {
    const partner = item?.partners || {}
    const lat = partner.latitude ?? item?.latitude
    const lng = partner.longitude ?? item?.longitude
    const hasCoords = lat !== null && lat !== undefined && lng !== null && lng !== undefined &&
        Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))

    if (scope.radius && scope.center && hasCoords) {
        return calculateDistance(scope.center, { lat: Number(lat), lng: Number(lng) }) <= scope.radius
    }

    if (scope.city) {
        const itemCity = normalizePlaceValue(partner.city ?? item?.city)
        if (!itemCity) return true
        if (itemCity !== normalizePlaceValue(scope.city)) return false
        const itemState = normalizePlaceValue(partner.state ?? item?.state)
        if (itemState && scope.state && itemState !== normalizePlaceValue(scope.state)) return false
    }

    return true
}

export async function resolveCityCoordsFromSlug(cidadeSlug: string): Promise<{ lat: number; lng: number } | null> {
    if (!cidadeSlug || cidadeSlug === "brasil" || cidadeSlug.startsWith("estado-")) return null
    if (cityCoordsCache.has(cidadeSlug)) {
        return cityCoordsCache.get(cidadeSlug) || null
    }
    const inflight = cityCoordsInflight.get(cidadeSlug)
    if (inflight) return inflight

    const parts = cidadeSlug.split("-")
    const state = parts.pop()?.toUpperCase() || ""
    const targetCitySlug = parts.join("-")

    if (!state || state.length !== 2 || !targetCitySlug) {
        cityCoordsCache.set(cidadeSlug, null)
        return null
    }

    const promise = (async () => {
        try {
            const resolved = await resolveCityAndStateFromSlug(cidadeSlug)
            const dbCity = resolved?.city
            const dbState = resolved?.state || state

            if (!dbCity) {
                cityCoordsCache.set(cidadeSlug, null)
                return null
            }

            const supabase = getAdminClient()
            const { data, error } = await supabase
                .from("addresses")
                .select("latitude, longitude")
                .ilike("city", dbCity)
                .ilike("state", dbState)
                .not("latitude", "is", null)
                .limit(1)

            if (error || !data || data.length === 0) {
                cityCoordsCache.set(cidadeSlug, null)
                return null
            }
            const result = { lat: Number(data[0].latitude), lng: Number(data[0].longitude) }
            cityCoordsCache.set(cidadeSlug, result)
            return result
        } finally {
            cityCoordsInflight.delete(cidadeSlug)
        }
    })()

    cityCoordsInflight.set(cidadeSlug, promise)
    return promise
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
    const { results } = await searchMarketplaceDirectFull(query, type, limits)
    return results
})

export const searchMarketplaceDirectFull = cache(async (
    query: string,
    type: MarketplaceSearchType,
    limits: {
        vitrines?: number;
        produtos?: number;
        servicos?: number;
        planos?: number;
        geral?: number;
        cursor?: number;
        lastId?: string;
        cursorRank?: number;
        cidade?: string;
        radius?: number;
        latitude?: number;
        longitude?: number;
        centerCoords?: { lat: number; lng: number } | null;
        section?: string;
    } = {}
) => {
    const isCity = limits.cidade && limits.cidade !== "brasil" && !limits.cidade.startsWith("estado-")
    const shouldFetchDistant = isCity && !limits.cursor && !limits.lastId && query && query.trim() !== ""

    // Coordenadas conhecidas sem rede (repassadoras pelo cliente ou coordenadas de cidade já resolvidas)
    const immediateCoords = limits.centerCoords || (limits.latitude && limits.longitude
        ? { lat: limits.latitude, lng: limits.longitude }
        : null)

    // Sessão/coords só são obrigatórias antes da busca quando há filtro de raio
    // (o cálculo de distância usa o resultado ao final, não o início).
    const sessionCoordsPromise = (async () => {
        if (immediateCoords) return immediateCoords
        const user = await getCurrentUser()
        const sessionData = user ? await getUserSessionData(user.id) : null
        if (sessionData?.profile?.latitude && sessionData?.profile?.longitude) {
            return { lat: sessionData.profile.latitude, lng: sessionData.profile.longitude }
        }
        if (limits.cidade) return await resolveCityCoordsFromSlug(limits.cidade)
        return null
    })()

    const localPromise = limits.radius
        ? sessionCoordsPromise.then((finalCoords) => _searchMarketplaceCore(query, type, {
            ...limits,
            centerCoords: finalCoords
        }))
        : _searchMarketplaceCore(query, type, {
            ...limits,
            centerCoords: immediateCoords
        })

    const distantPromise = shouldFetchDistant
        ? _searchMarketplaceCore(query, type, {
            vitrines: type === 'vitrines' || type === 'tudo' ? 20 : 0,
            produtos: type === 'produtos' || type === 'tudo' ? 20 : 0,
            servicos: type === 'servicos' || type === 'tudo' ? 20 : 0,
            planos: type === 'planos' || type === 'tudo' ? 20 : 0,
            geral: 40,
        })
        : Promise.resolve({ results: [] })

    // Escopo local roda junto com a busca: só é consumido no filtro pós-busca.
    const localScopePromise = isCity && limits.cidade
        ? resolveCityAndStateFromSlug(limits.cidade)
        : Promise.resolve(null)

    const [finalCoords, localRes, distantRes, localScopeCity] = await Promise.all([
        sessionCoordsPromise,
        localPromise,
        distantPromise,
        localScopePromise,
    ])

    const localResults = (localRes.results || []).filter((item: any) =>
        isItemWithinSearchScope(item, {
            city: localScopeCity?.city ?? null,
            state: localScopeCity?.state ?? null,
            center: finalCoords,
            radius: limits.radius ?? null,
        })
    )

    const resultsWithDistance = enrichMarketplaceDistance(localResults, finalCoords)

    let moreDistantSellers: any[] = []
    let moreDistantItems: any[] = []

    if (shouldFetchDistant && distantRes.results && distantRes.results.length > 0) {
        const localIds = new Set(localResults.map((r: any) => `${r.itemType}:${r.id}`))
        const distantFiltered = distantRes.results.filter((r: any) => !localIds.has(`${r.itemType}:${r.id}`))

        const enrichedDistant = enrichMarketplaceDistance(distantFiltered, finalCoords)

        moreDistantSellers = sortDistantByRankAndDistance(
            enrichedDistant.filter((r: any) => r.itemType === 'loja')
        ).slice(0, 20)
        moreDistantItems = sortDistantByRankAndDistance(
            enrichedDistant.filter((r: any) => r.itemType !== 'loja')
        ).slice(0, 20)
    }

    let finalResults = resultsWithDistance

    if (limits.section) {
        const filterSection = (list: any[]) => {
            let filtered = list
            if (limits.section === "promos") {
                filtered = list.filter(p => p.itemType === 'produto' && p.promotional_price !== null && p.promotional_price !== undefined)
            } else if (limits.section === "best-rated") {
                filtered = list.filter(p => p.itemType === 'produto' && (p.rating ?? 0) >= 4.8)
            } else if (limits.section === "best-sellers") {
                filtered = list.filter(p => p.itemType === 'produto')
            }
            return [...filtered].sort((a, b) => calcCategoryBrowseScore(b) - calcCategoryBrowseScore(a))
        }

        finalResults = filterSection(finalResults)
        if (moreDistantItems.length > 0) {
            moreDistantItems = filterSection(moreDistantItems)
        }
    }

    // Registra telemetria de busca apenas na 1ª página (sem cursor/lastId) para termos reais
    if (query && query.trim().length >= 2 && !limits.cursor && !limits.lastId) {
        const hasResults = Boolean(finalResults && finalResults.length > 0)
        recordMarketplaceSearchTelemetry({
            query: query.trim(),
            hasResults,
            resultsCount: finalResults.length,
            citySlug: limits.cidade || null,
            itemType: type,
        }).catch(() => { })
    }

    const [decoratedResults, decoratedDistantItems] = await Promise.all([
        decorateExploreItems(finalResults, { includePromotions: !limits.cursor && !limits.lastId }),
        decorateExploreItems(moreDistantItems),
    ])

    return {
        results: decoratedResults,
        moreDistantSellers,
        moreDistantItems: decoratedDistantItems
    }
})

export type MarketplaceListCursor = { createdAt?: string; id: string; rank?: number }

/**
 * SERVER ACTION para uso do CLIENT (infinite scroll, busca manual).
 * Aplica rate limiting para proteção contra bots.
 */
export const searchMarketplace = async (
    query: string,
    type: 'produtos' | 'servicos' | 'vitrines' | 'tudo' | 'planos' = 'tudo',
    limits: {
        vitrines?: number;
        produtos?: number;
        servicos?: number;
        planos?: number;
        geral?: number;
        cursor?: MarketplaceListCursor | null;
        cidade?: string;
        radius?: number;
        latitude?: number;
        longitude?: number;
        section?: string;
    } = {}
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

    const { results, moreDistantSellers, moreDistantItems } = await searchMarketplaceDirectFull(query, type, {
        vitrines: limits.vitrines,
        produtos: limits.produtos,
        servicos: limits.servicos,
        planos: limits.planos,
        geral: limits.geral,
        cursor: Number.isFinite(cursorMs as any) ? cursorMs : undefined,
        lastId,
        cursorRank,
        cidade: limits.cidade,
        radius: limits.radius,
        latitude: limits.latitude,
        longitude: limits.longitude,
        section: limits.section,
    })


    const items = results || []
    const last = items[items.length - 1]
    const nextCursor: MarketplaceListCursor | null = last?.id
        ? {
            id: String(last.id),
            ...(last.created_at ? { createdAt: String(last.created_at) } : {}),
            ...(typeof last._searchRank === "number" ? { rank: last._searchRank } : {}),
        }
        : null

    const limitCount =
        type === "tudo"
            ? (limits.geral ?? 40)
            : type === "vitrines"
                ? (limits.vitrines ?? 40)
                : type === "produtos"
                    ? (limits.produtos ?? 20)
                    : type === "planos"
                        ? (limits.planos ?? 20)
                        : (limits.servicos ?? 20)

    const hasMore = items.length >= limitCount && !!nextCursor
    return { items, nextCursor, hasMore, moreDistantSellers, moreDistantItems }
}

let localGlobalVersion = 1

function getCachedGlobalVersion(): number {
    return localGlobalVersion
}

const searchMemoryCache = new Map<string, { results: any[]; filteredIds: string[]; expiresAt: number }>()

export async function invalidateInMemoryVersionCache(): Promise<void> {
    localGlobalVersion++
    searchMemoryCache.clear()
}

const SEARCH_MEMORY_TTL_MS = 60_000 // 60s in-memory SWR cache

const serializeSearchKey = (query: string, type: string, limits: any) => {
    return [
        query || '',
        type || 'tudo',
        limits.vitrines || '',
        limits.produtos || '',
        limits.servicos || '',
        limits.geral || '',
        limits.cursor || '',
        limits.lastId || '',
        limits.cidade || 'all',
        limits.section || 'all',
        limits.radius || '',
        limits.latitude || '',
        limits.longitude || '',
    ].map(String).join(":")
}

async function _searchMarketplaceCore(
    query: string,
    type: 'produtos' | 'servicos' | 'vitrines' | 'tudo' | 'planos' = 'tudo',
    limits: {
        vitrines?: number;
        produtos?: number;
        servicos?: number;
        planos?: number;
        geral?: number;
        cursor?: number;
        lastId?: string;
        cursorRank?: number;
        cidade?: string;
        radius?: number;
        latitude?: number;
        longitude?: number;
        centerCoords?: { lat: number; lng: number } | null;
        section?: string;
    } = {}
): Promise<{ results: any[], filteredIds: string[] }> {
    const isPagination = limits.cursor !== undefined || limits.lastId !== undefined

    // Inline version read with 30s in-memory cache to save Redis commands
    const version = await getCachedGlobalVersion()

    const queryHash = serializeSearchKey(query, type, limits)
    const safeHash = Buffer.from(queryHash).toString('base64').replace(/=/g, '')
    const cacheKey = `mp:cache:v${version}:ids:${safeHash}`

    // 0. IN-MEMORY CACHE (0ms latency, ZERO Redis network roundtrips)
    if (!isPagination) {
        const memHit = searchMemoryCache.get(cacheKey)
        if (memHit && memHit.expiresAt > Date.now()) {
            return { results: memHit.results, filteredIds: memHit.filteredIds }
        }
    }

    // 1. FAST POSTGRES FTS SEARCH (uses gin index & pg_trgm in ~5-10ms)
    let { results, filteredIds } = await _searchMarketplaceInternal(query, type, limits)

    // 2. Apply showcase penalty for items from inactive vitrines
    results = applyShowcasePenalty(results)
    filteredIds = results.map(r => `${r.itemType}:${r.id}`)

    // 3. SAVE TO LOCAL RAM CACHE (60s SWR, zero remote Redis writes)
    if (!isPagination && filteredIds && filteredIds.length > 0) {
        searchMemoryCache.set(cacheKey, { results, filteredIds, expiresAt: Date.now() + SEARCH_MEMORY_TTL_MS })
    }

    return { results, filteredIds }
}


/**
 * CORE interno - lógica pura de busca original. Sem rate limiting.
 */
async function _searchMarketplaceInternal(
    query: string,
    type: 'produtos' | 'servicos' | 'vitrines' | 'tudo' | 'planos' = 'tudo',
    limits: {
        vitrines?: number;
        produtos?: number;
        servicos?: number;
        planos?: number;
        geral?: number;
        cursor?: number;
        lastId?: string;
        cursorRank?: number;
        cidade?: string;
        radius?: number;
        latitude?: number;
        longitude?: number;
        centerCoords?: { lat: number; lng: number } | null;
        section?: string;
    } = {}
): Promise<{ results: any[], filteredIds: string[] }> {
    const { vitrines: vitLimit = 4, produtos: prodLimit = 20, servicos: servLimit = 20, planos: planosLimit = 20, geral = 40, cursor, lastId, cursorRank } = limits

    // ANTI-SCRAPING / DEPTH RESTRICTION
    if (cursor && Date.now() - cursor > 1000 * 60 * 60 * 24 * 365 * 10) {
        console.warn(`[Security] Scraping attempt or invalid cursor depth: ${cursor}`)
        return { results: [], filteredIds: [] }
    }

    // Se tem filtro de cidade e não é "brasil"
    if (limits.cidade && limits.cidade !== "brasil") {
        return searchMarketplaceByCity(query, type, limits.cidade, limits)
    }

    // Se tem query de busca em texto puro, fazemos fallback pro Postgres FTS (busca aproximada)
    if (query) {
        return searchMarketplacePostgresFTS(query, type, limits)
    }

    // Navegação geral sem texto: usa Postgres direto ordenado por score (com cache SWR em RAM de 60s em _searchMarketplaceCore)
    // Elimina milhares de leituras diárias de zrange e mget no Upstash Redis
    return await browseMarketplaceByScore(type, limits)
}



// Lógica de FTS (Full-Text Search) - PostgreSQL ts_rank_cd via RPC
type MarketplaceSearchHit = { item_type: string; id: string; rank: number; created_at: string }

async function hydrateMarketplaceSearchHits(
    hits: MarketplaceSearchHit[],
    supabase: ReturnType<typeof getAdminClient>
): Promise<any[]> {
    if (!hits.length) return []

    // Hidratação direta via Postgres com chaves primárias (3-5ms, ZERO comandos no Redis)
    const hitRankMap = new Map(hits.map(h => [`${h.item_type}:${h.id}`, h.rank]))
    const produtosIds = hits.filter(h => h.item_type === "produto").map(h => h.id)
    const servicosIds = hits.filter(h => h.item_type === "servico").map(h => h.id)
    const lojasIds = hits.filter(h => h.item_type === "loja").map(h => h.id)
    const planosIds = hits.filter(h => h.item_type === "plano").map(h => h.id)

    const promises = []

    let _hydrateProdIdx = -1, _hydrateServIdx = -1

    if (produtosIds.length > 0) {
        _hydrateProdIdx = promises.length
        promises.push(
            supabase.from("products").select(`
                id, short_id, status, moderation_status, moderation_reason, name, description, price, promotional_price, stock_available, stock_quantity, images, rating,
                sales_last_30_days, views_last_30_days, favorites_count, marketplace_score,
                category_id, category:product_categories!category_id(name), created_at,
                marketplace_category_id, marketplace_category:marketplace_product_categories!marketplace_category_id(name, parent:marketplace_product_categories!parent_id(name)),
                subcategory_id, subcategory:product_categories!subcategory_id(name),
                partners(id, is_showcase_active),
                stores!left(id, short_id, name, slug, logo_url, banner_url, marketplace_reputation, addresses!store_id!left(city, state, neighborhood, latitude, longitude), delivery_settings!store_id!left(base_fee, included_km, extra_km_price, max_delivery_km, is_delivery_enabled, delivery_payer)),
                product_variants(variant_options, price_adjustment, is_active),
                show_price_in_store
            `)
                .in("id", produtosIds)
                .eq("status", "ativo")
                .eq("show_in_marketplace", true)
        )
    }
    if (servicosIds.length > 0) {
        _hydrateServIdx = promises.length
        promises.push(
            supabase.from("services").select(`
                id, short_id, status, moderation_status, moderation_reason, name, description, price, promotional_price, images, rating, category_id, duration_minutes, billing_unit, price_type, created_at,
                marketplace_score, views_count, bookings_last_30_days, favorites_count,
                marketplace_category_id, marketplace_category:marketplace_service_categories!marketplace_category_id(name, parent:marketplace_service_categories!parent_id(name)),
                partners(id),
                stores!left(id, short_id, name, slug, logo_url, banner_url, marketplace_reputation, addresses!store_id!left(city, state, neighborhood, latitude, longitude), delivery_settings!store_id!left(base_fee, included_km, extra_km_price, max_delivery_km, is_delivery_enabled, delivery_payer)),
                show_price_in_store
            `)
                .in("id", servicosIds)
                .in("status", ["ativo", "active"])
                .is("deleted_at", null)
                .eq("show_in_marketplace", true)
        )
    }
    if (lojasIds.length > 0) {
        promises.push(
            supabase.from("stores").select(`
                id, short_id, name, slug, description, logo_url, banner_url, rating, created_at, is_showcase_active, partner_id, marketplace_reputation, addresses!store_id!left(city, state, neighborhood, latitude, longitude), delivery_settings!store_id!left(base_fee, included_km, extra_km_price, max_delivery_km, is_delivery_enabled, delivery_payer),
                partners!inner(id, created_at, category_id, category:marketplace_partner_categories!category_id(name, slug, parent:marketplace_partner_categories!parent_id(name)), reviews(count))
            `).in("id", lojasIds)
        )
    }
    if (planosIds.length > 0) {
        promises.push(
            supabase.from("recurring_plans").select(`
                id, short_id, name, description, status, moderation_status, moderation_reason, images, show_in_marketplace, partner_id, frequency_type, frequency_interval, created_at,
                marketplace_score, views_count, favorites_count,
                partners(id, is_showcase_active),
                stores!left(id, short_id, name, logo_url, banner_url, marketplace_reputation, addresses!store_id!left(city, state, neighborhood, latitude, longitude)),
                recurring_plan_items(
                    id, item_type, product_id, variant_id, service_id, quantity, unit_price,
                    products:product_id(id, name, price, images),
                    services:service_id(id, name, price, duration_minutes, images)
                )
            `)
                .in("id", planosIds)
                .eq("status", "active")
                .eq("show_in_marketplace", true)
                .or("moderation_status.eq.approved,moderation_status.is.null")
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

    for (let idx = 0; idx < hits.length; idx++) {
        const hit = hits[idx]
        const item = recordMap.get(hit.id)
        if (!item) continue

        if (hit.item_type === "loja") {
            const storeId = item.id
            const storeName = item.name || "Vendedor"
            const storeImage = item.logo_url
            const rawDelivery = Array.isArray(item.delivery_settings) ? item.delivery_settings[0] : item.delivery_settings
            const storeAddr = Array.isArray(item.addresses) ? item.addresses[0] : item.addresses
            results.push({
                id: storeId,
                short_id: item.short_id,
                name: storeName,
                slug: item.slug,
                description: item.description,
                logo_url: storeImage,
                banner_url: item.banner_url,
                images: [item.banner_url || storeImage || "https://img.dudit.com.br/static/Placeholder.png"],
                rating: item.rating,
                itemType: "loja",
                category: item.partners?.category?.parent?.name || item.partners?.category?.name || "Loja Parceira",
                is_showcase_active: item.is_showcase_active !== false,
                delivery_settings: rawDelivery || null,
                partners: {
                    id: storeId,
                    short_id: item.short_id,
                    store_id: storeId,
                    store_name: storeName,
                    slug: item.slug,
                    store_image_url: storeImage,
                    store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
                    banner_url: item.banner_url || null,
                    latitude: storeAddr?.latitude || null,
                    longitude: storeAddr?.longitude || null,
                    city: storeAddr?.city || null,
                    state: storeAddr?.state || null,
                    neighborhood: storeAddr?.neighborhood || null,
                    reviewsCount: item.reviews?.[0]?.count || 0,
                    delivery_settings: rawDelivery || null,
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
        const rawStore = Array.isArray(item.stores) ? item.stores[0] : item.stores
        const storeId = rawStore?.id || rawPartner?.id
        const storeName = rawStore?.name || "Vendedor"
        const storeImage = rawStore?.logo_url
        const storeAddr = Array.isArray(rawStore?.addresses) ? rawStore.addresses[0] : rawStore?.addresses
        const rawDelivery = Array.isArray(rawStore?.delivery_settings) ? rawStore.delivery_settings[0] : rawStore?.delivery_settings
        const storeCity = storeAddr?.city || null
        const storeState = storeAddr?.state || null
        const storeNeighborhood = storeAddr?.neighborhood || null
        const storeLat = storeAddr?.latitude || null
        const storeLng = storeAddr?.longitude || null
        const sellerRep = Number(rawStore?.marketplace_reputation ?? rawPartner?.marketplace_reputation ?? 0)
        const partner = rawPartner || rawStore ? {
            ...rawPartner,
            id: rawPartner?.id || rawStore?.partner_id,
            store_id: storeId,
            short_id: rawStore?.short_id || rawPartner?.short_id,
            store_name: storeName,
            slug: rawStore?.slug,
            store_image_url: storeImage,
            store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
            latitude: storeLat,
            longitude: storeLng,
            city: storeCity,
            state: storeState,
            neighborhood: storeNeighborhood,
            delivery_settings: rawDelivery || null,
            marketplace_reputation: sellerRep,
            seller_reputation: sellerRep,
        } : null


        if (hit.item_type === "produto") {
            const variantFallback = extractFirstVariantFallback(item.product_variants, Number(item.price))
            const { product_variants, ...rest } = item
            results.push({
                ...rest,
                marketplace_score: Number(item.marketplace_score || 0),
                sales_last_30_days: Number(item.sales_last_30_days || 0),
                views_last_30_days: Number(item.views_last_30_days || 0),
                favorites_count: Number(item.favorites_count || 0),
                seller_reputation: sellerRep,
                marketplace_reputation: sellerRep,
                category: item.marketplace_category?.parent?.name || item.marketplace_category?.name || item.category?.name || null,
                subcategoryName: item.marketplace_category?.parent ? item.marketplace_category.name : (item.subcategory?.name || null),
                itemType: "produto",
                partners: partner,
                delivery_settings: rawDelivery || null,
                ...variantFallback,
                _searchRank: hit.rank,
            })
            continue
        }

        const categoryName = (item.marketplace_category?.parent?.name || item.marketplace_category?.name || null) as string | null
        const sanitizedCategoryName = categoryName && typeof categoryName === 'string' ? categoryName : null
        results.push({
            ...item,
            marketplace_score: Number(item.marketplace_score || 0),
            views_count: Number(item.views_count || 0),
            bookings_last_30_days: Number(item.bookings_last_30_days || 0),
            favorites_count: Number(item.favorites_count || 0),
            seller_reputation: sellerRep,
            marketplace_reputation: sellerRep,
            category: sanitizedCategoryName,
            itemType: "servico",
            partners: partner,
            delivery_settings: rawDelivery || null,
            duration_minutes: item.duration_minutes ?? null,
            price_type: item.price_type ?? null,
            billing_unit: item.billing_unit ?? null,
            subcategoryName: item.marketplace_category?.parent ? item.marketplace_category.name : null,
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

    if (!normalizeSearchQuery(query)) {
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
        const { data: hits, error } = await supabase.rpc("search_marketplace_fts", {
            p_query: query,
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
        const diversified = applySellerDiversity(results)
        const finalIds = diversified.map(r => `${r.itemType}:${r.id}`)
        return { results: diversified, filteredIds: finalIds }
    } catch (error) {
        console.error("Search FTS Postgres Error:", error)
        return { results: [], filteredIds: [] }
    }
}

async function searchMarketplaceByCity(
    query: string,
    type: 'produtos' | 'servicos' | 'vitrines' | 'tudo' | 'planos',
    cidadeSlug: string,
    limits: {
        vitrines?: number;
        produtos?: number;
        servicos?: number;
        planos?: number;
        geral?: number;
        cursor?: number;
        lastId?: string;
        cursorRank?: number;
        radius?: number;
        latitude?: number;
        longitude?: number;
        centerCoords?: { lat: number; lng: number } | null;
    }
) {
    const supabase = getAdminClient()
    const parts = cidadeSlug.split("-")
    const state = parts.pop()?.toUpperCase() || ""
    const targetCitySlug = parts.join("-")

    const resolved = await resolveCityAndStateFromSlug(cidadeSlug)
    const dbCity = resolved?.city
    // Use case-insensitive state matching since DB may store lowercase (sp) vs uppercase (SP)
    const dbState = (resolved?.state || state).toLowerCase()

    if (query.trim()) {
        let partnersQuery = supabase
            .from("stores")
            .select("id, partner_id, addresses!store_id!inner(city, state, neighborhood, latitude, longitude)")
            .eq("is_active", true)
            .ilike("addresses.state", dbState)

        if (cidadeSlug.startsWith("estado-")) {
            // Rota de estado: não filtra por cidade
        } else if (dbCity) {
            partnersQuery = partnersQuery.eq("addresses.city", dbCity)
        } else {
            partnersQuery = partnersQuery.ilike("addresses.city", targetCitySlug.replace(/-/g, ' '))
        }

        const partnersRes = await partnersQuery
        if (partnersRes.error) {
            console.error("[searchMarketplaceByCity] Partner fetch error:", partnersRes.error)
        }
        const allPartners = partnersRes.data || []
        let partnerIds: string[] = [...new Set(allPartners.flatMap((p: any) => [p.partner_id, p.id]).filter(Boolean))] as string[]

        // Filtro por Raio
        let centerCoords = limits.centerCoords || null
        if (!centerCoords && limits.latitude && limits.longitude) {
            centerCoords = { lat: limits.latitude, lng: limits.longitude }
        }
        // Só resolve coordenadas da cidade quando o filtro de raio realmente vai usá-las.
        if (!centerCoords && limits.radius && !cidadeSlug.startsWith("estado-")) {
            centerCoords = await resolveCityCoordsFromSlug(cidadeSlug)
        }

        if (centerCoords && limits.radius && partnerIds.length > 0) {
            const partnersInRadius = allPartners.filter((p: any) => {
                const addr = Array.isArray(p.addresses) ? p.addresses[0] : p.addresses
                if (addr?.latitude !== null && addr?.longitude !== null) {
                    const dist = calculateDistance(centerCoords!, { lat: addr.latitude, lng: addr.longitude })
                    return dist <= limits.radius!
                }
                return true
            })
            partnerIds = [...new Set(partnersInRadius.flatMap((p: any) => [p.partner_id, p.id]).filter(Boolean))] as string[]
        }

        if (!partnerIds.length) {
            return { results: [], filteredIds: [] }
        }

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

    let partnerDetailsQuery = supabase
        .from("stores")
        .select(`
            id, short_id, partner_id, name, slug, description, logo_url, banner_url,
            rating, created_at, is_showcase_active, marketplace_reputation,
            addresses!store_id!inner(city, state, neighborhood, latitude, longitude),
            partners!inner(
                id, is_active, category_id,
                category:marketplace_partner_categories!category_id(name, slug, parent:marketplace_partner_categories!parent_id(name))
            )
        `)
        .eq("is_active", true)
        .ilike("addresses.state", dbState)

    if (cidadeSlug.startsWith("estado-")) {
        // Rota de estado
    } else if (dbCity) {
        partnerDetailsQuery = partnerDetailsQuery.eq("addresses.city", dbCity)
    } else {
        partnerDetailsQuery = partnerDetailsQuery.ilike("addresses.city", targetCitySlug.replace(/-/g, ' '))
    }

    if (limits.cursor) {
        partnerDetailsQuery = partnerDetailsQuery.lt("created_at", new Date(limits.cursor).toISOString())
    }

    const partnerDetailsRes = await partnerDetailsQuery

    if (partnerDetailsRes.error) {
        console.error("[searchMarketplaceByCity] Partner details query error:", partnerDetailsRes.error)
    }
    const allPartners = partnerDetailsRes.data || []
    let partnerIds = [...new Set(allPartners.map((s: any) => s.partner_id))]

    // Filtro por Raio
    let centerCoords = limits.centerCoords || null
    if (!centerCoords && limits.latitude && limits.longitude) {
        centerCoords = { lat: limits.latitude, lng: limits.longitude }
    }
    if (!centerCoords && !cidadeSlug.startsWith("estado-")) {
        centerCoords = await resolveCityCoordsFromSlug(cidadeSlug)
    }

    if (centerCoords && limits.radius && partnerIds.length > 0) {
        const partnersInRadius = allPartners.filter((p: any) => {
            const addr = Array.isArray(p.addresses) ? p.addresses[0] : p.addresses
            if (addr?.latitude !== null && addr?.longitude !== null) {
                const dist = calculateDistance(centerCoords!, { lat: addr.latitude, lng: addr.longitude })
                return dist <= limits.radius!
            }
            return true
        })
        partnerIds = [...new Set(partnersInRadius.flatMap((p: any) => [p.partner_id, p.id]).filter(Boolean))] as string[]
        filteredPartners = partnersInRadius
    } else {
        filteredPartners = allPartners
    }

    if (type === 'vitrines' || type === 'tudo') {
        filteredPartners = filteredPartners.slice(0, limitCount)
    } else {
        filteredPartners = []
    }

    if (partnerIds.length > 0) {
        const promises = []
        if (type === 'tudo' || type === 'produtos') {
            let pq = supabase
                .from("products")
                .select(`
                id, short_id, status, moderation_status, moderation_reason, name, description, price, promotional_price, stock_available, stock_quantity, images, rating,
                    sales_last_30_days, views_last_30_days, favorites_count, marketplace_score,
                    category_id, category:product_categories!category_id(name), created_at,
                    marketplace_category_id, marketplace_category:marketplace_product_categories!marketplace_category_id(name, parent:marketplace_product_categories!parent_id(name)),
                    subcategory_id, subcategory:product_categories!subcategory_id(name),
                    partners!inner(id, is_showcase_active),
                    stores!left(id, short_id, name, slug, logo_url, banner_url, marketplace_reputation, addresses!store_id!left(city, state, neighborhood, latitude, longitude), delivery_settings!store_id!left(base_fee, included_km, extra_km_price, max_delivery_km, is_delivery_enabled, delivery_payer)),
                    product_variants(variant_options, price_adjustment, is_active),
                    show_price_in_store
                `)
                .eq("status", "ativo")
                .eq("show_in_marketplace", true)
                .in("partner_id", partnerIds)
                .order("marketplace_score", { ascending: false, nullsFirst: false })
                .order("created_at", { ascending: false })
                .limit(type === 'produtos' || type === 'tudo' ? limitCount : 0)

            if (limits.cursor) {
                pq = pq.lt("created_at", new Date(limits.cursor).toISOString())
            }
            promises.push(pq)
        }
        if (type === 'tudo' || type === 'servicos') {
            let sq = supabase
                .from("services")
                .select(`
                    id, short_id, status, moderation_status, moderation_reason, name, description, price, promotional_price, images, rating, category_id, duration_minutes, billing_unit, price_type, created_at,
                    marketplace_score, views_count, bookings_last_30_days, favorites_count,
                    marketplace_category_id, marketplace_category:marketplace_service_categories!marketplace_category_id(name, parent:marketplace_service_categories!parent_id(name)),
                    partners!inner(id),
                    stores!left(id, short_id, name, slug, logo_url, banner_url, marketplace_reputation, addresses!store_id!left(city, state, neighborhood, latitude, longitude), delivery_settings!store_id!left(base_fee, included_km, extra_km_price, max_delivery_km, is_delivery_enabled, delivery_payer)),
                    show_price_in_store
                `)
                .in("status", ["ativo", "active"])
                .is("deleted_at", null)
                .eq("show_in_marketplace", true)
                .in("partner_id", partnerIds)
                .order("marketplace_score", { ascending: false, nullsFirst: false })
                .order("created_at", { ascending: false })
                .limit(type === 'servicos' || type === 'tudo' ? limitCount : 0)

            if (limits.cursor) {
                sq = sq.lt("created_at", new Date(limits.cursor).toISOString())
            }
            promises.push(sq)
        }
        if (type === 'tudo' || type === 'planos') {
            let rq = supabase
                .from("recurring_plans")
                .select(`
                    id, short_id, name, description, status, moderation_status, moderation_reason, images, show_in_marketplace, partner_id, frequency_type, frequency_interval, created_at,
                    marketplace_score, views_count, favorites_count,
                    partners!inner(id, is_showcase_active),
                    stores!left(id, short_id, name, logo_url, banner_url, marketplace_reputation, addresses!store_id!left(city, state, neighborhood, latitude, longitude)),
                    recurring_plan_items(
                        id, item_type, product_id, variant_id, service_id, quantity, unit_price,
                        products:product_id(id, name, price, images),
                        services:service_id(id, name, price, duration_minutes, images)
                    )
                `)
                .eq("status", "active")
                .eq("show_in_marketplace", true)
                .or("moderation_status.eq.approved,moderation_status.is.null")
                .in("partner_id", partnerIds)
                .order("marketplace_score", { ascending: false, nullsFirst: false })
                .order("created_at", { ascending: false })
                .limit(type === 'planos' || type === 'tudo' ? limitCount : 0)


            if (limits.cursor) {
                rq = rq.lt("created_at", new Date(limits.cursor).toISOString())
            }
            promises.push(rq)
        }

        const resList = await Promise.all(promises)
        let idx = 0
        if (type === 'tudo' || type === 'produtos') {
            const res = resList[idx++]
            if (res?.error) console.error("[searchMarketplaceByCity] Products query error:", res.error)
            rawProducts = res?.data || []
        }
        if (type === 'tudo' || type === 'servicos') {
            const res = resList[idx++]
            if (res?.error) console.error("[searchMarketplaceByCity] Services query error:", res.error)
            rawServices = res?.data || []
        }
        if (type === 'tudo' || type === 'planos') {
            const res = resList[idx++]
            if (res?.error) console.error("[searchMarketplaceByCity] Plans query error:", res.error)
            rawPlans = res?.data || []
        }
    }

    const normalizedPartners = filteredPartners.map((item: any) => {
        const storeName = item.name || "Vendedor"
        const storeImage = item.logo_url
        const addr = Array.isArray(item.addresses) ? item.addresses[0] : item.addresses
        const rawDelivery = Array.isArray(item.delivery_settings) ? item.delivery_settings[0] : item.delivery_settings
        const storeCity = addr?.city || null
        const storeState = addr?.state || null
        const storeLat = addr?.latitude || null
        const storeLng = addr?.longitude || null
        const storeId = item.id
        const categoryName = item.partners?.category?.parent?.name || item.partners?.category?.name || 'Loja Parceira'
        const rep = Number(item.marketplace_reputation ?? item.partners?.marketplace_reputation ?? 0)
        return {
            id: storeId,
            short_id: item.short_id || null,
            name: storeName,
            slug: item.slug,
            description: item.description,
            logo_url: storeImage,
            banner_url: item.banner_url,
            images: [item.banner_url || storeImage || "https://img.dudit.com.br/static/Placeholder.png"],
            rating: item.rating || 0,
            itemType: 'loja',
            category: categoryName,
            is_showcase_active: item.is_showcase_active !== false,
            delivery_settings: rawDelivery || null,
            marketplace_score: rep,
            marketplace_reputation: rep,
            seller_reputation: rep,
            partners: {
                id: item.partner_id || storeId,
                short_id: item.short_id || null,
                store_id: storeId,
                store_name: storeName,
                slug: item.slug,
                store_image_url: storeImage,
                store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
                banner_url: item.banner_url || null,
                latitude: storeLat,
                longitude: storeLng,
                city: storeCity,
                state: storeState,
                reviewsCount: 0,
                delivery_settings: rawDelivery || null,
                marketplace_reputation: rep,
                seller_reputation: rep,
            },
            created_at: item.created_at
        }
    })

    const normalizedProducts = rawProducts.map((item: any) => {
        const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
        const rawStore = Array.isArray(item.stores) ? item.stores[0] : item.stores
        const storeId = rawStore?.id || rawPartner?.id
        const storeName = rawStore?.name || "Vendedor"
        const storeImage = rawStore?.logo_url
        const storeAddr = Array.isArray(rawStore?.addresses) ? rawStore.addresses[0] : rawStore?.addresses
        const rawDelivery = Array.isArray(rawStore?.delivery_settings) ? rawStore.delivery_settings[0] : rawStore?.delivery_settings
        const storeCity = storeAddr?.city || null
        const storeState = storeAddr?.state || null
        const storeLat = storeAddr?.latitude || null
        const storeLng = storeAddr?.longitude || null
        const rep = Number(rawStore?.marketplace_reputation ?? rawPartner?.marketplace_reputation ?? 0)
        const partner = rawPartner || rawStore ? {
            ...rawPartner,
            id: rawPartner?.id || rawStore?.partner_id,
            store_id: storeId,
            store_name: storeName,
            slug: rawStore?.slug,
            store_image_url: storeImage,
            store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
            latitude: storeLat,
            longitude: storeLng,
            city: storeCity,
            state: storeState,
            delivery_settings: rawDelivery || null,
            marketplace_reputation: rep,
            seller_reputation: rep,
        } : null
        const variantFallback = extractFirstVariantFallback(item.product_variants, Number(item.price))
        const { product_variants, ...rest } = item
        return {
            ...rest,
            marketplace_score: Number(item.marketplace_score || 0),
            sales_last_30_days: Number(item.sales_last_30_days || 0),
            views_last_30_days: Number(item.views_last_30_days || 0),
            favorites_count: Number(item.favorites_count || 0),
            seller_reputation: rep,
            marketplace_reputation: rep,
            category: item.marketplace_category?.parent?.name || item.marketplace_category?.name || item.category?.name || null,
            subcategoryName: item.marketplace_category?.parent ? item.marketplace_category.name : (item.subcategory?.name || null),
            itemType: 'produto',
            partners: partner,
            delivery_settings: rawDelivery || null,
            ...variantFallback
        }
    })

    const normalizedServices = rawServices.map((item: any) => {
        const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
        const rawStore = Array.isArray(item.stores) ? item.stores[0] : item.stores
        const storeId = rawStore?.id || rawPartner?.id
        const storeName = rawStore?.name || "Vendedor"
        const storeImage = rawStore?.logo_url
        const storeAddr = Array.isArray(rawStore?.addresses) ? rawStore.addresses[0] : rawStore?.addresses
        const rawDelivery = Array.isArray(rawStore?.delivery_settings) ? rawStore.delivery_settings[0] : rawStore?.delivery_settings
        const storeCity = storeAddr?.city || null
        const storeState = storeAddr?.state || null
        const storeLat = storeAddr?.latitude || null
        const storeLng = storeAddr?.longitude || null
        const rep = Number(rawStore?.marketplace_reputation ?? rawPartner?.marketplace_reputation ?? 0)
        const partner = rawPartner || rawStore ? {
            ...rawPartner,
            id: rawPartner?.id || rawStore?.partner_id,
            store_id: storeId,
            store_name: storeName,
            slug: rawStore?.slug,
            store_image_url: storeImage,
            store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
            latitude: storeLat,
            longitude: storeLng,
            city: storeCity,
            state: storeState,
            delivery_settings: rawDelivery || null,
            marketplace_reputation: rep,
            seller_reputation: rep,
        } : null
        const categoryName = (item.marketplace_category?.parent?.name || item.marketplace_category?.name || null) as string | null
        const sanitizedCategoryName = categoryName && typeof categoryName === 'string' ? categoryName : null
        const basePrice = Number(item.promotional_price || item.price || 0)
        const originalPrice = item.promotional_price && Number(item.price) > Number(item.promotional_price)
            ? Number(item.price)
            : undefined
        return {
            ...item,
            marketplace_score: Number(item.marketplace_score || 0),
            views_count: Number(item.views_count || 0),
            bookings_last_30_days: Number(item.bookings_last_30_days || 0),
            favorites_count: Number(item.favorites_count || 0),
            seller_reputation: rep,
            marketplace_reputation: rep,
            price: basePrice,
            originalPrice,
            category: sanitizedCategoryName,
            itemType: 'servico',
            partners: partner,
            delivery_settings: rawDelivery || null,
            duration_minutes: item.duration_minutes ?? null,
            price_type: item.price_type ?? null,
            billing_unit: item.billing_unit ?? null,
            subcategoryName: item.marketplace_category?.parent ? item.marketplace_category.name : null
        }
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

    results.sort((a, b) => calcCategoryBrowseScore(b) - calcCategoryBrowseScore(a))
    results = applySellerDiversity(results)

    const finalIds = results.map(r => `${r.itemType}:${r.id}`)
    return { results, filteredIds: finalIds }
}

type BrowseScoreHit = {
    item_type: string
    id: string
    score: number
    created_at: string
    partner_id?: string
}

async function browseMarketplaceByScore(
    type: 'produtos' | 'servicos' | 'vitrines' | 'tudo' | 'planos',
    limits: { vitrines?: number; produtos?: number; servicos?: number; planos?: number; geral?: number; cursor?: number; lastId?: string; partnerIds?: string[] } = {},
): Promise<{ results: any[]; filteredIds: string[] }> {
    const supabase = getAdminClient()
    const limitCount = type === 'tudo'
        ? (limits.geral ?? 40)
        : type === 'vitrines'
            ? (limits.vitrines ?? 40)
            : type === 'produtos'
                ? (limits.produtos ?? 20)
                : type === 'planos'
                    ? (limits.planos ?? 20)
                    : (limits.servicos ?? 20)

    const rpcType = type === 'vitrines' ? 'tudo' : type
    const { data: hits, error } = await supabase.rpc("browse_marketplace_by_score", {
        p_type: rpcType,
        p_limit: limitCount,
        p_cursor_score: limits.cursor ? Number(limits.cursor) : null,
        p_cursor_id: limits.lastId ? String(limits.lastId) : null,
        p_partner_ids: limits.partnerIds?.length ? limits.partnerIds : null,
        p_store_ids: null,
    })

    if (error || !hits?.length) {
        if (error) {
            console.error("[browseMarketplaceByScore] RPC error, falling back to direct table query:", error.message)
            try {
                const fallbackHits: MarketplaceSearchHit[] = []
                const fetchProducts = type === 'tudo' || type === 'produtos'
                const fetchServices = type === 'tudo' || type === 'servicos'
                const fetchStores = type === 'tudo' || type === 'vitrines'
                const fetchPlans = type === 'tudo' || type === 'planos'

                const promises: Promise<any>[] = []

                if (fetchProducts) {
                    let pq = supabase
                        .from("products")
                        .select("id, marketplace_score, created_at")
                        .eq("is_active", true)
                        .eq("show_in_marketplace", true)
                        .order("marketplace_score", { ascending: false, nullsFirst: false })
                        .limit(type === 'produtos' ? limitCount : Math.min(limitCount, 20))
                    if (limits.partnerIds?.length) {
                        pq = pq.in("partner_id", limits.partnerIds)
                    }
                    promises.push(pq.then((r: any) => (r.data || []).map((p: any) => ({ item_type: "produto", id: p.id, rank: p.marketplace_score || 0, created_at: p.created_at }))))
                }

                if (fetchServices) {
                    let sq = supabase
                        .from("services")
                        .select("id, marketplace_score, created_at")
                        .eq("is_active", true)
                        .is("deleted_at", null)
                        .eq("show_in_marketplace", true)
                        .order("marketplace_score", { ascending: false, nullsFirst: false })
                        .limit(type === 'servicos' ? limitCount : Math.min(limitCount, 20))
                    if (limits.partnerIds?.length) {
                        sq = sq.in("partner_id", limits.partnerIds)
                    }
                    promises.push(sq.then((r: any) => (r.data || []).map((s: any) => ({ item_type: "servico", id: s.id, rank: s.marketplace_score || 0, created_at: s.created_at }))))
                }

                if (fetchStores) {
                    let stq = supabase
                        .from("stores")
                        .select("id, marketplace_reputation, created_at")
                        .eq("is_active", true)
                        .order("marketplace_reputation", { ascending: false, nullsFirst: false })
                        .limit(type === 'vitrines' ? limitCount : Math.min(limitCount, 10))
                    if (limits.partnerIds?.length) {
                        stq = stq.in("partner_id", limits.partnerIds)
                    }
                    promises.push(stq.then((r: any) => (r.data || []).map((st: any) => ({ item_type: "loja", id: st.id, rank: st.marketplace_reputation || 0, created_at: st.created_at }))))
                }

                if (fetchPlans) {
                    let plq = supabase
                        .from("recurring_plans")
                        .select("id, marketplace_score, created_at")
                        .eq("status", "active")
                        .eq("show_in_marketplace", true)
                        .or("moderation_status.eq.approved,moderation_status.is.null")
                        .order("marketplace_score", { ascending: false, nullsFirst: false })
                        .limit(type === 'planos' ? limitCount : Math.min(limitCount, 10))
                    if (limits.partnerIds?.length) {
                        plq = plq.in("partner_id", limits.partnerIds)
                    }
                    promises.push(plq.then((r: any) => (r.data || []).map((pl: any) => ({ item_type: "plano", id: pl.id, rank: pl.marketplace_score || 0, created_at: pl.created_at }))))
                }

                const resolvedArrays = await Promise.all(promises)
                resolvedArrays.forEach(arr => fallbackHits.push(...arr))
                fallbackHits.sort((a, b) => (Number(b.rank) || 0) - (Number(a.rank) || 0))

                if (fallbackHits.length > 0) {
                    const sliced = fallbackHits.slice(0, limitCount)
                    const results = await hydrateMarketplaceSearchHits(sliced, supabase)
                    const diversified = applySellerDiversity(results)
                    const finalIds = diversified.map((r) => `${r.itemType}:${r.id}`)
                    return { results: diversified, filteredIds: finalIds }
                }
            } catch (fallbackErr) {
                console.error("[browseMarketplaceByScore] Table fallback error:", fallbackErr)
            }
        }
        return { results: [], filteredIds: [] }
    }

    const rankedHits = (hits as BrowseScoreHit[]).map((h) => ({
        item_type: h.item_type,
        id: h.id,
        rank: h.score,
        created_at: h.created_at,
    }))

    const results = await hydrateMarketplaceSearchHits(rankedHits as MarketplaceSearchHit[], supabase)
    const diversified = applySellerDiversity(results)
    const finalIds = diversified.map((r) => `${r.itemType}:${r.id}`)
    return { results: diversified, filteredIds: finalIds }
}

// ─── City name resolution for accent-correct display ────────────────────────

const normalizeSlug = (name: string): string =>
    name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")

/**
 * Returns a map of ASCII slug → accented city name for all cities with addresses in the DB.
 * Cached for 1 hour to avoid repeated DB queries.
 */
const getCachedCityAccentMap = unstable_cache(
    async (): Promise<Record<string, string>> => {
        const supabase = getAdminClient()
        const { data: addresses, error } = await supabase
            .from("addresses")
            .select("city, state")
            .not("city", "is", null)
            .not("state", "is", null)

        if (error || !addresses) return {}

        const map: Record<string, string> = {}
        for (const addr of addresses) {
            const city = (addr as any).city as string
            const state = (addr as any).state as string
            if (!city || !state) continue
            const slug = `${normalizeSlug(city)}-${state.toLowerCase()}`
            if (!map[slug]) {
                map[slug] = city
            }
        }
        return map
    },
    ["city-accent-map"],
    { revalidate: 3600, tags: ["addresses"] }
)

/**
 * Server action: resolve a batch of city slugs to their accented names.
 * Returns a Record<slug, accentedName> for all resolved slugs.
 */
export async function resolveCityAccentBatch(slugs: string[]): Promise<Record<string, string>> {
    if (!slugs || slugs.length === 0) return {}
    const accentMap = await getCachedCityAccentMap()
    const result: Record<string, string> = {}
    for (const slug of slugs) {
        if (accentMap[slug]) {
            result[slug] = accentMap[slug]
        }
    }
    return result
}

