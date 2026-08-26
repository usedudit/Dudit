import "server-only"

import { cache } from "react"
import { unstable_cache } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { calculateDistance, enrichMarketplaceDistance, formatDistanceLabel } from "@/lib/services/location.service"

const DISCOVER_DEBUG = false

function dLog(...args: unknown[]) {
    if (DISCOVER_DEBUG) console.log(...args)
}
function dWarn(...args: unknown[]) {
    if (DISCOVER_DEBUG) console.warn(...args)
}
function dError(...args: unknown[]) {
    if (DISCOVER_DEBUG) console.error(...args)
}

// ─── State name map (UF → full name) ───────────────────────────────────────

const ESTADOS: Record<string, string> = {
    AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas",
    BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
    GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
    MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
    PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
    RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
    SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HomeSection {
    id: string
    title: string
    subtitle: string
    gatilho: string
    items: any[]
    seeMoreLink: string
    _allItems?: any[]
}

export interface DiscoverCtx {
    city: string
    state: string
    stateOnly: boolean
    citySlug: string
    coords: { lat: number; lng: number } | null
    userId: string | null
    scope: "country" | "state" | "city"
}

interface PartnerTiers {
    cityIds: Set<string>
    stateIds: Set<string>
    allIds: Set<string>
}

interface RawProduct {
    id: string
    name: string
    price: number
    promotional_price?: number
    images?: any
    rating?: number
    stock_quantity?: number
    stock_available?: number
    views_last_30_days?: number
    sales_last_7_days?: number
    sales_last_30_days?: number
    favorites_count?: number
    condition?: string
    created_at?: string
    marketplace_category?: any
    partners?: any
    stores?: any
    product_variants?: any[]
}

// ─── Gatilhos psicológicos ──────────────────────────────────────────────────

export const GATILHOS_MAP: Record<string, string> = {
    trending: "prova_social",
    endingSoon: "urgencia",
    nearby: "proximidade",
    recent: "curiosidade",
    gems: "recompensa",
    personalized: "personalizacao",
    bestSellers: "validacao",
    topRated: "autoridade",
    promos: "economia",
    topVitrines: "confianca",
    mostViewed: "prova_social",
    services: "proximidade",
    popular: "validacao",
} as const

// ─── Seeded shuffle ─────────────────────────────────────────────────────────

function seededShuffle<T>(array: T[], seed: string): T[] {
    let h = 0
    for (let i = 0; i < seed.length; i++) h = ((h << 5) - h) + seed.charCodeAt(i)
    const r = [...array]
    for (let i = r.length - 1; i > 0; i--) {
        h = (h * 16807) % 2147483647
        const j = Math.abs(h) % (i + 1)
            ;[r[i], r[j]] = [r[j], r[i]]
    }
    return r
}

function dailySeed(userId: string | null): string {
    const today = new Date().toDateString()
    return `dudit-${userId ?? "anon"}-${today}`
}

function hashSeed(seed: string, id: string): number {
    let h = 0
    const s = `${seed}-${id}`
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i)
    return Math.abs(h)
}

// ─── Normalization helper ───────────────────────────────────────────────────

function normalizeCitySlug(name: string): string {
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
}

// ─── Section title/subtitle by scope ───────────────────────────────────────

function sectionDisplay(
    id: string,
    ctx: DiscoverCtx,
    displayScope: "city" | "state" | "country",
): { title: string; subtitle: string } {
    const stateName = ESTADOS[ctx.state] || ctx.state
    const cityName = ctx.city

    const MAP: Record<string, Record<string, [string, string]>> = {
        trending: {
            country: ["Produtos na Dudit", "Encontre produtos de vendedores locais"],
            state: [`Produtos no ${stateName}`, `Encontre produtos disponíveis no ${stateName}`],
            city: [`Produtos em ${cityName}`, `Encontre produtos de vendedores perto de você`],
        },
        endingSoon: {
            country: ["Acabando hoje", "Ofertas que terminam em breve"],
            state: ["Acabando hoje", "Ofertas que terminam em breve"],
            city: ["Acabando hoje", "Ofertas que terminam em breve"],
        },
        nearby: {
            country: ["Perto de você", "SKIP"],
            state: ["Perto de você", "SKIP"],
            city: ["Até 2km de você", "Produtos pertinho da sua localização"],
        },
        recent: {
            country: ["Recém anunciados", "Acabaram de chegar na Dudit"],
            state: [`Recém anunciados no ${stateName}`, `Acabaram de chegar no ${stateName}`],
            city: [`Recém anunciados em ${cityName}`, `Acabaram de chegar em ${cityName}`],
        },
        gems: {
            country: ["Achados da Dudit", "Oportunidades imperdíveis selecionadas para você"],
            state: ["Achados da Dudit", "Oportunidades imperdíveis selecionadas para você"],
            city: ["Achados da Dudit", "Oportunidades imperdíveis selecionadas para você"],
        },
        personalized: {
            country: ["Você pode gostar", "Baseado nos seus favoritos e compras"],
            state: ["Você pode gostar", "Baseado nos seus favoritos e compras"],
            city: ["Você pode gostar", "Baseado nos seus favoritos e compras"],
        },
        bestSellers: {
            country: ["Mais vendidos", "Os produtos mais vendidos da Dudit"],
            state: [`Mais vendidos no ${stateName}`, `Os mais vendidos no ${stateName}`],
            city: [`Mais vendidos em ${cityName}`, `Os mais vendidos em ${cityName}`],
        },
        topRated: {
            country: ["Melhor avaliados", "Os produtos com as melhores avaliações"],
            state: ["🏆 Melhor avaliados", "Os produtos com as melhores avaliações"],
            city: ["🏆 Melhor avaliados", "Os produtos com as melhores avaliações"],
        },
        promos: {
            country: ["Promoções especiais", "Os melhores descontos da Dudit"],
            state: ["Promoções especiais", "Os melhores descontos da região"],
            city: ["Promoções especiais", "Os melhores descontos perto de você"],
        },
        mostViewed: {
            country: ["Mais visualizados", "O que todo mundo está de olho"],
            state: ["Mais visualizados", "O que todo mundo está de olho"],
            city: ["Mais visualizados", "O que todo mundo está de olho"],
        },
        services: {
            country: ["Serviços e profissionais", "Encontre os melhores serviços para o seu dia a dia"],
            state: [`Serviços no ${stateName}`, `Profissionais e serviços disponíveis no ${stateName}`],
            city: [`Serviços em ${cityName}`, `Profissionais e serviços perto de você`],
        },
        topVitrines: {
            country: ["Lojas e vitrines locais", "Conheça negócios e lojas para você visitar"],
            state: [`Lojas e vitrines do ${stateName}`, `Conheça negócios e lojas no ${stateName}`],
            city: [`Lojas e vitrines em ${cityName}`, `Descubra lojas e negócios perto de você`],
        },
        popular: {
            country: ["Populares na Dudit", "O que está bombando por aqui"],
            state: [`Populares no ${stateName}`, `O que está bombando no ${stateName}`],
            city: [`Populares em ${cityName}`, `O que está bombando em ${cityName}`],
        },
    }

    const entry = MAP[id]?.[displayScope] || MAP[id]?.country || ["", ""]
    return { title: entry[0], subtitle: entry[1] }
}

// ─── Determine display scope from tier distribution ────────────────────────

type WithTier = { _tier: number }

function determineDisplayScope(items: WithTier[], ctx: DiscoverCtx): "city" | "state" | "country" {
    const min = 1
    const cityCount = items.filter(i => i._tier === 0).length
    const stateCount = items.filter(i => i._tier === 1).length

    if (ctx.scope === "city" && cityCount >= min) return "city"
    if ((ctx.scope === "city" || ctx.scope === "state") && cityCount + stateCount >= min) return "state"
    return "country"
}

// ─── Filter items to match display scope ────────────────────────────────────

