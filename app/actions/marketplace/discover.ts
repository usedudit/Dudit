import "server-only"

import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { calculateDistance } from "@/lib/services/location.service"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HomeSection {
    id: string
    title: string
    subtitle: string
    gatilho: string
    items: any[]
    seeMoreLink: string
}

export interface DiscoverCtx {
    city: string
    state: string
    stateOnly: boolean
    citySlug: string
    coords: { lat: number; lng: number } | null
    userId: string | null
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

// ─── Partner IDs by tier (city → state → country) ───────────────────────────

const getPartnerIdsByTier = cache(async (
    city: string,
    state: string,
    stateOnly: boolean,
): Promise<PartnerTiers> => {
    const supabase = getAdminClient()

    const { data: partners, error } = await supabase
        .from("partners")
        .select("id, addresses!inner(city, state)")
        .eq("is_active", true)

    if (error) {
        console.error(`[DISCOVER][PARTNER_IDS] Error:`, error, `city=${city} state=${state}`)
        return { cityIds: new Set(), stateIds: new Set(), allIds: new Set() }
    }

    if (!partners || partners.length === 0) {
        console.warn("[DISCOVER][PARTNER_IDS] No active partners found in Brazil")
        return { cityIds: new Set(), stateIds: new Set(), allIds: new Set() }
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

    console.log(
        `[DISCOVER][PARTNER_IDS] city=${cityPartnerCount} | state=${statePartnerCount} | country=${allIds.size}`,
    )

    return { cityIds, stateIds, allIds }
})

// ─── Tier sort helper ───────────────────────────────────────────────────────

type WithTier = { _tier: number }

function getPartnerId(item: { partners?: any }): string | undefined {
    const raw = Array.isArray(item.partners) ? item.partners[0] : item.partners
    return raw?.id
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
        .sort((a, b) => a._tier - b._tier || scorer(b as T) - scorer(a as T))
}

// ─── Product query fields ───────────────────────────────────────────────────

const BASE_FIELDS = `id, name, price, promotional_price, images, rating`
const STATS_FIELDS = `views_last_30_days, sales_last_7_days, sales_last_30_days, favorites_count`

const PARTNER_JOIN = `partners!inner(
    id, store_name, store_image_url, latitude, longitude,
    addresses!inner(city, state)
)`

// ─── Process product into ItemCard shape ────────────────────────────────────

function processProduct(item: RawProduct, extra?: Record<string, any>) {
    const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
    const partner = rawPartner
        ? {
            id: rawPartner.id,
            store_name: rawPartner.store_name || "Vendedor",
            store_image_url: rawPartner.store_image_url,
            store_avatar: rawPartner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
            latitude: rawPartner.latitude,
            longitude: rawPartner.longitude,
            city: rawPartner.city ?? rawPartner.addresses?.[0]?.city ?? null,
            state: rawPartner.state ?? rawPartner.addresses?.[0]?.state ?? null,
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
// Each receives PartnerTiers instead of partnerIds:
//   - tiers.cityIds = partners in the user's city
//   - tiers.stateIds = partners in the user's state
//   - tiers.allIds   = all partners in Brazil
// Each fetcher queries with ALL partner IDs, then tags/sorts items by tier.
// No minimum item threshold — show what exists.

// ─── 1. 🔥 Bombando na sua região ───────────────────────────────────────────

async function fetchTrending(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) return null

    const { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, ${STATS_FIELDS}, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .limit(40)

    if (error) {
        console.error(`[DISCOVER][TRENDING] Supabase Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        return null
    }

    if (!data || data.length === 0) return null

    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        const r = item as RawProduct
        return (r.sales_last_7_days ?? 0) * 5 + (r.favorites_count ?? 0) * 2 + (r.views_last_30_days ?? 0)
    })

    const items = tagged.slice(0, 20).map(item => {
        const raw = item as RawProduct
        const proof: string[] = []
        const views = raw.views_last_30_days ?? 0
        const salesWeek = raw.sales_last_7_days ?? 0
        if (views >= 10) proof.push(`${views} visualizações`)
        if (salesWeek > 0) proof.push(`${salesWeek} vendidos esta semana`)
        if ((raw.favorites_count ?? 0) > 0) proof.push(`${raw.favorites_count} favoritaram`)
        return processProduct(raw, { _socialProof: proof.join(" • ") })
    })

    return {
        id: "trending",
        title: "🔥 Bombando na sua região",
        subtitle: "Produtos que estão chamando atenção perto de você",
        gatilho: GATILHOS_MAP.trending,
        items,
        seeMoreLink: `/explorar/${ctx.citySlug}?section=trending`,
    }
}

// ─── 2. ⏰ Acabando hoje ─────────────────────────────────────────────────────

async function fetchEndingSoon(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) return null

    const now = new Date()
    const end24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const { data: campaigns, error: campErr } = await supabase
        .from("campaigns")
        .select("id, ends_at")
        .eq("is_active", true)
        .in("partner_id", allIds)
        .gte("ends_at", now.toISOString())
        .lte("ends_at", end24h.toISOString())
        .order("ends_at", { ascending: true })

    if (campErr) {
        console.error(`[DISCOVER][ENDING_SOON] Campaigns error:`, campErr)
        return null
    }

    if (!campaigns || campaigns.length === 0) return null

    const campaignIds = campaigns.map((c: Record<string, any>) => c.id)
    const endsAtMap = new Map(campaigns.map((c: Record<string, any>) => [c.id, c.ends_at]))

    const { data: promotions, error: promoErr } = await supabase
        .from("promotions")
        .select(`id, campaign_id, promotion_products(product_id)`)
        .eq("is_active", true)
        .in("campaign_id", campaignIds)
        .in("partner_id", allIds)

    if (promoErr) {
        console.error(`[DISCOVER][ENDING_SOON] Promotions error:`, promoErr)
        return null
    }

    if (!promotions || promotions.length === 0) return null

    const productIds = new Set<string>()
    for (const promo of promotions) {
        const pp = promo.promotion_products as Array<{ product_id: string }> | undefined
        if (pp) for (const p of pp) if (p.product_id) productIds.add(p.product_id)
    }
    if (productIds.size === 0) return null

    const { data: products, error: prodErr } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("id", [...productIds])
        .limit(20)

    if (prodErr) {
        console.error(`[DISCOVER][ENDING_SOON] Products error:`, prodErr)
        return null
    }

    if (!products || products.length === 0) return null

    const tagged = applyTierSort(products as RawProduct[], tiers, () => 0)

    const items = tagged.slice(0, 20).map(item => {
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
        title: "⏰ Acabando hoje",
        subtitle: "Ofertas que terminam nas próximas horas",
        gatilho: GATILHOS_MAP.endingSoon,
        items,
        seeMoreLink: `/explorar/${ctx.citySlug}?section=ending-soon`,
    }
}

// ─── 3. 📍 Perto de você ─────────────────────────────────────────────────────

async function fetchNearby(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) return null

    // User with real coordinates → Haversine distance sort
    if (ctx.coords) {
        const { data, error } = await supabase
            .from("products")
            .select(`${BASE_FIELDS}, ${PARTNER_JOIN}`)
            .eq("is_active", true)
            .eq("show_in_marketplace", true)
            .in("partner_id", allIds)
            .not("partners.latitude", "is", null)
            .not("partners.longitude", "is", null)
            .limit(40)

        if (error) {
            console.error(`[DISCOVER][NEARBY] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
            return null
        }

        if (!data || data.length === 0) return null

        const withDistance = (data as RawProduct[]).map(item => {
            const partner = Array.isArray(item.partners) ? item.partners[0] : item.partners
            let distKm = Infinity
            if (partner?.latitude && partner?.longitude) {
                distKm = calculateDistance(ctx.coords!, { lat: partner.latitude, lng: partner.longitude })
            }
            return { ...item, _distKm: distKm }
        })

        withDistance.sort((a, b) => a._distKm - b._distKm)

        const items = withDistance.slice(0, 20).map(item => {
            const dist = item._distKm
            let distText = ""
            if (dist < 1) distText = `A ${Math.round(dist * 1000)}m`
            else if (dist <= 10) distText = `A ${dist.toFixed(1)} km`
            else distText = `A ${Math.round(dist)} km`

            const p = processProduct(item, { _distanceText: distText })
            if (p.partners) {
                (p.partners as Record<string, any>).distance_km = dist
                ;(p.partners as Record<string, any>).distance_km_formatted = distText
            }
            return p
        })

        return {
            id: "nearby",
            title: "📍 Perto de você",
            subtitle: "Encontre produtos pertinho da sua localização",
            gatilho: GATILHOS_MAP.nearby,
            items,
            seeMoreLink: `/explorar/${ctx.citySlug}?section=nearby`,
        }
    }

    // User WITHOUT coordinates or anonymous → tier-sorted products
    const { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, marketplace_score, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .order("marketplace_score", { ascending: false, nulls: "last" })
        .limit(40)

    if (error) {
        console.error(`[DISCOVER][NEARBY] Error (no coords):`, error)
        return null
    }

    if (!data || data.length === 0) return null

    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        return (item as any).marketplace_score ?? 0
    })

    const items = tagged.slice(0, 20).map(item => processProduct(item as RawProduct))

    // Title varies by context:
    //   coords → distance-based
    //   no partners in state → showing country-wide picks
    //   otherwise → city/state content without coords
    let nearbyTitle: string
    if (ctx.coords) {
        nearbyTitle = "📍 Perto de você"
    } else if (tiers.stateIds.size === 0) {
        nearbyTitle = "🌎 Descobertas da Dudit"
    } else {
        nearbyTitle = "📍 Produtos que podem te interessar"
    }

    const nearbySubtitle = nearbyTitle === "📍 Perto de você"
        ? "Encontre produtos pertinho da sua localização"
        : nearbyTitle === "🌎 Descobertas da Dudit"
            ? "Descobertas de todo o Brasil"
            : "Recomendados para você"

    return {
        id: "nearby",
        title: nearbyTitle,
        subtitle: nearbySubtitle,
        gatilho: GATILHOS_MAP.nearby,
        items,
        seeMoreLink: `/explorar/${ctx.citySlug}?section=nearby`,
    }
}

// ─── 4. 🆕 Recém anunciados ──────────────────────────────────────────────────

async function fetchRecent(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) return null

    const { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, created_at, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .order("created_at", { ascending: false })
        .limit(40)

    if (error) {
        console.error(`[DISCOVER][RECENT] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        return null
    }

    if (!data || data.length === 0) return null

    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        const r = item as RawProduct
        return r.created_at ? new Date(r.created_at).getTime() : 0
    })

    const items = tagged.slice(0, 20).map(item => {
        const raw = item as RawProduct
        const isRecent = raw.created_at
            ? Date.now() - new Date(raw.created_at).getTime() < 48 * 60 * 60 * 1000
            : false
        return processProduct(raw, {
            _badgeLabel: isRecent ? "Saiu do forno" : "Novo na Dudit",
            _badgeVariant: "green",
        })
    })

    return {
        id: "recent",
        title: "🆕 Recém anunciados",
        subtitle: "Acabaram de chegar na sua região",
        gatilho: GATILHOS_MAP.recent,
        items,
        seeMoreLink: `/explorar/${ctx.citySlug}?section=recent`,
    }
}

// ─── 5. 💎 Achados da Dudit ──────────────────────────────────────────────────

async function fetchGems(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) return null

    const seed = dailySeed(ctx.userId)

    const { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, ${STATS_FIELDS}, condition, created_at, category_id, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .limit(80)

    if (error) {
        console.error(`[DISCOVER][GEMS] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        return null
    }

    if (!data || data.length === 0) return null

    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        const r = item as RawProduct
        const hasPromo = r.promotional_price && Number(r.promotional_price) < Number(r.price)
        const discountPct = hasPromo
            ? ((Number(r.price) - Number(r.promotional_price)) / Number(r.price)) * 100
            : 0

        const usedBonus = (r.condition?.toLowerCase() === "used" || r.condition === "usado") ? 10 : 0
        const viewsBonus = (r.views_last_30_days ?? 0) / 100

        // 80-90% objective score
        const objectiveScore = discountPct * 2 + viewsBonus + usedBonus

        // 10-20% deterministic variety boost (0.0–0.19 × objectiveScore)
        const discoverBoost = (hashSeed(seed, r.id) % 20) / 100
        const varietyBonus = discoverBoost * (objectiveScore || 20)

        return objectiveScore + varietyBonus
    })

    // Diversity: max 3 items per category for a TikTok-like variety feel
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

    const items = diverseItems.slice(0, 20).map(item => {
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
        title: "💎 Achados da Dudit",
        subtitle: "Oportunidades imperdíveis selecionadas para você",
        gatilho: GATILHOS_MAP.gems,
        items,
        seeMoreLink: `/explorar/${ctx.citySlug}?section=gems`,
    }
}

// ─── MEDIUM PRIORITY SECTIONS ────────────────────────────────────────────────

// ─── 6. 👀 Você pode gostar (apenas logado com sinais reais) ────────────────

async function fetchPersonalized(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    if (!ctx.userId) return null

    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) return null

    const [favRes, orderRes] = await Promise.all([
        supabase.from("favorites").select("item_id", { count: "exact", head: true })
            .eq("user_id", ctx.userId).eq("item_type", "produto").limit(1),
        supabase.from("orders").select("id", { count: "exact", head: true })
            .eq("buyer_id", ctx.userId).limit(1),
    ])

    const hasFavs = (favRes.count ?? 0) > 0
    const hasOrders = (orderRes.count ?? 0) > 0
    if (!hasFavs && !hasOrders) return null

    const { data: userFavs, error: favErr } = await supabase
        .from("favorites")
        .select("item_id")
        .eq("user_id", ctx.userId)
        .eq("item_type", "produto")
        .order("created_at", { ascending: false })
        .limit(50)

    if (favErr) {
        console.error(`[DISCOVER][PERSONALIZED] Favorites error:`, favErr)
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
            console.error(`[DISCOVER][PERSONALIZED] Category error:`, catErr)
        } else if (favProducts) {
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

    if (preferredCatIds.length === 0) {
        return fetchPopular(tiers, ctx)
    }

    const { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, ${STATS_FIELDS}, category_id, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .in("category_id", preferredCatIds)
        .order("marketplace_score", { ascending: false })
        .limit(40)

    if (error) {
        console.error(`[DISCOVER][PERSONALIZED] Products error:`, error)
        return null
    }

    if (!data || data.length === 0) return null

    const favSet = new Set(favProductIds)
    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        return (item as any).marketplace_score ?? 0
    })

    const items = tagged
        .filter(item => !favSet.has((item as RawProduct).id))
        .slice(0, 20)
        .map(item => processProduct(item as RawProduct))

    return {
        id: "personalized",
        title: "👀 Você pode gostar",
        subtitle: "Baseado nos seus favoritos e compras",
        gatilho: GATILHOS_MAP.personalized,
        items,
        seeMoreLink: `/explorar/${ctx.citySlug}?section=for-you`,
    }
}

// ─── 7. ⭐ Mais vendidos ─────────────────────────────────────────────────────

async function fetchBestSellers(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) return null

    const { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, sales_last_30_days, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .not("sales_last_30_days", "eq", 0)
        .order("sales_last_30_days", { ascending: false })
        .limit(40)

    if (error) {
        console.error(`[DISCOVER][BEST_SELLERS] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        return null
    }

    if (!data || data.length === 0) return null

    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        return (item as RawProduct).sales_last_30_days ?? 0
    })

    const items = tagged.slice(0, 20).map(item => {
        const raw = item as RawProduct
        return processProduct(raw, {
            _socialProof: raw.sales_last_30_days! > 0
                ? `${raw.sales_last_30_days} vendidos no último mês`
                : undefined,
        })
    })

    return {
        id: "bestSellers",
        title: "⭐ Mais vendidos",
        subtitle: "Os produtos mais vendidos",
        gatilho: GATILHOS_MAP.bestSellers,
        items,
        seeMoreLink: `/explorar/${ctx.citySlug}?section=best-sellers`,
    }
}

// ─── 8. 🏆 Melhor avaliados ──────────────────────────────────────────────────

async function fetchTopRated(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) return null

    const { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .gt("rating", 0)
        .order("rating", { ascending: false })
        .limit(40)

    if (error) {
        console.error(`[DISCOVER][TOP_RATED] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        return null
    }

    if (!data || data.length === 0) return null

    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        return (item as RawProduct).rating ?? 0
    })

    const items = tagged.slice(0, 20).map(item => {
        const raw = item as RawProduct
        return processProduct(raw, {
            _badgeLabel: (raw.rating ?? 0) >= 4.5 ? "★★★" : "★",
            _badgeVariant: "blue",
        })
    })

    return {
        id: "topRated",
        title: "🏆 Melhor avaliados",
        subtitle: "Os queridinhos da sua região",
        gatilho: GATILHOS_MAP.topRated,
        items,
        seeMoreLink: `/explorar/${ctx.citySlug}?section=top-rated`,
    }
}

// ─── 9. 🎯 Promoções especiais ───────────────────────────────────────────────

async function fetchPromos(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) return null

