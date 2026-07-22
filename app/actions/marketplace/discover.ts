import "server-only"

import { cache } from "react"
import { unstable_cache } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { calculateDistance } from "@/lib/services/location.service"
import { filterMarketplaceVisibleProducts, filterMarketplaceVisibleServices } from "@/lib/resolve-marketplace-visibility"

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
    views_last_30_days?: number
    sales_last_7_days?: number
    sales_last_30_days?: number
    favorites_count?: number
    condition?: string
    created_at?: string
    partners?: any
    stores?: any
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
            country: ["Bombando na Dudit", "Os produtos mais quentes do momento"],
            state: [`Bombando no ${stateName}`, `Os produtos mais quentes no ${stateName}`],
            city: [`Bombando em ${cityName}`, `Os produtos mais quentes em ${cityName}`],
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
            country: ["Serviços em destaque", "Profissionais e serviços para você"],
            state: ["Serviços em destaque", "Profissionais e serviços para você"],
            city: ["Serviços próximos", "Profissionais e serviços perto de você"],
        },
        topVitrines: {
            country: ["Vitrines em destaque", "Lojas para você conhecer"],
            state: [`Vitrines do ${stateName}`, `Lojas do ${stateName} para você conhecer`],
            city: ["Negócios e profissionais por perto", "Descubra o que está por perto"],
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

        const { data: partners, error } = await supabase
            .from("partners")
            .select("id, addresses!inner(city, state)")
            .eq("is_active", true)

        if (error) {
            dError(`[DISCOVER][PARTNER_IDS] Error:`, error, `city=${city} state=${state}`)
            return { cityIds: [], stateIds: [], allIds: [] }
        }

        if (!partners || partners.length === 0) {
            dWarn("[DISCOVER][PARTNER_IDS] No active partners found in Brazil")
            return { cityIds: [], stateIds: [], allIds: [] }
        }

        const allIds = new Set<string>()
        const stateIds = new Set<string>()
        let statePartnerCount = 0
        const targetState = state.toLowerCase()

        for (const p of partners) {
            allIds.add(p.id)
            const addr = p.addresses?.[0] || p.addresses
            if (addr?.state?.toLowerCase() === targetState) {
                stateIds.add(p.id)
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
            for (const p of partners) {
                const addr = p.addresses?.[0] || p.addresses
                if (addr?.city && normalizeCitySlug(addr.city) === targetCitySlug) {
                    cityIds.add(p.id)
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

const BASE_FIELDS = `id, name, price, promotional_price, images, rating`
const STATS_FIELDS = `views_last_30_days, sales_last_7_days, sales_last_30_days, favorites_count`

const PARTNER_JOIN = `partners!inner(
    id, store_name, store_image_url, latitude, longitude, is_showcase_active,
    addresses!inner(city, state)
),
stores!inner(
    id, name, description, logo_url, image_url, banner_url,
    phone, city, state, is_showcase_active
)`

// ─── Process product into ItemCard shape ────────────────────────────────────

function processProduct(item: RawProduct, extra?: Record<string, any>) {
    const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
    const rawStore: any = Array.isArray(item.stores) ? item.stores[0] : item.stores
    const storeName = rawStore?.name || rawPartner?.store_name || "Vendedor"
    const storeImage = rawStore?.logo_url || rawStore?.image_url || rawPartner?.store_image_url
    const storeCity = rawStore?.city || rawPartner?.city || rawPartner?.addresses?.[0]?.city || null
    const storeState = rawStore?.state || rawPartner?.state || rawPartner?.addresses?.[0]?.state || null
    const partner = rawPartner
        ? {
            id: rawPartner.id,
            store_name: storeName,
            store_image_url: storeImage,
            store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
            latitude: rawPartner.latitude,
            longitude: rawPartner.longitude,
            city: storeCity,
            state: storeState,
        }
        : null

    return {
        id: item.id,
        name: item.name,
        price: Number(item.promotional_price || item.price || 0),
        originalPrice: item.promotional_price ? Number(item.price) : undefined,
        images: item.images || [],
        rating: item.rating,
        partners: partner,
        itemType: "produto" as const,
        created_at: item.created_at,
        _views: item.views_last_30_days ?? 0,
        _salesWeek: item.sales_last_7_days ?? 0,
        _sales: item.sales_last_30_days ?? 0,
        _favs: item.favorites_count ?? 0,
        ...extra,
    }
}

// ─── SECTION FETCHERS ───────────────────────────────────────────────────────

// ─── 1. 🔥 Bombando na sua região ───────────────────────────────────────────

async function fetchTrending(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP trending reason=no_partners`)
        return null
    }

    let { data: trendingData, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, ${STATS_FIELDS}, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .limit(60)

    if (error) {
        dError(`[DISCOVER][TRENDING] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        dLog(`[Discover] SKIP trending reason=error`)
        return null
    }

    if (trendingData && trendingData.length > 0) {
      const visibleIds = await filterMarketplaceVisibleProducts(trendingData.map((p: any) => p.id))
      const filtered = trendingData.filter((p: any) => visibleIds.has(p.id))
      trendingData = filtered as any
    }

    if (!trendingData || trendingData.length === 0) {
        dLog(`[Discover] SKIP trending reason=no_products`)
        return null
    }

    const tagged = applyTierSort(trendingData as RawProduct[], tiers, item => {
        const r = item as RawProduct
        return (r.views_last_30_days ?? 0) + (r.favorites_count ?? 0) * 2 + (r.sales_last_30_days ?? 0) * 5
    })

    // Only items with real engagement signals
    const withSignals = tagged.filter(item => {
        const r = item as RawProduct
        return (r.views_last_30_days ?? 0) > 0
            || (r.favorites_count ?? 0) > 0
            || (r.sales_last_30_days ?? 0) > 0
    })

    if (withSignals.length === 0) {
        dLog(`[Discover] SKIP trending reason=no_signals`)
        return null
    }

    const displayScope = determineDisplayScope(withSignals, ctx)
    const display = sectionDisplay("trending", ctx, displayScope)

    const scoped = filterByScope(withSignals, displayScope)
    if (scoped.length === 0) {
        dLog(`[Discover] SKIP trending reason=no_items_in_scope`)
        return null
    }

    const items = scoped.slice(0, 20).map(item => {
        const raw = item as RawProduct
        const proof: string[] = []
        if ((raw.views_last_30_days ?? 0) >= 10) proof.push(`${raw.views_last_30_days} visualizações`)
        if ((raw.sales_last_30_days ?? 0) > 0) proof.push(`${raw.sales_last_30_days} vendidos no mês`)
        if ((raw.favorites_count ?? 0) > 0) proof.push(`${raw.favorites_count} favoritaram`)
        return processProduct(raw, { _socialProof: proof.join(" • ") })
    })

    return {
        id: "trending",
        title: display.title,
        subtitle: display.subtitle,
        gatilho: GATILHOS_MAP.trending,
        items,
        _allItems: scoped.map(item => processProduct(item as RawProduct)),
        seeMoreLink: `/explorar/${ctx.citySlug}?section=trending`,
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

    if (products && products.length > 0) {
      const visibleIds = await filterMarketplaceVisibleProducts(products.map((p: any) => p.id))
      const filtered = products.filter((p: any) => visibleIds.has(p.id))
      products = filtered as any
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

    let { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .not("partners.latitude", "is", null)
        .not("partners.longitude", "is", null)
        .limit(60)

    if (error) {
        dError(`[DISCOVER][NEARBY] Error:`, error)
        dLog(`[Discover] SKIP nearby reason=error`)
        return null
    }

    if (data && data.length > 0) {
      const visibleIds = await filterMarketplaceVisibleProducts(data.map((p: any) => p.id))
      const filtered = data.filter((p: any) => visibleIds.has(p.id))
      data = filtered as any
    }

    if (!data || data.length === 0) {
        dLog(`[Discover] SKIP nearby reason=no_products`)
        return null
    }

    const withDistance = (data as RawProduct[]).map(item => {
        const partner = Array.isArray(item.partners) ? item.partners[0] : item.partners
        let distKm = Infinity
        if (partner?.latitude && partner?.longitude) {
            distKm = calculateDistance(ctx.coords!, { lat: partner.latitude, lng: partner.longitude })
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
        let distText = ""
        if (dist < 1) distText = `A ${Math.round(dist * 1000)}m`
        else if (dist <= 10) distText = `A ${dist.toFixed(1)} km`
        else distText = `A ${Math.round(dist)} km`

        const p = processProduct(item, { _distanceText: distText })
        if (p.partners) {
            (p.partners as Record<string, any>).distance_km = dist
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
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP recent reason=no_partners`)
        return null
    }

    const [prodResult, servResult] = await Promise.all([
        supabase
            .from("products")
            .select(`${BASE_FIELDS}, created_at, ${PARTNER_JOIN}`)
            .eq("is_active", true)
            .eq("show_in_marketplace", true)
            .in("partner_id", allIds)
            .order("created_at", { ascending: false })
            .limit(60),
        supabase
            .from("services")
            .select(`id, name, price, images, rating, created_at, ${PARTNER_JOIN}`)
            .eq("is_active", true)
            .eq("show_in_marketplace", true)
            .in("partner_id", allIds)
            .order("created_at", { ascending: false })
            .limit(30),
    ])

    if (prodResult.error) {
        dError(`[DISCOVER][RECENT] Products Error:`, prodResult.error, `city=${ctx.city} state=${ctx.state}`)
    }
    if (servResult.error) {
        dError(`[DISCOVER][RECENT] Services Error:`, servResult.error, `city=${ctx.city} state=${ctx.state}`)
    }

    if (prodResult.data && prodResult.data.length > 0) {
      const visibleIds = await filterMarketplaceVisibleProducts(prodResult.data.map((p: any) => p.id))
      prodResult.data = prodResult.data.filter((p: any) => visibleIds.has(p.id))
    }
    if (servResult.data && servResult.data.length > 0) {
      const visibleIds = await filterMarketplaceVisibleServices(servResult.data.map((s: any) => s.id))
      servResult.data = servResult.data.filter((s: any) => visibleIds.has(s.id))
    }

    const products = (prodResult.data || []) as RawProduct[]
    const services = (servResult.data || []) as any[]

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
            const storeName = rawStore?.name || rawPartner?.store_name || "Vendedor"
            const storeImage = rawStore?.logo_url || rawStore?.image_url || rawPartner?.store_image_url
            const storeCity = rawStore?.city || rawPartner?.city || rawPartner?.addresses?.[0]?.city || null
            const storeState = rawStore?.state || rawPartner?.state || rawPartner?.addresses?.[0]?.state || null
            const partner = rawPartner ? {
                id: rawPartner.id,
                store_name: storeName,
                store_image_url: storeImage,
                store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
                latitude: rawPartner.latitude,
                longitude: rawPartner.longitude,
                city: storeCity,
                state: storeState,
            } : null
            return {
                id: item.id,
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

    let { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, ${STATS_FIELDS}, condition, created_at, category_id, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .limit(80)

    if (error) {
        dError(`[DISCOVER][GEMS] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        dLog(`[Discover] SKIP gems reason=error`)
        return null
    }

    if (data && data.length > 0) {
      const visibleIds = await filterMarketplaceVisibleProducts(data.map((p: any) => p.id))
      const filtered = data.filter((p: any) => visibleIds.has(p.id))
      data = filtered as any
    }

    if (!data || data.length === 0) {
        dLog(`[Discover] SKIP gems reason=no_products`)
        return null
    }

    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        const r = item as RawProduct
        const hasPromo = r.promotional_price && Number(r.promotional_price) < Number(r.price)
        const discountPct = hasPromo
            ? ((Number(r.price) - Number(r.promotional_price)) / Number(r.price)) * 100
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
        const hasPromo = raw.promotional_price && Number(raw.promotional_price) < Number(raw.price)
        const discountPct = hasPromo
            ? ((Number(raw.price) - Number(raw.promotional_price)) / Number(raw.price)) * 100
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

async function fetchPersonalized(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
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

    const [favRes, orderRes] = await Promise.all([
        supabase.from("favorites").select("item_id", { count: "exact", head: true })
            .eq("user_id", ctx.userId).eq("item_type", "produto").limit(1),
        supabase.from("orders").select("id", { count: "exact", head: true })
            .eq("buyer_id", ctx.userId).limit(1),
    ])

    const hasFavs = (favRes.count ?? 0) > 0
    const hasOrders = (orderRes.count ?? 0) > 0
    if (!hasFavs && !hasOrders) {
        dLog(`[Discover] SKIP personalized reason=no_signals`)
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
              const visibleIds = await filterMarketplaceVisibleProducts(favProductIds)
              const filtered = favProducts.filter((_: any, i: number) => visibleIds.has(favProductIds[i]))
              const counts = new Map<string, number>()
              for (const p of filtered) {
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
        dLog(`[Discover] SKIP personalized reason=no_preferred_categories → fallback to popular`)
        return fetchPopular(tiers, ctx)
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

    if (data && data.length > 0) {
      const visibleIds = await filterMarketplaceVisibleProducts(data.map((p: any) => p.id))
      const filtered = data.filter((p: any) => visibleIds.has(p.id))
      data = filtered as any
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
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP bestSellers reason=no_partners`)
        return null
    }

    let { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, sales_last_30_days, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .gt("sales_last_30_days", 0)
        .in("partner_id", allIds)
        .order("sales_last_30_days", { ascending: false, nulls: "last" })
        .limit(60)

    if (error) {
        dError(`[DISCOVER][BEST_SELLERS] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        dLog(`[Discover] SKIP bestSellers reason=error`)
        return null
    }

    if (data && data.length > 0) {
      const visibleIds = await filterMarketplaceVisibleProducts(data.map((p: any) => p.id))
      const filtered = data.filter((p: any) => visibleIds.has(p.id))
      data = filtered as any
    }

    if (!data || data.length === 0) {
        dLog(`[Discover] SKIP bestSellers reason=no_products`)
        return null
    }

    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        return (item as RawProduct).sales_last_30_days ?? 0
    })

    const displayScope = determineDisplayScope(tagged, ctx)
    const display = sectionDisplay("bestSellers", ctx, displayScope)

    const scoped = filterByScope(tagged, displayScope)
    if (scoped.length === 0) {
        dLog(`[Discover] SKIP bestSellers reason=no_items_in_scope`)
        return null
    }

    const items = scoped.slice(0, 20).map(item => {
        const raw = item as RawProduct
        return processProduct(raw, {
            _socialProof: (raw.sales_last_30_days ?? 0) > 0
                ? `${raw.sales_last_30_days} vendidos no último mês`
                : undefined,
        })
    })

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
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP topRated reason=no_partners`)
        return null
    }

    let { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .gt("rating", 0)
        .in("partner_id", allIds)
        .order("rating", { ascending: false, nulls: "last" })
        .limit(60)

    if (error) {
        dError(`[DISCOVER][TOP_RATED] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        dLog(`[Discover] SKIP topRated reason=error`)
        return null
    }

    if (data && data.length > 0) {
      const visibleIds = await filterMarketplaceVisibleProducts(data.map((p: any) => p.id))
      const filtered = data.filter((p: any) => visibleIds.has(p.id))
      data = filtered as any
    }

    if (!data || data.length === 0) {
        dLog(`[Discover] SKIP topRated reason=no_products`)
        return null
    }

    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
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
        return processProduct(raw, {
            _badgeLabel: (raw.rating ?? 0) >= 4.5 ? "★★★" : "★",
            _badgeVariant: "blue",
        })
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
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP promos reason=no_partners`)
        return null
    }

    let { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .not("promotional_price", "is", null)
        .limit(80)

    if (error) {
        dError(`[DISCOVER][PROMOS] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        dLog(`[Discover] SKIP promos reason=error`)
        return null
    }

    if (data && data.length > 0) {
      const visibleIds = await filterMarketplaceVisibleProducts(data.map((p: any) => p.id))
      const filtered = data.filter((p: any) => visibleIds.has(p.id))
      data = filtered as any
    }

    const discounted = (data || []).filter(
        (item: any) => item.promotional_price && Number(item.promotional_price) < Number(item.price),
    )

    if (discounted.length === 0) {
        dLog(`[Discover] SKIP promos reason=no_discounts`)
        return null
    }

    const tagged = applyTierSort(discounted as RawProduct[], tiers, item => {
        const r = item as RawProduct
        if (!r.promotional_price || !r.price) return 0
        return ((Number(r.price) - Number(r.promotional_price)) / Number(r.price)) * 100
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
        const discountPct = Math.round(
            ((Number(raw.price) - Number(raw.promotional_price)) / Number(raw.price)) * 100,
        )
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

// ─── 10. 💬 Mais visualizados ────────────────────────────────────────────────

async function fetchMostViewed(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP mostViewed reason=no_partners`)
        return null
    }

    let { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, views_last_30_days, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .order("views_last_30_days", { ascending: false, nulls: "last" })
        .limit(60)

    if (error) {
        dError(`[DISCOVER][MOST_VIEWED] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        dLog(`[Discover] SKIP mostViewed reason=error`)
        return null
    }

    if (data && data.length > 0) {
      const visibleIds = await filterMarketplaceVisibleProducts(data.map((p: any) => p.id))
      const filtered = data.filter((p: any) => visibleIds.has(p.id))
      data = filtered as any
    }

    if (!data || data.length === 0) {
        dLog(`[Discover] SKIP mostViewed reason=no_products`)
        return null
    }

    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        return (item as RawProduct).views_last_30_days ?? 0
    })

    const displayScope = determineDisplayScope(tagged, ctx)
    const display = sectionDisplay("mostViewed", ctx, displayScope)

    const scoped = filterByScope(tagged, displayScope)
    if (scoped.length === 0) {
        dLog(`[Discover] SKIP mostViewed reason=no_items_in_scope`)
        return null
    }

    const items = scoped.slice(0, 20).map(item => {
        const raw = item as RawProduct
        return processProduct(raw, {
            _socialProof: (raw.views_last_30_days ?? 0) > 0
                ? `${raw.views_last_30_days} visualizações nos últimos 30 dias`
                : undefined,
        })
    })

    return {
        id: "mostViewed",
        title: display.title,
        subtitle: display.subtitle,
        gatilho: GATILHOS_MAP.mostViewed,
        items,
        _allItems: scoped.map(item => processProduct(item as RawProduct)),
        seeMoreLink: `/explorar/${ctx.citySlug}?section=most-viewed`,
    }
}

// ─── 11. 🧰 Serviços (com ou sem coordenadas) ───────────────────────────────

async function fetchServices(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP services reason=no_partners`)
        return null
    }

    let { data, error } = await supabase
        .from("services")
        .select(`id, name, price, images, rating, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .order("rating", { ascending: false, nulls: "last" })
        .limit(60)

    if (error) {
        dError(`[DISCOVER][SERVICES] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        dLog(`[Discover] SKIP services reason=error`)
        return null
    }

    if (data && data.length > 0) {
      const visibleIds = await filterMarketplaceVisibleServices(data.map((s: any) => s.id))
      const filtered = data.filter((s: any) => visibleIds.has(s.id))
      data = filtered as any
    }

    if (!data || data.length === 0) {
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
        const storeName = rawStore?.name || rawPartner?.store_name || "Vendedor"
        const storeImage = rawStore?.logo_url || rawStore?.image_url || rawPartner?.store_image_url
        const storeCity = rawStore?.city || rawPartner?.city || rawPartner?.addresses?.[0]?.city || null
        const storeState = rawStore?.state || rawPartner?.state || rawPartner?.addresses?.[0]?.state || null
        const partner = rawPartner
            ? {
                id: rawPartner.id,
                store_name: storeName,
                store_image_url: storeImage,
                store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
                latitude: rawPartner.latitude,
                longitude: rawPartner.longitude,
                city: storeCity,
                state: storeState,
            }
            : null

        return {
            id: item.id,
            name: item.name,
            price: Number(item.price || 0),
            images: item.images || [],
            rating: item.rating,
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

// ─── 12. 🛍️ Vitrines (sempre obrigatória se houver parceiros) ─────────────

async function fetchVitrines(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP topVitrines reason=no_partners`)
        return null
    }

    let { data, error } = await supabase
        .from("partners")
        .select(`id, store_name, store_image_url, banner_url, rating, latitude, longitude, is_showcase_active, addresses!inner(city, state)`)
        .eq("is_active", true)
        .in("id", allIds)
        .order("rating", { ascending: false, nulls: "last" })
        .limit(30)

    if (error) {
        dError(`[DISCOVER][VITRINES] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        dLog(`[Discover] SKIP topVitrines reason=error`)
        return null
    }

    if (!data || data.length === 0) {
        dLog(`[Discover] SKIP topVitrines reason=no_partners_data`)
        return null
    }

    const tagged = data.map((p: Record<string, any>) => {
        const pid = p.id
        const tier = pid && tiers.cityIds.has(pid) ? 0
            : pid && tiers.stateIds.has(pid) ? 1
                : 2
        return { ...p, _tier: tier }
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

    const vitrineMapper = (partner: any) => {
        const addr = Array.isArray(partner.addresses) ? partner.addresses[0] : partner.addresses
        return {
            id: partner.id,
            name: partner.store_name,
            store_name: partner.store_name,
            store_image_url: partner.store_image_url,
            banner_url: partner.banner_url || null,
            images: partner.store_image_url ? [partner.store_image_url] : [],
            rating: partner.rating,
            reviewsCount: 0,
            partners: {
                id: partner.id,
                store_name: partner.store_name,
                store_image_url: partner.store_image_url,
                banner_url: partner.banner_url || null,
                store_avatar: partner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
                latitude: partner.latitude,
                longitude: partner.longitude,
                city: addr?.city || "",
                state: addr?.state || "",
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
        seeMoreLink: `/explorar/${ctx.citySlug}?section=vendors`,
    }
}

// ─── 13a. Produtos populares (fallback) ─────────────────────────────────────

async function fetchPopular(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP popular reason=no_partners`)
        return null
    }

    let { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, marketplace_score, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .order("marketplace_score", { ascending: false, nulls: "last" })
        .limit(60)

    if (error) {
        dError(`[DISCOVER][POPULAR] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        dLog(`[Discover] SKIP popular reason=error`)
        return null
    }

    if (data && data.length > 0) {
      const visibleIds = await filterMarketplaceVisibleProducts(data.map((p: any) => p.id))
      const filtered = data.filter((p: any) => visibleIds.has(p.id))
      data = filtered as any
    }

    if (!data || data.length === 0) {
        dLog(`[Discover] SKIP popular reason=no_products`)
        return null
    }

    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        return (item as any).marketplace_score ?? 0
    })

    const displayScope = determineDisplayScope(tagged, ctx)
    const display = sectionDisplay("popular", ctx, displayScope)

    const scoped = filterByScope(tagged, displayScope)
    if (scoped.length === 0) {
        dLog(`[Discover] SKIP popular reason=no_items_in_scope`)
        return null
    }

    const items = scoped.slice(0, 20).map(item => processProduct(item as RawProduct))

    return {
        id: "popular",
        title: display.title,
        subtitle: display.subtitle,
        gatilho: GATILHOS_MAP.popular,
        items,
        _allItems: scoped.map(item => processProduct(item as RawProduct)),
        seeMoreLink: `/explorar/${ctx.citySlug}?section=popular`,
    }
}

// ─── 13b. Último recurso: qualquer produto (sem ranking) ──────────────────────

async function fetchAllProducts(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) {
        dLog(`[Discover] SKIP allProducts reason=no_partners`)
        return null
    }

    let { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, created_at, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .limit(60)

    if (error) {
        dError(`[DISCOVER][ALL_PRODUCTS] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        dLog(`[Discover] SKIP allProducts reason=error`)
        return null
    }

    if (data && data.length > 0) {
      const visibleIds = await filterMarketplaceVisibleProducts(data.map((p: any) => p.id))
      const filtered = data.filter((p: any) => visibleIds.has(p.id))
      data = filtered as any
    }

    if (!data || data.length === 0) {
        dLog(`[Discover] SKIP allProducts reason=no_products`)
        return null
    }

    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        const r = item as RawProduct
        return r.created_at ? new Date(r.created_at).getTime() : 0
    })

    const displayScope = determineDisplayScope(tagged, ctx)
    const isCountry = displayScope === "country"
    const title = isCountry ? "📦 Produtos na Dudit" : "📦 Produtos disponíveis"
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
        seeMoreLink: `/explorar/${ctx.citySlug}`,
    }
}

// ─── SECTION DEFINITIONS ──────────────────────────────────────────────────────

interface SectionDef {
    id: string
    gatilho: string
    priority: "high" | "medium" | "fallback"
    fetch: (tiers: PartnerTiers, ctx: DiscoverCtx) => Promise<HomeSection | null>
}

const HIGH_SECTIONS: SectionDef[] = [
    { id: "trending", gatilho: GATILHOS_MAP.trending, priority: "high", fetch: fetchTrending },
    { id: "endingSoon", gatilho: GATILHOS_MAP.endingSoon, priority: "high", fetch: fetchEndingSoon },
    { id: "recent", gatilho: GATILHOS_MAP.recent, priority: "high", fetch: fetchRecent },
]


const MEDIUM_SECTIONS: SectionDef[] = [
    { id: "bestSellers", gatilho: GATILHOS_MAP.bestSellers, priority: "medium", fetch: fetchBestSellers },
    { id: "topRated", gatilho: GATILHOS_MAP.topRated, priority: "medium", fetch: fetchTopRated },
    { id: "promos", gatilho: GATILHOS_MAP.promos, priority: "medium", fetch: fetchPromos },
    { id: "mostViewed", gatilho: GATILHOS_MAP.mostViewed, priority: "medium", fetch: fetchMostViewed },
    { id: "services", gatilho: GATILHOS_MAP.services, priority: "medium", fetch: fetchServices },
    { id: "personalized", gatilho: GATILHOS_MAP.personalized, priority: "medium", fetch: fetchPersonalized },
    { id: "topVitrines", gatilho: GATILHOS_MAP.topVitrines, priority: "medium", fetch: fetchVitrines },
]

const FALLBACK_SECTIONS: SectionDef[] = [
    { id: "popular", gatilho: GATILHOS_MAP.popular, priority: "fallback", fetch: fetchPopular },
]

const PROXIMITY_SECTIONS: SectionDef[] = [
    // Adaptive single section: ≤2km → ≤10km → same city (decided internally)
    { id: "nearby", gatilho: GATILHOS_MAP.nearby, priority: "medium", fetch: fetchNearby },
]

// ─── MAIN ENTRY POINT ────────────────────────────────────────────────────────

async function getHomeSectionsUncached(ctx: DiscoverCtx): Promise<HomeSection[]> {
    const t0 = performance.now()
    dLog(`[Discover] START | scope=${ctx.scope} city=${ctx.city} state=${ctx.state} user=${ctx.userId ? "logged" : "anon"}`)

    const tiers = await getPartnerIdsByTier(ctx.city, ctx.state, ctx.stateOnly)

    if (tiers.allIds.size === 0) {
        dWarn(`[Discover] No partners found anywhere in Brazil`)
        return []
    }

    // 1. HIGH sections in parallel (trending, endingSoon, recent, gems)
    const highResults = await Promise.allSettled(
        HIGH_SECTIONS.map(s => s.fetch(tiers, ctx)),
    )

    const pool: HomeSection[] = []
    const usedGatilhos = new Set<string>()

    for (let i = 0; i < HIGH_SECTIONS.length; i++) {
        const result = highResults[i]
        if (result.status === "fulfilled" && result.value) {
            pool.push(result.value)
            usedGatilhos.add(result.value.gatilho)
        } else if (result.status === "rejected") {
            dWarn(`[Discover] HIGH ${HIGH_SECTIONS[i].id} error:`, result.reason)
        }
    }

    dLog(`[Discover] Phase 1 (HIGH): ${pool.length}/4`)

    // 2. Fill gaps with MEDIUM (seeded shuffle for daily rotation)
    if (pool.length < 5) {
        const usedIds = new Set(pool.map(s => s.id))
        const seed = dailySeed(ctx.userId)
        const shuffled = seededShuffle(MEDIUM_SECTIONS, `${seed}-medium`)

        for (const def of shuffled) {
            if (pool.length >= 5) break
            if (usedIds.has(def.id)) continue
            if (def.id === "personalized") continue
            if (usedGatilhos.has(def.gatilho) && pool.length >= 4) continue

            const result = await def.fetch(tiers, ctx).catch(() => null)
            if (result && result.items.length >= 1) {
                dLog(`[Discover] Filler: ${def.id} → ${result.items.length} items`)
                pool.push(result)
                usedGatilhos.add(result.gatilho)
                usedIds.add(result.id)
            } else {
                dLog(`[Discover] Filler: ${def.id} → empty`)
            }
        }
    }

    dLog(`[Discover] Phase 2 (MEDIUM): ${pool.length} | ids=[${pool.map(s => s.id).join(",")}]`)

    // 3. FALLBACK if still < 5
    if (pool.length < 5) {
        for (const def of FALLBACK_SECTIONS) {
            if (pool.length >= 5) break
            const result = await def.fetch(tiers, ctx).catch(() => null)
            if (result && result.items.length >= 1) {
                dLog(`[Discover] Fallback: ${def.id} → ${result.items.length} items`)
                pool.push(result)
            }
        }
    }

    dLog(`[Discover] Phase 3 (FALLBACK): ${pool.length} | ids=[${pool.map(s => s.id).join(",")}]`)

    // 4. ULTIMATE FALLBACK - any products at all (no ranking required)
    if (pool.length < 5) {
        const result = await fetchAllProducts(tiers, ctx).catch(() => null)
        if (result && result.items.length >= 1) {
            dLog(`[Discover] Ultimate fallback: allProducts → ${result.items.length} items`)
            pool.push(result)
        } else {
            dWarn(`[Discover] Ultimate fallback: allProducts empty - database may be empty`)
        }
    }

    dLog(`[Discover] Phase 4 (ULTIMATE): ${pool.length} | ids=[${pool.map(s => s.id).join(",")}]`)

    // 5. Proximity (nearby) - only with coords, only if room
    //    Vitrines are NOT reserved - they participate in the seeded MEDIUM rotation
    if (pool.length < 6 && ctx.scope === "city" && ctx.coords) {
        for (const def of PROXIMITY_SECTIONS) {
            if (pool.length >= 6) break
            const result = await def.fetch(tiers, ctx).catch(() => null)
            if (result && result.items.length >= 1) {
                dLog(`[Discover] Proximity: ${result.id} → ${result.items.length} items`)
                pool.push(result)
            }
        }
    }

    dLog(`[Discover] Phase 5 (PROXIMITY): ${pool.length} | ids=[${pool.map(s => s.id).join(",")}]`)

    // 6. Sixth dynamic section (only if room)
    if (pool.length < 6) {
        let sixthSection: HomeSection | null = null

        if (ctx.userId) {
            const persResult = await fetchPersonalized(tiers, ctx)
            if (persResult) sixthSection = persResult
        }

        if (!sixthSection) {
            const seed = dailySeed(ctx.userId)
            const usedIds = new Set(pool.map(s => s.id))
            const available = MEDIUM_SECTIONS.filter(s => !usedIds.has(s.id) && s.id !== "personalized")
            const shuffled = seededShuffle(available, `${seed}-sixth`)

            for (const def of shuffled) {
                const result = await def.fetch(tiers, ctx).catch(() => null)
                if (result && result.items.length >= 1) {
                    sixthSection = result
                    dLog(`[Discover] Sixth: ${def.id} → ${result.items.length} items`)
                    break
                }
            }
        }

        if (sixthSection && sixthSection.items.length >= 1) {
            const seen = new Set<string>()
            for (const section of pool) {
                for (const item of section.items) seen.add(item.id)
            }
            sixthSection.items = sixthSection.items.filter((item: any) => !seen.has(item.id))

            if (sixthSection._allItems && sixthSection.items.length < Math.min(20, sixthSection._allItems.length)) {
                const remaining = sixthSection._allItems.filter((item: any) => !seen.has(item.id))
                const needed = Math.min(20 - sixthSection.items.length, remaining.length)
                for (let i = 0; i < needed; i++) {
                    sixthSection.items.push(remaining[i])
                }
            }

            if (sixthSection.items.length >= 1) {
                pool.push(sixthSection)
            }
        } else {
            dLog(`[Discover] Sixth: none available`)
        }
    }

    dLog(`[Discover] Phase 6 (SIXTH): ${pool.length} | ids=[${pool.map(s => s.id).join(",")}]`)

    // 7. Global dedup with auto-refill - sections never drop below 1 item
    const globalSeen = new Set<string>()
    let totalRemovedByDedup = 0
    const finalSections: HomeSection[] = []

    for (const section of pool) {
        const beforeCount = section.items.length
        const deduped = section.items.filter((item: any) => {
            if (globalSeen.has(item.id)) return false
            globalSeen.add(item.id)
            return true
        })

        const removedCount = beforeCount - deduped.length

        // Auto-refill from _allItems buffer
        let refilled = 0
        if (removedCount > 0 && section._allItems) {
            const remaining = section._allItems.filter((item: any) => !globalSeen.has(item.id))
            const refillCount = Math.min(20 - deduped.length, remaining.length)
            for (let i = 0; i < refillCount; i++) {
                const refillItem = remaining[i]
                globalSeen.add(refillItem.id)
                deduped.push(refillItem)
                refilled++
            }
            totalRemovedByDedup += removedCount
        }

        if (removedCount > 0) {
            dLog(`[Discover] DEDUP ${section.id}: before=${beforeCount} removed=${removedCount} refilled=${refilled} after=${deduped.length}`)
        }

        // Never drop a section entirely - if dedup killed everything, keep original
        if (deduped.length >= 1) {
            finalSections.push({ ...section, items: deduped.slice(0, 20) })
        } else {
            dLog(`[Discover] DEDUP would kill section "${section.id}" - keeping it anyway`)
            finalSections.push(section)
        }
    }

    const result = finalSections.slice(0, 6)

    const t1 = performance.now()
    dLog(`[Discover] END | ${result.length} sections | ${(t1 - t0).toFixed(0)}ms`)
    dLog(`[Discover] DIAG: partners=${tiers.allIds.size} | pool_before_dedup=${pool.length} | dedup_removed=${totalRemovedByDedup}`)
    if (result.length > 0) {
        dLog(`[Discover] SECTIONS:`, result.map(s => `${s.id}=${s.title} (${s.items.length})`).join(" | "))
    }

    return result
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
        revalidate: 60, // Cache for 60 seconds
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