function filterByScope<T extends WithTier>(items: T[], displayScope: "city" | "state" | "country"): T[] {
    if (displayScope === "city") return items.filter(i => i._tier === 0)
    if (displayScope === "state") return items.filter(i => i._tier === 0 || i._tier === 1)
    return items
}

// ─── Partner IDs by tier (city → state → country) ───────────────────────────

interface PartnerTiersRaw {
    cityIds: string[]
    stateIds: string[]
    allIds: string[]
}

const getCachedPartnerIdsByTier = (
    city: string,
    state: string,
    stateOnly: boolean,
) => unstable_cache(
    async (): Promise<PartnerTiersRaw> => {
        const supabase = getAdminClient()

        const { data: stores, error } = await supabase
            .from("stores")
            .select("partner_id, addresses!store_id!inner(city, state)")
            .eq("is_active", true)

        if (error) {
            dError(`[DISCOVER][PARTNER_IDS] Error:`, error, `city=${city} state=${state}`)
            return { cityIds: [], stateIds: [], allIds: [] }
        }

        if (!stores || stores.length === 0) {
            dWarn("[DISCOVER][PARTNER_IDS] No active partners found in Brazil")
            return { cityIds: [], stateIds: [], allIds: [] }
        }

        const allIds = new Set<string>()
        const stateIds = new Set<string>()
        let statePartnerCount = 0
        const targetState = state.toLowerCase()

        for (const s of stores) {
            allIds.add((s as any).partner_id)
            const addr = (s as any).addresses?.[0] || (s as any).addresses
            if (addr?.state?.toLowerCase() === targetState) {
                stateIds.add((s as any).partner_id)
                statePartnerCount++
            }
        }

        let cityIds: Set<string>
        let cityPartnerCount = 0

        if (stateOnly) {
            cityIds = new Set(stateIds)
            cityPartnerCount = statePartnerCount
        } else {
            cityIds = new Set<string>()
            const targetCitySlug = normalizeCitySlug(city)
            for (const s of stores) {
                const addr = (s as any).addresses?.[0] || (s as any).addresses
                if (addr?.city && normalizeCitySlug(addr.city) === targetCitySlug) {
                    cityIds.add((s as any).partner_id)
                    cityPartnerCount++
                }
            }
        }

        dLog(`[DISCOVER][PARTNER_IDS] city=${cityPartnerCount} | state=${statePartnerCount} | country=${allIds.size}`)

        return {
            cityIds: Array.from(cityIds),
            stateIds: Array.from(stateIds),
            allIds: Array.from(allIds),
        }
    },
    [`partner-ids-by-tier-${city}-${state}-${stateOnly}`],
    {
        tags: ["partners", "addresses"],
        revalidate: 3600 // 1 hour TTL
    }
)

const getPartnerIdsByTier = cache(async (
    city: string,
    state: string,
    stateOnly: boolean,
): Promise<PartnerTiers> => {
    const raw = await getCachedPartnerIdsByTier(city, state, stateOnly)()
    return {
        cityIds: new Set(raw.cityIds),
        stateIds: new Set(raw.stateIds),
        allIds: new Set(raw.allIds),
    }
})

// ─── Tier sort helper ───────────────────────────────────────────────────────

function getPartnerId(item: { partners?: any }): string | undefined {
    const raw = Array.isArray(item.partners) ? item.partners[0] : item.partners
    return raw?.id
}

function getPartnerShowcaseInactive(item: any): boolean {
    const raw = Array.isArray(item.partners) ? item.partners[0] : item.partners
    return raw?.is_showcase_active === false
}

function applyTierSort<T>(
    items: T[],
    tiers: PartnerTiers,
    scorer: (item: T) => number,
): (T & WithTier)[] {
    return items
        .map(item => {
            const pid = getPartnerId(item as any)
            const tier = pid && tiers.cityIds.has(pid) ? 0
                : pid && tiers.stateIds.has(pid) ? 1
                    : 2
            return { ...item, _tier: tier } as T & WithTier
        })
        .sort((a, b) => {
            const tierDiff = a._tier - b._tier
            if (tierDiff !== 0) return tierDiff
            const aInactive = getPartnerShowcaseInactive(a) ? 1 : 0
            const bInactive = getPartnerShowcaseInactive(b) ? 1 : 0
            if (aInactive !== bInactive) return aInactive - bInactive
            return scorer(b as T) - scorer(a as T)
        })
}

// ─── Product query fields ───────────────────────────────────────────────────

const BASE_FIELDS = `id, short_id, name, price, promotional_price, images, rating, stock_quantity, stock_available, marketplace_category_id, marketplace_category:marketplace_product_categories!marketplace_category_id(name, parent:marketplace_product_categories!parent_id(name)), product_variants(variant_options, price_adjustment, is_active)`
const STATS_FIELDS = `views_last_30_days, sales_last_7_days, sales_last_30_days, favorites_count`

const PARTNER_JOIN = `partners!inner(
    id, is_showcase_active
),
stores!left(
    id, short_id, name, slug, description, logo_url, banner_url,
    phone, is_showcase_active,
    addresses!store_id!left(city, state, neighborhood, latitude, longitude)
)`

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

// ─── Process product into ItemCard shape ────────────────────────────────────

function processProduct(item: RawProduct, extra?: Record<string, any>) {
    const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
    const rawStore: any = Array.isArray(item.stores) ? item.stores[0] : item.stores
    const storeName = rawStore?.name || "Vendedor"
    const storeImage = rawStore?.logo_url
    const addr = Array.isArray(rawStore?.addresses) ? rawStore.addresses[0] : rawStore?.addresses
    const storeCity = addr?.city || rawStore?.city || null
    const storeState = addr?.state || rawStore?.state || null
    const storeLat = addr?.latitude ?? null
    const storeLng = addr?.longitude ?? null
    const storeSlug = rawStore?.slug || null

    const partner = rawPartner || rawStore
        ? {
            id: rawPartner.id,
            store_id: rawStore?.id || rawPartner.id,
            short_id: rawStore?.short_id || null,
            slug: rawStore?.slug || null,
            store_name: storeName,
            store_image_url: storeImage,
            store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
            latitude: addr?.latitude ?? null,
            longitude: addr?.longitude ?? null,
            city: storeCity,
            state: storeState,
            neighborhood: addr?.neighborhood ?? null,
        }
        : null


    const rawCategory: any = Array.isArray(item.marketplace_category)
        ? item.marketplace_category[0]
        : item.marketplace_category
    const categoryName = rawCategory?.parent?.name || rawCategory?.name || null
    const subcategoryName = rawCategory?.parent ? rawCategory?.name : null

    const variantFallback = extractFirstVariantFallback(item.product_variants, Number(item.price))
    const basePrice = Number(item.promotional_price || item.price || 0)
    const effectivePrice = (!item.promotional_price && variantFallback.fallback_variant_price)
        ? Number(variantFallback.fallback_variant_price)
        : (basePrice > 0 ? basePrice : Number(variantFallback.fallback_variant_price || 0))

    const originalPrice = item.promotional_price
        ? (Number(item.price) > 0 ? Number(item.price) : (variantFallback.fallback_variant_price ? Number(variantFallback.fallback_variant_price) : undefined))
        : undefined

    return {
        id: item.id,
        short_id: (item as any).short_id || null,
        name: item.name,
        price: effectivePrice,
        originalPrice,
        images: item.images || [],
        rating: item.rating,
        category: categoryName,
        subcategoryName,
        partners: partner,
        itemType: "produto" as const,
        created_at: item.created_at,
        fallback_variant_price: variantFallback.fallback_variant_price,
        fallback_variant_image: variantFallback.fallback_variant_image,
        product_variants: item.product_variants,
        _views: item.views_last_30_days ?? 0,
        _salesWeek: item.sales_last_7_days ?? 0,
        _sales: item.sales_last_30_days ?? 0,
        _stock: Number(item.stock_quantity ?? item.stock_available ?? 0),
        _favs: item.favorites_count ?? 0,
        ...extra,
    }
}