    const { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .not("promotional_price", "is", null)
        .limit(60)

    if (error) {
        console.error(`[DISCOVER][PROMOS] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        return null
    }

    const discounted = (data || []).filter(
        (item: any) => item.promotional_price && Number(item.promotional_price) < Number(item.price),
    )

    if (discounted.length === 0) return null

    const tagged = applyTierSort(discounted as RawProduct[], tiers, item => {
        const r = item as RawProduct
        if (!r.promotional_price || !r.price) return 0
        return ((Number(r.price) - Number(r.promotional_price)) / Number(r.price)) * 100
    })

    const items = tagged.slice(0, 20).map(item => {
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
        title: "🎯 Promoções especiais",
        subtitle: "Descontos imperdíveis pertinho de você",
        gatilho: GATILHOS_MAP.promos,
        items,
        seeMoreLink: `/explorar/${ctx.citySlug}?section=promos`,
    }
}

// ─── 10. 💬 Mais visualizados ────────────────────────────────────────────────

async function fetchMostViewed(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) return null

    const { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, views_last_30_days, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .not("views_last_30_days", "eq", 0)
        .order("views_last_30_days", { ascending: false })
        .limit(40)

    if (error) {
        console.error(`[DISCOVER][MOST_VIEWED] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        return null
    }

    if (!data || data.length === 0) return null

    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        return (item as RawProduct).views_last_30_days ?? 0
    })