// ─── Urgency badges (Últimos N) ────────────────────────────────────────────
// Random but deterministic per day so the same products don't always show them.

function applyUrgencyBadges(sections: HomeSection[], ctx: DiscoverCtx) {
    const seed = dailySeed(ctx.userId)
    for (const section of sections) {
        for (const item of section.items) {
            const it = item as any
            if (it._badgeLabel) continue
            if (it.itemType !== "produto") continue
            const stock = Number(it._stock ?? 0)
            const h = hashSeed(seed, `${it.id}-launch-badge`) % 100
            if (stock > 0 && stock <= 5 && h < 45) {
                it._badgeLabel = `Últimos ${stock}`
                it._badgeVariant = "red"
            } else if (it.originalPrice && it.originalPrice > it.price && h >= 45 && h < 75) {
                it._badgeLabel = "Promoção"
                it._badgeVariant = "green"
            } else if (h >= 75 && h < 90) {
                it._badgeLabel = "Destaque"
                it._badgeVariant = "purple"
            }
        }
    }
}

// ─── Shared Request-Scoped Product, Service and Store Pools ───────────────

const getSharedHomeProductsPool = cache(async (allIdsKey: string, allIds: string[]): Promise<RawProduct[]> => {
    if (allIds.length === 0) return []
    const supabase = getAdminClient()
    const { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, ${STATS_FIELDS}, marketplace_score, condition, created_at, category_id, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .order("created_at", { ascending: false })
        .limit(150)

    if (error || !data) return []
    return data as RawProduct[]
})

const getSharedHomeServicesPool = cache(async (allIdsKey: string, allIds: string[]): Promise<any[]> => {
    if (allIds.length === 0) return []
    const supabase = getAdminClient()
    const { data, error } = await supabase
        .from("services")
        .select(`id, short_id, name, price, images, rating, created_at, marketplace_category_id, marketplace_category:marketplace_service_categories!marketplace_category_id(name, parent:marketplace_service_categories!parent_id(name)), ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .order("created_at", { ascending: false })
        .limit(60)

    if (error) {
        console.error("[Discover] getSharedHomeServicesPool error:", error)
        return []
    }
    if (!data) return []
    return data as any[]
})

const getSharedHomeStoresPool = cache(async (allIdsKey: string, allIds: string[]): Promise<any[]> => {
    if (allIds.length === 0) return []
    const supabase = getAdminClient()
    const { data, error } = await supabase
        .from("stores")
        .select(`
            id, short_id, name, slug, description, logo_url, banner_url,
            phone, rating, is_showcase_active, partner_id,
            addresses!store_id!left(city, state, neighborhood, latitude, longitude),
            partners!inner(id, category_id, category:marketplace_partner_categories!category_id(name, slug, parent:marketplace_partner_categories!parent_id(name)), reviews(count))
        `)
        .eq("is_active", true)
        .in("partner_id", allIds)
        .order("rating", { ascending: false, nulls: "last" })
        .limit(30)


    if (error || !data) return []
    return data as any[]
})

// ─── SECTION FETCHERS ───────────────────────────────────────────────────────

// ─── 1. 🔥 Bombando na sua região ───────────────────────────────────────────

async function fetchTrending(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP trending reason=no_partners`)
        return null
    }

    const trendingData = await getSharedHomeProductsPool(allIds.join(","), allIds)

    if (!trendingData || trendingData.length === 0) {
        dLog(`[Discover] SKIP trending reason=no_products`)
        return null
    }

    const tagged = applyTierSort(trendingData as RawProduct[], tiers, item => {
        const r = item as RawProduct
        const engagement = (r.views_last_30_days ?? 0) + (r.favorites_count ?? 0) * 2 + (r.sales_last_30_days ?? 0) * 5
        return engagement > 0 ? engagement : ((r as any).marketplace_score ?? 0)
    })

    // Prefer items with real engagement signals, fallback to top scores if fresh database
    const withSignals = tagged.filter(item => {
        const r = item as RawProduct
        return (r.views_last_30_days ?? 0) > 0
            || (r.favorites_count ?? 0) > 0
            || (r.sales_last_30_days ?? 0) > 0
    })

    const candidates = withSignals.length > 0 ? withSignals : tagged

    const displayScope = determineDisplayScope(candidates, ctx)
    const display = sectionDisplay("trending", ctx, displayScope)

    const scoped = filterByScope(candidates, displayScope)
    if (scoped.length === 0) {
        dLog(`[Discover] SKIP trending reason=no_items_in_scope`)
        return null
    }

    const items = scoped.slice(0, 20).map(item => processProduct(item as RawProduct))

    return {
        id: "trending",
        title: display.title,
        subtitle: display.subtitle,
        gatilho: GATILHOS_MAP.trending,
        items,
        _allItems: scoped.map(item => processProduct(item as RawProduct)),
        seeMoreLink: `/explorar/${ctx.citySlug}?type=produtos`,
    }
}

// ─── 2. ⏰ Acabando hoje (fallback: 24h → 48h → 7 dias) ──────────────────────

async function fetchEndingSoon(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP endingSoon reason=no_partners`)
        return null
    }

    const now = new Date()
    const limit7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const { data: rawCampaigns, error } = await supabase
        .from("campaigns")
        .select("id, ends_at")
        .eq("is_active", true)
        .in("partner_id", allIds)
        .gte("ends_at", now.toISOString())
        .lte("ends_at", limit7d.toISOString())
        .order("ends_at", { ascending: true })

    if (error) {
        dError(`[DISCOVER][ENDING_SOON] Error:`, error)
        dLog(`[Discover] SKIP endingSoon reason=error`)
        return null
    }

    if (!rawCampaigns || rawCampaigns.length === 0) {
        dLog(`[Discover] SKIP endingSoon reason=no_campaigns_in_7d`)
        return null
    }

    let campaigns: Record<string, any>[] = []
    const limit24h = now.getTime() + 24 * 60 * 60 * 1000
    const limit48h = now.getTime() + 48 * 60 * 60 * 1000

    const c24h = rawCampaigns.filter((c: any) => new Date(c.ends_at).getTime() <= limit24h)
    if (c24h.length > 0) {
        campaigns = c24h
    } else {
        const c48h = rawCampaigns.filter((c: any) => new Date(c.ends_at).getTime() <= limit48h)
        if (c48h.length > 0) {
            campaigns = c48h
        } else {
            campaigns = rawCampaigns
        }
    }

    const campaignIds = campaigns.map((c: Record<string, any>) => c.id)
    const endsAtMap = new Map(campaigns.map((c: Record<string, any>) => [c.id, c.ends_at]))

    const { data: promotions, error: promoErr } = await supabase
        .from("promotions")
        .select(`id, campaign_id, promotion_products(product_id)`)
        .eq("is_active", true)
        .in("campaign_id", campaignIds)
        .in("partner_id", allIds)

    if (promoErr) {
        dError(`[DISCOVER][ENDING_SOON] Promotions error:`, promoErr)
        dLog(`[Discover] SKIP endingSoon reason=promotions_error`)
        return null
    }

    if (!promotions || promotions.length === 0) {
        dLog(`[Discover] SKIP endingSoon reason=no_promotions`)
        return null
    }

    const productIds = new Set<string>()
    for (const promo of promotions) {
        const pp = promo.promotion_products as Array<{ product_id: string }> | undefined
        if (pp) for (const p of pp) if (p.product_id) productIds.add(p.product_id)
    }
    if (productIds.size === 0) {
        dLog(`[Discover] SKIP endingSoon reason=no_products_in_promotions`)
        return null
    }

    let { data: products, error: prodErr } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("id", [...productIds])
        .limit(30)

    if (prodErr) {
        dError(`[DISCOVER][ENDING_SOON] Products error:`, prodErr)
        dLog(`[Discover] SKIP endingSoon reason=products_error`)
        return null
    }

    if (!products || products.length === 0) {
        dLog(`[Discover] SKIP endingSoon reason=no_products_found`)
        return null
    }

    const tagged = applyTierSort(products as RawProduct[], tiers, () => 0)
    const displayScope = determineDisplayScope(tagged, ctx)
    const display = sectionDisplay("endingSoon", ctx, displayScope)

    const scoped = filterByScope(tagged, displayScope)
    if (scoped.length === 0) {
        dLog(`[Discover] SKIP endingSoon reason=no_items_in_scope`)
        return null
    }

    const items = scoped.slice(0, 20).map(item => {
        const raw = item as RawProduct
        const endsAt = endsAtMap.get(campaignIds[0])
        let timeLeft = "Acaba hoje"
        if (endsAt) {
            const diffMs = new Date(String(endsAt)).getTime() - Date.now()
            const hoursLeft = Math.ceil(diffMs / (1000 * 60 * 60))
            if (hoursLeft <= 1) timeLeft = "Termina em 1h"
            else if (hoursLeft <= 6) timeLeft = `Termina em ${hoursLeft}h`
            else if (hoursLeft <= 12) timeLeft = `Termina em ${hoursLeft}h`
            else timeLeft = "Último dia"
        }
        return processProduct(raw, { _timeLeft: timeLeft })
    })

    return {
        id: "endingSoon",
        title: display.title,
        subtitle: display.subtitle,
        gatilho: GATILHOS_MAP.endingSoon,
        items,
        _allItems: scoped.map(item => processProduct(item as RawProduct)),
        seeMoreLink: `/explorar/${ctx.citySlug}?section=ending-soon`,
    }
}

// ─── 3. 📍 Perto de você (adaptativo: ≤2km → ≤10km → mesma cidade) ────────

async function fetchNearby(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    if (!ctx.coords) {
        dLog(`[Discover] SKIP nearby reason=no_coords`)
        return null
    }

    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP nearby reason=no_partners`)
        return null
    }

    const data = await getSharedHomeProductsPool(allIds.join(","), allIds)

    if (!data || data.length === 0) {
        dLog(`[Discover] SKIP nearby reason=no_products`)
        return null
    }

    const withDistance = (data as RawProduct[]).map(item => {
        const store: any = Array.isArray(item.stores) ? item.stores[0] : item.stores
        const storeAddr = Array.isArray(store?.addresses) ? store.addresses[0] : store?.addresses
        const lat = storeAddr?.latitude ?? null
        const lng = storeAddr?.longitude ?? null
        let distKm = Infinity
        if (lat != null && lng != null && ctx.coords) {
            distKm = calculateDistance(ctx.coords, { lat: Number(lat), lng: Number(lng) })
        }
        const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
        const pid = rawPartner?.id
        const tier = pid && tiers.cityIds.has(pid) ? 0
            : pid && tiers.stateIds.has(pid) ? 1
                : 2
        return { ...item, _distKm: distKm, _tier: tier }
    })

    withDistance.sort((a, b) => a._distKm - b._distKm)

    // Try bands in order: 2km → 10km → same city
    const minItems = 4
    const band2km = withDistance.filter(i => i._distKm <= 2)
    const band10km = withDistance.filter(i => i._distKm > 2 && i._distKm <= 10)
    const bandCity = withDistance.filter(i => i._tier === 0)

    type NearbyBand = { id: string; title: string; subtitle: string; pool: typeof withDistance }
    const options: NearbyBand[] = [
        { id: "nearby2km", title: "📍 Até 2km de você", subtitle: "Produtos pertinho da sua localização", pool: band2km },
        { id: "nearby10km", title: "📍 Até 10km de você", subtitle: "Produtos na sua região", pool: band10km },
        { id: "nearbyCity", title: `📍 Em ${ctx.city}`, subtitle: `Produtos disponíveis em ${ctx.city}`, pool: bandCity },
    ]

    let chosen: NearbyBand | null = null
    for (const opt of options) {
        if (opt.pool.length >= minItems) {
            chosen = opt
            dLog(`[DISCOVER][NEARBY] Band "${opt.id}" → ${opt.pool.length} items`)
            break
        }
    }

    if (!chosen) {
        dLog(`[DISCOVER][NEARBY] No band with >=${minItems} items - skipping`)
        return null
    }

    const displayScope = determineDisplayScope(chosen.pool, ctx)

    const items = chosen.pool.slice(0, 20).map(item => {
        const dist = item._distKm
        const distText = Number.isFinite(dist) && dist >= 0 && dist !== Infinity
            ? formatDistanceLabel(dist)
            : null

        const p = processProduct(item, { _distanceText: distText })
        if (p.partners) {
            (p.partners as Record<string, any>).distance_km = Number.isFinite(dist) ? dist : null
                ; (p.partners as Record<string, any>).distance_km_formatted = distText
        }
        return p
    })

    return {
        id: chosen.id,
        title: chosen.title,
        subtitle: chosen.subtitle,
        gatilho: GATILHOS_MAP.nearby,
        items,
        _allItems: items,
        seeMoreLink: `/explorar/${ctx.citySlug}?section=nearby`,
    }
}

// ─── 4. 🆕 Recém anunciados (produtos + serviços) ───────────────────────────

async function fetchRecent(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP recent reason=no_partners`)
        return null
    }

    const [products, services] = await Promise.all([
        getSharedHomeProductsPool(allIds.join(","), allIds),
        getSharedHomeServicesPool(allIds.join(","), allIds),
    ])

    if (products.length === 0 && services.length === 0) {
        dLog(`[Discover] SKIP recent reason=no_items`)
        return null
    }

    const taggedProducts = products.length > 0
        ? applyTierSort(products, tiers, item => {
            const r = item as RawProduct
            return r.created_at ? new Date(r.created_at).getTime() : 0
        })
        : []

    const taggedServices = services.length > 0
        ? applyTierSort(services, tiers, item => {
            const r = item as any
            return r.created_at ? new Date(r.created_at).getTime() : 0
        })
        : []

    const merged = [
        ...taggedProducts.map(item => ({ ...item, _itemType: "produto" as const })),
        ...taggedServices.map(item => ({ ...item, _itemType: "servico" as const })),
    ].sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
        return bTime - aTime
    })

    const displayScope = determineDisplayScope(merged, ctx)
    const display = sectionDisplay("recent", ctx, displayScope)

    const scoped = filterByScope(merged, displayScope)
    if (scoped.length === 0) {
        dLog(`[Discover] SKIP recent reason=no_items_in_scope`)
        return null
    }

    const recentMapper = (item: any) => {
        if (item._itemType === "servico") {
            const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
            const rawStore: any = Array.isArray(item.stores) ? item.stores[0] : item.stores
            const storeName = rawStore?.name || "Vendedor"
            const storeImage = rawStore?.logo_url
            const addr = Array.isArray(rawStore?.addresses) ? rawStore.addresses[0] : rawStore?.addresses
            const storeCity = addr?.city || rawStore?.city || null
            const storeState = addr?.state || rawStore?.state || null
            const storeSlug = rawStore?.slug || null
            const partner = rawPartner ? {
                id: rawPartner.id,
                store_id: rawStore?.id || rawPartner.id,
                short_id: rawStore?.short_id || null,
                slug: storeSlug,
                store_name: storeName,
                store_image_url: storeImage,
                store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
                latitude: addr?.latitude ?? null,
                longitude: addr?.longitude ?? null,
                city: storeCity,
                state: storeState,
                neighborhood: addr?.neighborhood ?? null,
            } : null
            return {
                id: item.id,
                short_id: item.short_id || null,
                name: item.name,
                price: Number(item.price || 0),
                images: item.images || [],
                rating: item.rating,
                partners: partner,
                itemType: "servico" as const,
            }
        }

        return processProduct(item as RawProduct)
    }


    const items = scoped.slice(0, 20).map(recentMapper)

    return {
        id: "recent",
        title: display.title,
        subtitle: display.subtitle,
        gatilho: GATILHOS_MAP.recent,
        items,
        _allItems: scoped.map(recentMapper),
        seeMoreLink: `/explorar/${ctx.citySlug}?section=recent`,
    }
}

// ─── 5. 💎 Achados da Dudit ──────────────────────────────────────────────────

async function fetchGems(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP gems reason=no_partners`)
        return null
    }

    const seed = dailySeed(ctx.userId)
    const data = await getSharedHomeProductsPool(allIds.join(","), allIds)

    if (!data || data.length === 0) {
        dLog(`[Discover] SKIP gems reason=no_products`)
        return null
    }

    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        const r = item as RawProduct
        const origPrice = Number(r.price) > 0
            ? Number(r.price)
            : Number(extractFirstVariantFallback(r.product_variants).fallback_variant_price || 0)
        const hasPromo = r.promotional_price && origPrice > 0 && Number(r.promotional_price) < origPrice
        const discountPct = hasPromo
            ? ((origPrice - Number(r.promotional_price)) / origPrice) * 100
            : 0
        const usedBonus = (r.condition?.toLowerCase() === "used" || r.condition === "usado") ? 10 : 0
        const viewsBonus = (r.views_last_30_days ?? 0) / 100
        const objectiveScore = discountPct * 2 + viewsBonus + usedBonus
        const discoverBoost = (hashSeed(seed, r.id) % 20) / 100
        const varietyBonus = discoverBoost * (objectiveScore || 20)
        return objectiveScore + varietyBonus
    })

    // Diversity: max 3 per category
    const catCount = new Map<string, number>()
    const diverseItems: (RawProduct & WithTier)[] = []
    for (const item of tagged) {
        const catId = (item as any).category_id || "__none__"
        const count = catCount.get(catId) ?? 0
        if (count >= 3) continue
        catCount.set(catId, count + 1)
        diverseItems.push(item)
        if (diverseItems.length >= 20) break
    }

    const displayScope = determineDisplayScope(tagged, ctx)
    const display = sectionDisplay("gems", ctx, displayScope)

    const scoped = filterByScope(diverseItems, displayScope)
    if (scoped.length === 0) {
        dLog(`[Discover] SKIP gems reason=no_items_in_scope`)
        return null
    }

    const items = scoped.slice(0, 20).map(item => {
        const raw = item as RawProduct
        const origPrice = Number(raw.price) > 0
            ? Number(raw.price)
            : Number(extractFirstVariantFallback(raw.product_variants).fallback_variant_price || 0)
        const hasPromo = raw.promotional_price && origPrice > 0 && Number(raw.promotional_price) < origPrice
        const discountPct = hasPromo
            ? ((origPrice - Number(raw.promotional_price)) / origPrice) * 100
            : 0
        const isGoodDeal = discountPct >= 30 || (raw.condition?.toLowerCase() === "used" || raw.condition === "usado")
        return processProduct(raw, {
            _badgeLabel: isGoodDeal ? "Achado" : "Oferta rara",
            _badgeVariant: "purple",
        })
    })

    return {
        id: "gems",
        title: display.title,
        subtitle: display.subtitle,
        gatilho: GATILHOS_MAP.gems,
        items,
        _allItems: scoped.map(item => processProduct(item as RawProduct)),
        seeMoreLink: `/explorar/${ctx.citySlug}?section=gems`,
    }
}