    const items = tagged.slice(0, 20).map(item => {
        const raw = item as RawProduct
        return processProduct(raw, {
            _socialProof: (raw.views_last_30_days ?? 0) > 0
                ? `${raw.views_last_30_days} visualizações nos últimos 30 dias`
                : undefined,
        })
    })

    return {
        id: "mostViewed",
        title: "💬 Mais visualizados",
        subtitle: "O que todo mundo está de olho",
        gatilho: GATILHOS_MAP.mostViewed,
        items,
        seeMoreLink: `/explorar/${ctx.citySlug}?section=most-viewed`,
    }
}

// ─── 11. 🧰 Serviços perto de você ───────────────────────────────────────────

async function fetchServices(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) return null

    const { data, error } = await supabase
        .from("services")
        .select(`id, name, price, images, rating, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .order("rating", { ascending: false })
        .limit(40)

    if (error) {
        console.error(`[DISCOVER][SERVICES] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        return null
    }

    if (!data || data.length === 0) return null

    // Tag each service's partner tier
    const tagged = (data as any[]).map(item => {
        const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
        const pid = rawPartner?.id
        const tier = pid && tiers.cityIds.has(pid) ? 0
                   : pid && tiers.stateIds.has(pid) ? 1
                   : 2
        return { ...item, _tier: tier }
    }).sort((a: any, b: any) => a._tier - b._tier || (b.rating ?? 0) - (a.rating ?? 0))

    const items = tagged.slice(0, 20).map((item: any) => {
        const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
        const partner = rawPartner
            ? {
                id: rawPartner.id,
                store_name: rawPartner.store_name || "Vendedor",
                store_image_url: rawPartner.store_image_url,
                store_avatar: rawPartner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
                latitude: rawPartner.latitude,
                longitude: rawPartner.longitude,
                city: rawPartner.addresses?.[0]?.city ?? null,
                state: rawPartner.addresses?.[0]?.state ?? null,
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
    })

    return {
        id: "services",
        title: "🧰 Serviços perto de você",
        subtitle: "Profissionais e serviços na sua região",
        gatilho: GATILHOS_MAP.services,
        items,
        seeMoreLink: `/explorar/${ctx.citySlug}?type=servicos`,
    }
}