// ─── 6. 👀 Você pode gostar (apenas logado com sinais reais) ────────────────

async function fetchPersonalizedUncached(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    if (!ctx.userId) {
        dLog(`[Discover] SKIP personalized reason=not_logged_in`)
        return null
    }

    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP personalized reason=no_partners`)
        return null
    }

    const { data: userFavs, error: favErr } = await supabase
        .from("favorites")
        .select("item_id")
        .eq("user_id", ctx.userId)
        .eq("item_type", "produto")
        .order("created_at", { ascending: false })
        .limit(50)

    if (favErr) {
        dError(`[DISCOVER][PERSONALIZED] Favorites error:`, favErr)
        dLog(`[Discover] SKIP personalized reason=favorites_error`)
        return null
    }

    const favProductIds = (userFavs || []).map((f: Record<string, any>) => f.item_id)

    // The favorites list itself is the signal. Avoid a count query followed by
    // the same list query. Only inspect orders when there are no product
    // favorites, preserving the old fallback behavior for buyers.
    if (favProductIds.length === 0) {
        const { count: orderCount } = await supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("buyer_id", ctx.userId)
            .limit(1)

        if ((orderCount ?? 0) === 0) {
            dLog(`[Discover] SKIP personalized reason=no_signals`)
            return null
        }
    }

    let preferredCatIds: string[] = []

    if (favProductIds.length > 0) {
        const { data: favProducts, error: catErr } = await supabase
            .from("products")
            .select("category_id")
            .in("id", favProductIds)

        if (catErr) {
            dError(`[DISCOVER][PERSONALIZED] Category error:`, catErr)
        } else if (favProducts) {
            if (favProducts.length > 0) {
                const counts = new Map<string, number>()
                for (const p of favProducts) {
                    if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1)
                }
                preferredCatIds = [...counts.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([id]) => id)
            }
        }
    }

    if (preferredCatIds.length === 0) {
        dLog(`[Discover] SKIP personalized reason=no_preferred_categories`)
        return null
    }

    let { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, ${STATS_FIELDS}, category_id, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .in("category_id", preferredCatIds)
        .order("marketplace_score", { ascending: false })
        .limit(60)

    if (error) {
        dError(`[DISCOVER][PERSONALIZED] Products error:`, error)
        dLog(`[Discover] SKIP personalized reason=products_error`)
        return null
    }

    if (!data || data.length === 0) {
        dLog(`[Discover] SKIP personalized reason=no_products`)
        return null
    }

    const favSet = new Set(favProductIds)
    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        return (item as any).marketplace_score ?? 0
    })

    const filtered = tagged.filter(item => !favSet.has((item as RawProduct).id))
    const displayScope = determineDisplayScope(filtered, ctx)
    const display = sectionDisplay("personalized", ctx, displayScope)

    const scoped = filterByScope(filtered, displayScope)
    if (scoped.length === 0) {
        dLog(`[Discover] SKIP personalized reason=no_items_in_scope`)
        return null
    }

    const items = scoped.slice(0, 20).map(item => processProduct(item as RawProduct))

    return {
        id: "personalized",
        title: display.title,
        subtitle: display.subtitle,
        gatilho: GATILHOS_MAP.personalized,
        items,
        _allItems: scoped.map(item => processProduct(item as RawProduct)),
        seeMoreLink: `/explorar/${ctx.citySlug}?section=for-you`,
    }
}

// ─── 7. ⭐ Mais vendidos ─────────────────────────────────────────────────────

async function fetchBestSellers(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP bestSellers reason=no_partners`)
        return null
    }

    const pool = await getSharedHomeProductsPool(allIds.join(","), allIds)
    const withSales = pool.filter(p => (p.sales_last_30_days ?? 0) > 0)

    if (withSales.length === 0) {
        dLog(`[Discover] SKIP bestSellers reason=no_products_with_sales`)
        return null
    }

    const tagged = applyTierSort(withSales, tiers, item => {
        return (item as RawProduct).sales_last_30_days ?? 0
    })

    const displayScope = determineDisplayScope(tagged, ctx)
    const display = sectionDisplay("bestSellers", ctx, displayScope)

    const scoped = filterByScope(tagged, displayScope)
    if (scoped.length === 0) {
        dLog(`[Discover] SKIP bestSellers reason=no_items_in_scope`)
        return null
    }

    const items = scoped.slice(0, 20).map(item => processProduct(item as RawProduct))

    return {
        id: "bestSellers",
        title: display.title,
        subtitle: display.subtitle,
        gatilho: GATILHOS_MAP.bestSellers,
        items,
        _allItems: scoped.map(item => processProduct(item as RawProduct)),
        seeMoreLink: `/explorar/${ctx.citySlug}?section=best-sellers`,
    }
}

// ─── 8. 🏆 Melhor avaliados ──────────────────────────────────────────────────

async function fetchTopRated(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP topRated reason=no_partners`)
        return null
    }

    const pool = await getSharedHomeProductsPool(allIds.join(","), allIds)
    const withRating = pool.filter(p => Number(p.rating ?? 0) >= 4.0 || Number(p.rating ?? 0) > 0)

    if (withRating.length === 0) {
        dLog(`[Discover] SKIP topRated reason=no_products_with_rating`)
        return null
    }

    const tagged = applyTierSort(withRating, tiers, item => {
        return (item as RawProduct).rating ?? 0
    })

    const displayScope = determineDisplayScope(tagged, ctx)
    const display = sectionDisplay("topRated", ctx, displayScope)

    const scoped = filterByScope(tagged, displayScope)
    if (scoped.length === 0) {
        dLog(`[Discover] SKIP topRated reason=no_items_in_scope`)
        return null
    }

    const items = scoped.slice(0, 20).map(item => {
        const raw = item as RawProduct
        return processProduct(raw)
    })

    return {
        id: "topRated",
        title: display.title,
        subtitle: display.subtitle,
        gatilho: GATILHOS_MAP.topRated,
        items,
        _allItems: scoped.map(item => processProduct(item as RawProduct)),
        seeMoreLink: `/explorar/${ctx.citySlug}?section=top-rated`,
    }
}

// ─── 9. 🎯 Promoções especiais ───────────────────────────────────────────────

async function fetchPromos(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP promos reason=no_partners`)
        return null
    }

    const pool = await getSharedHomeProductsPool(allIds.join(","), allIds)

    const discounted = pool.filter((item: any) => {
        const origPrice = Number(item.price) > 0
            ? Number(item.price)
            : Number(extractFirstVariantFallback(item.product_variants).fallback_variant_price || 0)
        return item.promotional_price && origPrice > 0 && Number(item.promotional_price) < origPrice
    })

    if (discounted.length === 0) {
        dLog(`[Discover] SKIP promos reason=no_discounts`)
        return null
    }

    const tagged = applyTierSort(discounted as RawProduct[], tiers, item => {
        const r = item as RawProduct
        const origPrice = Number(r.price) > 0
            ? Number(r.price)
            : Number(extractFirstVariantFallback(r.product_variants).fallback_variant_price || 0)
        if (!r.promotional_price || origPrice <= 0) return 0
        return ((origPrice - Number(r.promotional_price)) / origPrice) * 100
    })

    const displayScope = determineDisplayScope(tagged, ctx)
    const display = sectionDisplay("promos", ctx, displayScope)

    const scoped = filterByScope(tagged, displayScope)
    if (scoped.length === 0) {
        dLog(`[Discover] SKIP promos reason=no_items_in_scope`)
        return null
    }

    const items = scoped.slice(0, 20).map(item => {
        const raw = item as RawProduct
        const origPrice = Number(raw.price) > 0
            ? Number(raw.price)
            : Number(extractFirstVariantFallback(raw.product_variants).fallback_variant_price || 0)
        const discountPct = origPrice > 0
            ? Math.round(((origPrice - Number(raw.promotional_price)) / origPrice) * 100)
            : 0
        return processProduct(raw, {
            _badgeLabel: `-${discountPct}%`,
            _badgeVariant: "orange" as const,
        })
    })

    return {
        id: "promos",
        title: display.title,
        subtitle: display.subtitle,
        gatilho: GATILHOS_MAP.promos,
        items,
        _allItems: scoped.map(item => processProduct(item as RawProduct)),
        seeMoreLink: `/explorar/${ctx.citySlug}?section=promos`,
    }
}

// ─── 10. 🎨 Seções Temáticas Rotatórias (100% em memória do pool) ────────────

export interface ThemeDefinition {
    id: string
    title: string
    subtitle: string
    category: string
    slug: string
    emoji: string
}

export const THEME_DEFINITIONS: ThemeDefinition[] = [
    { id: "theme_alimentacao", title: "🍽️ Sabores da região", subtitle: "Delícias e gastronomia perto de você", category: "Alimentação", slug: "alimentacao", emoji: "🍽️" },
    { id: "theme_casa", title: "🏠 Dando um trato na casa", subtitle: "Itens para organizar, decorar e renovar seu lar", category: "Casa", slug: "casa", emoji: "🏠" },
    { id: "theme_tecnologia", title: "💻 Tecnologia pra facilitar", subtitle: "Eletrônicos e tecnologia para o seu dia a dia", category: "Tecnologia", slug: "tecnologia", emoji: "💻" },
    { id: "theme_moda", title: "👗 Renove o visual", subtitle: "Roupas, calçados e acessórios cheios de estilo", category: "Moda e Beleza", slug: "moda-e-beleza", emoji: "👗" },
    { id: "theme_saude", title: "💚 Cuide de você", subtitle: "Produtos para seu bem-estar e cuidados pessoais", category: "Saúde", slug: "saude", emoji: "💚" },
    { id: "theme_automotivo", title: "🚗 Cuidado com o veículo", subtitle: "Acessórios e produtos para seu carro ou moto", category: "Automotivo", slug: "automotivo", emoji: "🚗" },
    { id: "theme_pets", title: "🐾 Mimos pro seu pet", subtitle: "Tudo o que seu companheiro de quatro patas merece", category: "Pets", slug: "pets", emoji: "🐾" },
]

function matchThemeCategory(item: RawProduct, targetCategory: string): boolean {
    const rawCat: any = Array.isArray(item.marketplace_category)
        ? item.marketplace_category[0]
        : item.marketplace_category
    const catName = rawCat?.parent?.name || rawCat?.name || (item as any).category || ""
    const subName = rawCat?.parent ? rawCat?.name : (item as any).subcategoryName || ""

    const normalize = (s: string) => s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/&/g, "e")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()

    const normTarget = normalize(targetCategory)
    const normCat = normalize(catName)
    const normSub = normalize(subName)

    if (normCat === normTarget || normSub === normTarget) return true

    if (normCat && (normCat.includes(normTarget) || normTarget.includes(normCat))) {
        const diff = Math.abs(normCat.length - normTarget.length)
        if (diff <= 8) return true
    }
    if (normSub && (normSub.includes(normTarget) || normTarget.includes(normSub))) {
        const diff = Math.abs(normSub.length - normTarget.length)
        if (diff <= 8) return true
    }

    return false
}

async function fetchThemedSection(
    theme: ThemeDefinition,
    tiers: PartnerTiers,
    ctx: DiscoverCtx,
): Promise<HomeSection | null> {
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) return null

    const pool = await getSharedHomeProductsPool(allIds.join(","), allIds)
    if (pool.length === 0) return null

    const matching = pool.filter(item => matchThemeCategory(item, theme.category))
    if (matching.length === 0) return null

    const tagged = applyTierSort(matching, tiers, item => {
        const r = item as RawProduct
        return (r.views_last_30_days ?? 0) + (r.favorites_count ?? 0) * 2 + (r.sales_last_30_days ?? 0) * 5 + ((r as any).marketplace_score ?? 0)
    })

    const displayScope = determineDisplayScope(tagged, ctx)
    const scoped = filterByScope(tagged, displayScope)
    if (scoped.length === 0) return null

    const items = scoped.slice(0, 20).map(item => processProduct(item as RawProduct))

    return {
        id: theme.id,
        title: theme.title,
        subtitle: theme.subtitle,
        gatilho: GATILHOS_MAP[theme.id] || "desejo",
        items,
        _allItems: scoped.map(item => processProduct(item as RawProduct)),
        seeMoreLink: `/explorar/${ctx.citySlug}/${theme.slug}`,
    }
}