// ─── 12. 🛍️ Conheça vendedores da Dudit (vitrines) ─────────────────────────

async function fetchVitrines(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) return null

    const { data, error } = await supabase
        .from("partners")
        .select(`id, store_name, store_image_url, rating, slug, addresses!inner(city, state)`)
        .eq("is_active", true)
        .in("id", allIds)
        .order("rating", { ascending: false, nulls: "last" })
        .limit(20)

    if (error) {
        console.error(`[DISCOVER][VITRINES] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        return null
    }

    if (!data || data.length === 0) return null

    // Tag partners by tier
    const tagged = data.map((p: Record<string, any>) => {
        const pid = p.id
        const tier = pid && tiers.cityIds.has(pid) ? 0
                   : pid && tiers.stateIds.has(pid) ? 1
                   : 2
        return { ...p, _tier: tier }
    }).sort((a: any, b: any) => a._tier - b._tier || (b.rating ?? 0) - (a.rating ?? 0))

    const items = tagged.slice(0, 12).map((partner: any) => ({
        id: partner.id,
        name: partner.store_name,
        store_name: partner.store_name,
        store_image_url: partner.store_image_url,
        store_avatar: partner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
        images: partner.store_image_url ? [partner.store_image_url] : [],
        rating: partner.rating,
        partnerId: partner.id,
        itemType: "vitrine" as const,
    }))

    return {
        id: "topVitrines",
        title: "🛍️ Conheça vendedores da Dudit",
        subtitle: "Lojas para você conhecer",
        gatilho: GATILHOS_MAP.topVitrines,
        items,
        seeMoreLink: `/explorar/${ctx.citySlug}?section=vendors`,
    }
}

// ─── 13. Produtos populares (fallback) ──────────────────────────────────────

async function fetchPopular(tiers: PartnerTiers, ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const allIds = [...tiers.allIds]
    if (allIds.length === 0) return null

    const { data, error } = await supabase
        .from("products")
        .select(`${BASE_FIELDS}, marketplace_score, ${PARTNER_JOIN}`)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", allIds)
        .order("marketplace_score", { ascending: false, nulls: "last" })
        .limit(30)

    if (error) {
        console.error(`[DISCOVER][POPULAR] Error:`, error, `city=${ctx.city} state=${ctx.state}`)
        return null
    }

    if (!data || data.length === 0) return null

    const tagged = applyTierSort(data as RawProduct[], tiers, item => {
        return (item as any).marketplace_score ?? 0
    })

    const items = tagged.slice(0, 20).map(item => processProduct(item as RawProduct))

    return {
        id: "popular",
        title: "🔥 Populares na sua região",
        subtitle: "O que está bombando por aqui",
        gatilho: GATILHOS_MAP.popular,
        items,
        seeMoreLink: `/explorar/${ctx.citySlug}?section=popular`,
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
    { id: "nearby", gatilho: GATILHOS_MAP.nearby, priority: "high", fetch: fetchNearby },
    { id: "recent", gatilho: GATILHOS_MAP.recent, priority: "high", fetch: fetchRecent },
    { id: "gems", gatilho: GATILHOS_MAP.gems, priority: "high", fetch: fetchGems },
]

const MEDIUM_SECTIONS: SectionDef[] = [
    { id: "personalized", gatilho: GATILHOS_MAP.personalized, priority: "medium", fetch: fetchPersonalized },
    { id: "bestSellers", gatilho: GATILHOS_MAP.bestSellers, priority: "medium", fetch: fetchBestSellers },
    { id: "topRated", gatilho: GATILHOS_MAP.topRated, priority: "medium", fetch: fetchTopRated },
    { id: "promos", gatilho: GATILHOS_MAP.promos, priority: "medium", fetch: fetchPromos },
    { id: "mostViewed", gatilho: GATILHOS_MAP.mostViewed, priority: "medium", fetch: fetchMostViewed },
    { id: "services", gatilho: GATILHOS_MAP.services, priority: "medium", fetch: fetchServices },
]

const FALLBACK_SECTIONS: SectionDef[] = [
    { id: "popular", gatilho: GATILHOS_MAP.popular, priority: "fallback", fetch: fetchPopular },
]

// Vitrines is always attempted (runs alongside MEDIUM)
const VITRINES_SECTION: SectionDef = {
    id: "topVitrines", gatilho: GATILHOS_MAP.topVitrines, priority: "medium", fetch: fetchVitrines,
}

// ─── MAIN ENTRY POINT ────────────────────────────────────────────────────────

export async function getHomeSections(ctx: DiscoverCtx): Promise<HomeSection[]> {
    const t0 = performance.now()
    console.log(`[Discover] START | city=${ctx.city} state=${ctx.state} user=${ctx.userId ? "logged" : "anon"}`)

    // 1. Fetch partner IDs by tier
    const tiers = await getPartnerIdsByTier(ctx.city, ctx.state, ctx.stateOnly)

    if (tiers.allIds.size === 0) {
        console.warn(`[Discover] No partners found anywhere in Brazil`)
        return []
    }

    // 2. FASE 1: Fetch all 5 HIGH sections in parallel (fixed order)
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
            console.warn(`[Discover] Section ${HIGH_SECTIONS[i].id} rejected:`, result.reason)
        }
    }

    console.log(`[Discover] Phase 1 (HIGH): ${pool.length}/5 sections`)

    // 3. If pool < 5, fill gaps with MEDIUM sections in fixed order
    if (pool.length < 5) {
        const usedIds = new Set(pool.map(s => s.id))
        for (const def of MEDIUM_SECTIONS) {
            if (pool.length >= 5) break
            if (usedIds.has(def.id)) continue
            if (def.id === "personalized") continue
            if (usedGatilhos.has(def.gatilho) && pool.length >= 4) continue

            const result = await def.fetch(tiers, ctx).catch(() => null)
            if (result && result.items.length >= 1) {
                pool.push(result)
                usedGatilhos.add(result.gatilho)
                usedIds.add(result.id)
            }
        }
    }

    // 4. If still < 5, try FALLBACK
    if (pool.length < 5) {
        for (const def of FALLBACK_SECTIONS) {
            if (pool.length >= 5) break
            const result = await def.fetch(tiers, ctx).catch(() => null)
            if (result && result.items.length >= 1) {
                pool.push(result)
            }
        }
    }

    // 5. Vitrines at fixed position: insert at the 6th slot (index 5)
    //    Between HIGH (indices 0–4) and the eventual 6th dynamic section
    const vitrinesResult = await fetchVitrines(tiers, ctx).catch(() => null)
    if (vitrinesResult && vitrinesResult.items.length >= 1) {
        const insertAt = Math.min(pool.length, 5)
        pool.splice(insertAt, 0, vitrinesResult)
    }

    // 6. Sixth dynamic section (only if vitrines didn't fill the 6th slot)
    if (pool.length < 6) {
        let sixthSection: HomeSection | null = null

        // Try personalized for logged users with real signals
        if (ctx.userId) {
            const persResult = await fetchPersonalized(tiers, ctx)
            if (persResult) sixthSection = persResult
        }

        // Otherwise: seeded shuffle among remaining MEDIUM sections
        if (!sixthSection) {
            const seed = dailySeed(ctx.userId)
            const usedIds = new Set(pool.map(s => s.id))
            const available = MEDIUM_SECTIONS.filter(s => !usedIds.has(s.id) && s.id !== "personalized")
            const shuffled = seededShuffle(available, `${seed}-sixth`)

            for (const def of shuffled) {
                const result = await def.fetch(tiers, ctx).catch(() => null)
                if (result && result.items.length >= 1) {
                    sixthSection = result
                    break
                }
            }
        }

        // Dedup sixths items against existing pool
        if (sixthSection && sixthSection.items.length >= 1) {
            const seen = new Set<string>()
            for (const section of pool) {
                for (const item of section.items) seen.add(item.id)
            }
            sixthSection.items = sixthSection.items.filter((item: any) => !seen.has(item.id))
            if (sixthSection.items.length >= 1) {
                pool.push(sixthSection)
            }
        }
    }

    // 7. Global dedup
    const globalSeen = new Set<string>()
    const finalSections: HomeSection[] = []

    for (const section of pool) {
        const deduped = section.items.filter((item: any) => {
            if (globalSeen.has(item.id)) return false
            globalSeen.add(item.id)
            return true
        })
        if (deduped.length >= 1) {
            finalSections.push({ ...section, items: deduped.slice(0, 20) })
        }
    }

    const result = finalSections.slice(0, 6)

    const t1 = performance.now()
    console.log(`[Discover] END | ${result.length} sections | ${(t1 - t0).toFixed(0)}ms`)
    if (result.length > 0) {
        console.log(`[Discover] Sections:`, result.map(s => `${s.title} (${s.items.length} itens)`).join(" | "))
    }

    return result
}