// ─── 11. 🧰 Serviços (com ou sem coordenadas) ───────────────────────────────

async function fetchServices(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP services reason=no_partners`)
        return null
    }

    const data = await getSharedHomeServicesPool(allIds.join(","), allIds)
    if (data.length === 0) {
        dLog(`[Discover] SKIP services reason=no_products`)
        return null
    }

    const tagged = (data as any[]).map(item => {
        const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
        const pid = rawPartner?.id
        const tier = pid && tiers.cityIds.has(pid) ? 0
            : pid && tiers.stateIds.has(pid) ? 1
                : 2
        return { ...item, _tier: tier }
    }).sort((a: any, b: any) => a._tier - b._tier || (b.rating ?? 0) - (a.rating ?? 0))

    const displayScope = determineDisplayScope(tagged, ctx)
    // Without coords, never show "próximos" (city-level implies proximity)
    const titleScope = !ctx.coords && displayScope === "city" ? "state" : displayScope
    const display = sectionDisplay("services", ctx, titleScope)

    const scoped = filterByScope(tagged, displayScope)
    if (scoped.length === 0) {
        dLog(`[Discover] SKIP services reason=no_items_in_scope`)
        return null
    }

    const serviceMapper = (item: any) => {
        const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
        const rawStore: any = Array.isArray(item.stores) ? item.stores[0] : item.stores
        const storeName = rawStore?.name || "Vendedor"
        const storeImage = rawStore?.logo_url
        const addr = Array.isArray(rawStore?.addresses) ? rawStore.addresses[0] : rawStore?.addresses
        const storeCity = addr?.city || rawStore?.city || null
        const storeState = addr?.state || rawStore?.state || null
        const storeSlug = rawStore?.slug || null
        const partner = rawPartner
            ? {
                id: rawPartner.id,
                store_id: rawStore?.id || rawPartner.id,
                short_id: rawStore?.short_id || null,
                slug: storeSlug,
                store_name: storeName,
                store_image_url: storeImage,
                store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
                latitude: addr?.latitude ?? null,
                longitude: addr?.longitude ?? null,
                city: storeCity,
                state: storeState,
                neighborhood: addr?.neighborhood ?? null,
            }
            : null

        const rawCategory: any = Array.isArray(item.marketplace_category)
            ? item.marketplace_category[0]
            : item.marketplace_category
        const categoryName = rawCategory?.parent?.name || rawCategory?.name || null
        const subcategoryName = rawCategory?.parent ? rawCategory?.name : null

        return {
            id: item.id,
            short_id: item.short_id || null,
            name: item.name,
            price: Number(item.price || 0),
            images: item.images || [],
            rating: item.rating,
            category: categoryName,
            subcategoryName,
            partners: partner,
            itemType: "servico" as const,
        }
    }

    const items = scoped.slice(0, 20).map(serviceMapper)

    return {
        id: "services",
        title: display.title,
        subtitle: display.subtitle,
        gatilho: GATILHOS_MAP.services,
        items,
        _allItems: scoped.map(serviceMapper),
        seeMoreLink: `/explorar/${ctx.citySlug}?type=servicos`,
    }
}

// ─── 12. 🛍️ Vitrines (Lojas e Negócios Locais) ───────────────────────────────

async function fetchVitrines(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP topVitrines reason=no_partners`)
        return null
    }

    const data = await getSharedHomeStoresPool(allIds.join(","), allIds)

    if (!data || data.length === 0) {
        dLog(`[Discover] SKIP topVitrines reason=no_data`)
        return null
    }

    const tagged = data.map((s: Record<string, any>) => {
        const pid = s.partner_id
        const p = Array.isArray(s.partners) ? s.partners[0] : s.partners
        const tier = pid && tiers.cityIds.has(pid) ? 0
            : pid && tiers.stateIds.has(pid) ? 1
                : 2
        return { ...s, partners: p, _tier: tier }
    }).sort((a: any, b: any) => {
        const tierDiff = a._tier - b._tier
        if (tierDiff !== 0) return tierDiff
        const aInactive = a.is_showcase_active === false ? 1 : 0
        const bInactive = b.is_showcase_active === false ? 1 : 0
        if (aInactive !== bInactive) return aInactive - bInactive
        return (b.rating ?? 0) - (a.rating ?? 0)
    })

    const displayScope = determineDisplayScope(tagged, ctx)
    const display = sectionDisplay("topVitrines", ctx, displayScope)

    const scoped = filterByScope(tagged, displayScope)
    if (scoped.length === 0) {
        dLog(`[Discover] SKIP topVitrines reason=no_items_in_scope`)
        return null
    }

    const vitrineMapper = (store: any) => {
        const p = store.partners
        const addr = Array.isArray(store.addresses) ? store.addresses[0] : store.addresses
        const storeName = store.name || p?.store_name || "Vendedor"
        const storeImage = store.logo_url || p?.store_image_url
        const categoryName = p?.category?.parent?.name || p?.category?.name || null
        const reviewsCount = p?.reviews?.[0]?.count || 0
        return {
            id: store.id,
            short_id: store.short_id || null,
            slug: store.slug || null,
            name: storeName,
            store_name: storeName,
            store_image_url: storeImage,
            banner_url: store.banner_url || null,
            images: storeImage ? [storeImage] : [],
            rating: store.rating,
            reviewsCount,
            category: categoryName,
            partners: {
                id: store.id,
                store_id: store.id,
                short_id: store.short_id || null,
                slug: store.slug || null,
                store_name: storeName,
                store_image_url: storeImage,
                banner_url: store.banner_url || null,
                store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
                latitude: addr?.latitude || null,
                longitude: addr?.longitude || null,
                city: addr?.city || "",
                state: addr?.state || "",
                neighborhood: addr?.neighborhood || null,
            },
            itemType: "vitrine" as const,
        }
    }

    const items = scoped.slice(0, 15).map(vitrineMapper)

    return {
        id: "topVitrines",
        title: display.title,
        subtitle: display.subtitle,
        gatilho: GATILHOS_MAP.topVitrines,
        items,
        _allItems: scoped.map(vitrineMapper),
        seeMoreLink: `/explorar/${ctx.citySlug}?type=vitrines`,
    }
}

// ─── 13. Último recurso: qualquer produto (sem ranking) ──────────────────────

async function fetchAllProducts(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP allProducts reason=no_partners`)
        return null
    }

    const pool = await getSharedHomeProductsPool(allIds.join(","), allIds)
    if (pool.length === 0) {
        dLog(`[Discover] SKIP allProducts reason=no_products`)
        return null
    }

    const tagged = applyTierSort(pool, tiers, item => {
        const r = item as RawProduct
        return r.created_at ? new Date(r.created_at).getTime() : 0
    })

    const displayScope = determineDisplayScope(tagged, ctx)
    const isCountry = displayScope === "country"
    const title = isCountry ? "Produtos na Dudit" : "Produtos disponíveis"
    const subtitle = isCountry ? "Variedade para você" : "Variedade para você"

    const scoped = filterByScope(tagged, displayScope)
    if (scoped.length === 0) {
        dLog(`[Discover] SKIP allProducts reason=no_items_in_scope`)
        return null
    }

    const items = scoped.slice(0, 20).map(item => processProduct(item as RawProduct))

    return {
        id: "allProducts",
        title,
        subtitle,
        gatilho: "variedade",
        items,
        _allItems: scoped.map(item => processProduct(item as RawProduct)),
        seeMoreLink: `/explorar/${ctx.citySlug}?type=produtos`,
    }
}

// ─── MAIN ENTRY POINT (Dinâmico, Balanceado & Alta Performance) ───────────────

async function getHomeSectionsUncached(ctx: DiscoverCtx): Promise<HomeSection[]> {
    const t0 = performance.now()
    dLog(`[Discover] START | scope=${ctx.scope} city=${ctx.city} state=${ctx.state} user=${ctx.userId ? "logged" : "anon"}`)

    const tiers = await getPartnerIdsByTier(ctx.city, ctx.state, ctx.stateOnly)

    if (tiers.allIds.size === 0) {
        dWarn(`[Discover] No partners found anywhere in Brazil`)
        return []
    }

    // 1. Core anchors in parallel
    const [trendingRes, vitrinesRes, servicesRes] = await Promise.all([
        fetchTrending(tiers, ctx).catch(() => null),
        fetchVitrines(tiers, ctx).catch(() => null),
        fetchServices(tiers, ctx).catch(() => null),
    ])

    // 2. Consolidated Launch Section Layout: Produtos, Serviços, Vitrines
    const pool: HomeSection[] = []
    const usedIds = new Set<string>()

    const addSection = (section: HomeSection | null) => {
        if (!section || section.items.length === 0 || usedIds.has(section.id)) return false
        pool.push(section)
        usedIds.add(section.id)
        return true
    }

    // Slot 1: Produtos
    if (trendingRes && trendingRes.items.length > 0) {
        addSection(trendingRes)
    } else {
        const fallback = await fetchAllProducts(tiers, ctx).catch(() => null)
        if (fallback && fallback.items.length > 0) {
            fallback.seeMoreLink = `/explorar/${ctx.citySlug}?type=produtos`
            addSection(fallback)
        }
    }

    // Slot 2: Serviços
    if (servicesRes && servicesRes.items.length > 0) {
        addSection(servicesRes)
    }

    // Slot 3: Vitrines / Lojas
    if (vitrinesRes && vitrinesRes.items.length > 0) {
        addSection(vitrinesRes)
    }

    // Ultimate fallback if still completely empty
    if (pool.length === 0) {
        const fallback = await fetchAllProducts(tiers, ctx).catch(() => null)
        if (fallback) {
            fallback.seeMoreLink = `/explorar/${ctx.citySlug}?type=produtos`
            addSection(fallback)
        }
    }

    // 3. Global dedup with auto-refill across all sections
    const globalSeen = new Set<string>()
    let totalRemovedByDedup = 0
    const finalSections: HomeSection[] = []

    for (const section of pool) {
        const beforeCount = section.items.length
        const deduped = section.items.filter((item: any) => {
            const key = `${item.itemType || "item"}-${item.id}`
            if (globalSeen.has(key)) return false
            globalSeen.add(key)
            return true
        })

        const removedCount = beforeCount - deduped.length

        // Auto-refill from _allItems buffer
        let refilled = 0
        if (removedCount > 0 && section._allItems) {
            const remaining = section._allItems.filter((item: any) => {
                const key = `${item.itemType || "item"}-${item.id}`
                return !globalSeen.has(key)
            })
            const refillCount = Math.min(20 - deduped.length, remaining.length)
            for (let i = 0; i < refillCount; i++) {
                const refillItem = remaining[i]
                const key = `${refillItem.itemType || "item"}-${refillItem.id}`
                globalSeen.add(key)
                deduped.push(refillItem)
                refilled++
            }
            totalRemovedByDedup += removedCount
        }

        if (removedCount > 0) {
            dLog(`[Discover] DEDUP ${section.id}: before=${beforeCount} removed=${removedCount} refilled=${refilled} after=${deduped.length}`)
        }

        if (deduped.length >= 1) {
            finalSections.push({ ...section, items: deduped.slice(0, 20) })
        } else {
            dLog(`[Discover] DEDUP would kill section "${section.id}" - keeping it anyway`)
            finalSections.push(section)
        }
    }

    const result = finalSections.slice(0, 6)

    // Apply urgency badges
    applyUrgencyBadges(result, ctx)

    // Batch fetch promotions for partners in result
    const partnerIds = new Set<string>()
    for (const section of result) {
        for (const item of section.items) {
            const pid = getPartnerId(item)
            if (pid) partnerIds.add(pid)
        }
    }
    if (partnerIds.size > 0) {
        const { listActivePromotionsForPartnersAction } = await import("@/app/actions/shared/promotions")
        const promoMap = await listActivePromotionsForPartnersAction([...partnerIds])
        for (const section of result) {
            for (const item of section.items) {
                const pid = getPartnerId(item)
                if (pid && promoMap.has(pid)) {
                    ; (item as any)._promotions = promoMap.get(pid)
                }
            }
        }
    }

    const t1 = performance.now()
    dLog(`[Discover] END | ${result.length} sections | ${(t1 - t0).toFixed(0)}ms`)
    return result
}

function serializePartnerIds(ids: Set<string>): string {
    return JSON.stringify([...ids].sort())
}

function parsePartnerIds(value: string): Set<string> {
    try {
        const parsed = JSON.parse(value)
        return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [])
    } catch {
        return new Set()
    }
}

/**
 * Request-scoped deduplication for the private recommendation block.
 * Never use unstable_cache here: favorites and purchase signals are user data.
 */
const getPersonalizedByStableKey = cache(async (
    userId: string,
    city: string,
    state: string,
    stateOnly: boolean,
    citySlug: string,
    lat: number | null,
    lng: number | null,
    scope: DiscoverCtx["scope"],
    cityIdsKey: string,
    stateIdsKey: string,
    allIdsKey: string,
): Promise<HomeSection | null> => {
    return fetchPersonalizedUncached(
        {
            cityIds: parsePartnerIds(cityIdsKey),
            stateIds: parsePartnerIds(stateIdsKey),
            allIds: parsePartnerIds(allIdsKey),
        },
        {
            city,
            state,
            stateOnly,
            citySlug,
            coords: lat != null && lng != null ? { lat, lng } : null,
            userId: userId || null,
            scope,
        },
    )
})

function fetchPersonalized(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    return getPersonalizedByStableKey(
        ctx.userId ?? "",
        ctx.city,
        ctx.state,
        ctx.stateOnly,
        ctx.citySlug,
        ctx.coords?.lat ?? null,
        ctx.coords?.lng ?? null,
        ctx.scope,
        serializePartnerIds(tiers.cityIds),
        serializePartnerIds(tiers.stateIds),
        serializePartnerIds(tiers.allIds),
    )
}

const getSharedHomeSections = (
    scope: string,
    citySlug: string,
    stateOnly: boolean,
    lat: string,
    lng: string,
    ctx: DiscoverCtx,
) => unstable_cache(
    async () => getHomeSectionsUncached({ ...ctx, userId: null }),
    [`discover:home:shared:${scope}:${citySlug}:${stateOnly ? "state" : "city"}:${lat}:${lng}`],
    {
        revalidate: 300, // Cache for 5 minutes (was 60s)
        tags: [TAGS.marketplace, TAGS.products(), "services", "campaigns", TAGS.advertisements],
    }
)

export async function getHomeSections(ctx: DiscoverCtx): Promise<HomeSection[]> {
    const lat = ctx.coords?.lat != null ? ctx.coords.lat.toFixed(2) : "na"
    const lng = ctx.coords?.lng != null ? ctx.coords.lng.toFixed(2) : "na"

    const shared = await getSharedHomeSections(
        ctx.scope,
        ctx.citySlug,
        ctx.stateOnly,
        lat,
        lng,
        ctx
    )()

    const sections = [...shared]

    // Enriquecer distância em todas as seções quando temos coordenadas do usuário
    // (custo baixo: cálculo puro de haversine com lat/lng já selecionados)
    if (ctx.coords) {
        for (const section of sections) {
            if (section.items && section.items.length > 0) {
                section.items = enrichMarketplaceDistance(section.items, ctx.coords)
            }
        }
    }

    if (ctx.userId) {
        const tiers = await getPartnerIdsByTier(ctx.city, ctx.state, ctx.stateOnly)
        if (tiers.allIds.size > 0) {
            const persResult = await fetchPersonalized(tiers, ctx)
            if (persResult) {
                if (sections.length >= 6) {
                    sections[5] = persResult
                } else {
                    sections.push(persResult)
                }
            }
        }
    }

    return sections
}
