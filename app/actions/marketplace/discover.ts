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

// ─── Gatilhos psicológicos para evitar repetição na mesma home ──────────────

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

// ─── Seeded shuffle (determinístico por userId + data) ──────────────────────

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

// ─── City partner IDs (deduplicated per SSR request via react.cache) ─────────

const getCityPartnerIds = cache(async (
    city: string,
    state: string,
    stateOnly: boolean,
): Promise<string[]> => {
    const supabase = getAdminClient()

    const { data: partners } = await supabase
        .from("partners")
        .select("id, addresses!inner(city, state)")
        .eq("is_active", true)
        .ilike("addresses.state", state)

    if (!partners || partners.length === 0) return []

    const targetCitySlug = city
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")

    const filtered = stateOnly
        ? partners
        : partners.filter((item: Record<string, any>) => {
            const addr = item.addresses?.[0] || item.addresses
            if (!addr || !addr.city) return false
            const itemCitySlug = addr.city
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "")
            return itemCitySlug === targetCitySlug
        })

    return filtered.map((p: Record<string, any>) => p.id)
})

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
        // Social proof & badges injected for the ItemCard
        _views: item.views_last_30_days ?? 0,
        _salesWeek: item.sales_last_7_days ?? 0,
        _sales: item.sales_last_30_days ?? 0,
        _favs: item.favorites_count ?? 0,
        ...extra,
    }
}

// ─── SECTION FETCHERS ───────────────────────────────────────────────────────
// Each receives partnerIds (city-filtered) and returns items or null.

// 1. 🔥 Bombando na sua região
async function fetchTrending(partnerIds: string[], ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()

    const { data } = await supabase
        .from("products")
        .select(`
            id, name, price, promotional_price, images, rating,
            views_last_30_days, sales_last_7_days, sales_last_30_days, favorites_count,
            partners!inner(id, store_name, store_image_url, latitude, longitude)
        `)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", partnerIds)
        .not("views_last_30_days", "eq", 0)
        .order("views_last_30_days", { ascending: false })
        .limit(20)

    if (!data || data.length < 4) return null

    const scored = (data as RawProduct[])
        .map(item => ({
            ...item,
            _score: (item.views_last_30_days ?? 0) + (item.sales_last_7_days ?? 0) * 5,
        }))
        .sort((a, b) => b._score - a._score)

    const items = scored.map(item => {
        const proof: string[] = []
        if (item.views_last_30_days! >= 10) proof.push(`${item.views_last_30_days} visualizações hoje`)
        if (item.sales_last_7_days! > 0) proof.push(`${item.sales_last_7_days} vendidos esta semana`)
        if (item.favorites_count! > 0) proof.push(`${item.favorites_count} favoritaram`)
        return processProduct(item, { _socialProof: proof.join(" • ") })
    })

    return {
        id: "trending",
        title: "🔥 Bombando na sua região",
        subtitle: "Produtos que estão chamando atenção perto de você",
        gatilho: GATILHOS_MAP.trending,
        items,
        seeMoreLink: `/explorar?section=trending`,
    }
}

// 2. ⏰ Acabando hoje
async function fetchEndingSoon(partnerIds: string[], ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const now = new Date()
    const end24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    // Find campaigns ending within 24h
    const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id, ends_at")
        .eq("is_active", true)
        .in("partner_id", partnerIds)
        .gte("ends_at", now.toISOString())
        .lte("ends_at", end24h.toISOString())
        .order("ends_at", { ascending: true })

    if (!campaigns || campaigns.length === 0) return null

    const campaignIds = campaigns.map((c: Record<string, any>) => c.id)
    const endsAtMap = new Map(campaigns.map((c: Record<string, any>) => [c.id, c.ends_at]))

    // Find promotions in those campaigns
    const { data: promotions } = await supabase
        .from("promotions")
        .select(`
            id, campaign_id,
            promotion_products(product_id)
        `)
        .eq("is_active", true)
        .in("campaign_id", campaignIds)
        .in("partner_id", partnerIds)

    if (!promotions || promotions.length === 0) return null

    // Collect product IDs
    const productIds = new Set<string>()
    for (const promo of promotions) {
        const pp = promo.promotion_products as Array<{ product_id: string }> | undefined
        if (pp) for (const p of pp) if (p.product_id) productIds.add(p.product_id)
    }

    if (productIds.size === 0) return null

    const pidArr = [...productIds]

    // Fetch products
    const { data: products } = await supabase
        .from("products")
        .select(`
            id, name, price, promotional_price, images, rating,
            partners!inner(id, store_name, store_image_url, latitude, longitude)
        `)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("id", pidArr)
        .limit(20)

    if (!products || products.length < 4) return null

    const items = (products as RawProduct[]).map(item => {
        const nowMs = Date.now()
        // Find the closest ending campaign for this product
        // (simplified: use the first campaign ending soonest)
        const endsAt = endsAtMap.get(campaignIds[0])
        let timeLeft = "Acaba hoje"
        if (endsAt) {
            const diffMs = new Date(String(endsAt)).getTime() - nowMs
            const hoursLeft = Math.ceil(diffMs / (1000 * 60 * 60))
            if (hoursLeft <= 1) timeLeft = "Termina em 1h"
            else if (hoursLeft <= 6) timeLeft = `Termina em ${hoursLeft}h`
            else if (hoursLeft <= 12) timeLeft = `Termina em ${hoursLeft}h`
            else timeLeft = "Último dia"
        }
        return processProduct(item, { _timeLeft: timeLeft })
    })

    return {
        id: "endingSoon",
        title: "⏰ Acabando hoje",
        subtitle: "Ofertas que terminam nas próximas horas",
        gatilho: GATILHOS_MAP.endingSoon,
        items,
        seeMoreLink: `/explorar?section=ending-soon`,
    }
}

// 3. 📍 Perto de você
async function fetchNearby(partnerIds: string[], ctx: DiscoverCtx): Promise<HomeSection | null> {
    if (!ctx.coords) return null

    const supabase = getAdminClient()

    const { data } = await supabase
        .from("products")
        .select(`
            id, name, price, promotional_price, images, rating,
            partners!inner(
                id, store_name, store_image_url, latitude, longitude
            )
        `)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", partnerIds)
        .not("partners.latitude", "is", null)
        .not("partners.longitude", "is", null)
        .limit(40)

    if (!data || data.length < 4) return null

    // Sort by distance
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

        // Overwrite distance on partner
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
        seeMoreLink: `/explorar?section=nearby`,
    }
}

// 4. 🆕 Recém anunciados
async function fetchRecent(partnerIds: string[], ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()

    const { data } = await supabase
        .from("products")
        .select(`
            id, name, price, promotional_price, images, rating, created_at,
            partners!inner(id, store_name, store_image_url, latitude, longitude)
        `)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", partnerIds)
        .order("created_at", { ascending: false })
        .limit(20)

    if (!data || data.length < 4) return null

    const items = (data as RawProduct[]).map(item => {
        const isRecent = item.created_at
            ? Date.now() - new Date(item.created_at).getTime() < 48 * 60 * 60 * 1000
            : false
        return processProduct(item, {
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
        seeMoreLink: `/explorar?section=recent`,
    }
}

// 5. 💎 Achados da Dudit
async function fetchGems(partnerIds: string[], ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()
    const seed = dailySeed(ctx.userId)

    const { data } = await supabase
        .from("products")
        .select(`
            id, name, price, promotional_price, images, rating,
            views_last_30_days, sales_last_30_days, favorites_count, condition, created_at,
            partners!inner(id, store_name, store_image_url, latitude, longitude)
        `)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", partnerIds)
        .limit(60)

    if (!data || data.length < 4) return null

    const scored = (data as RawProduct[]).map(item => {
        // Discount score
        const hasPromo = item.promotional_price && Number(item.promotional_price) < Number(item.price)
        const discountPct = hasPromo
            ? ((Number(item.price) - Number(item.promotional_price)) / Number(item.price)) * 100
            : 0

        // Used item bonus
        const usedBonus = (item.condition?.toLowerCase() === "used" || item.condition === "usado") ? 10 : 0

        // Views bonus
        const viewsBonus = (item.views_last_30_days ?? 0) / 100

        // Seeded random boost (deterministic: small nudge for variety)
        const discoverBoost = (hashSeed(seed, item.id) % 20) / 100 // 0..0.19

        const gemScore = discountPct * 2 + viewsBonus + usedBonus + discoverBoost * discountPct

        return { ...item, _gemScore: gemScore, _discountPct: discountPct }
    })

    scored.sort((a, b) => b._gemScore - a._gemScore)

    const items = scored.slice(0, 20).map(item => {
        const isGoodDeal = item._discountPct >= 30 || (item as any).condition === "used"
        return processProduct(item, {
            _badgeLabel: isGoodDeal ? "Achado" : "Oferta rara",
            _badgeVariant: "purple",
        })
    })

    return {
        id: "gems",
        title: "💎 Achados da Dudit",
        subtitle: "Oportunidades que você não pode perder",
        gatilho: GATILHOS_MAP.gems,
        items,
        seeMoreLink: `/explorar?section=gems`,
    }
}

// ─── MEDIUM PRIORITY SECTIONS ───────────────────────────────────────────────

// 6. 👀 Você pode gostar (apenas logado com sinais reais)
async function fetchPersonalized(partnerIds: string[], ctx: DiscoverCtx): Promise<HomeSection | null> {
    if (!ctx.userId) return null

    const supabase = getAdminClient()

    // Check if user has real signals (favorites OR purchases)
    const [favRes, orderRes] = await Promise.all([
        supabase
            .from("favorites")
            .select("item_id", { count: "exact", head: true })
            .eq("user_id", ctx.userId)
            .eq("item_type", "produto")
            .limit(1),
        supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("buyer_id", ctx.userId)
            .limit(1),
    ])

    const hasFavs = (favRes.count ?? 0) > 0
    const hasOrders = (orderRes.count ?? 0) > 0

    if (!hasFavs && !hasOrders) return null

    // Get user's favorite product IDs to find preferred categories
    const { data: userFavs } = await supabase
        .from("favorites")
        .select("item_id")
        .eq("user_id", ctx.userId)
        .eq("item_type", "produto")
        .order("created_at", { ascending: false })
        .limit(50)

    const favProductIds = (userFavs || []).map((f: Record<string, any>) => f.item_id)

    // Get categories from favorited products
    let preferredCatIds: string[] = []
    if (favProductIds.length > 0) {
        const { data: favProducts } = await supabase
            .from("products")
            .select("category_id")
            .in("id", favProductIds)
        if (favProducts) {
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

    // Fallback: if no category signal, use general popularity
    if (preferredCatIds.length === 0) {
        return fetchPopular(partnerIds, ctx)
    }

    // Fetch products from preferred categories
    const { data } = await supabase
        .from("products")
        .select(`
            id, name, price, promotional_price, images, rating,
            views_last_30_days, sales_last_30_days, favorites_count,
            category_id,
            partners!inner(id, store_name, store_image_url, latitude, longitude)
        `)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", partnerIds)
        .in("category_id", preferredCatIds)
        .order("marketplace_score", { ascending: false })
        .limit(20)

    if (!data || data.length < 4) return null

    // Exclude already-favorited products
    const favSet = new Set(favProductIds)
    const items = (data as RawProduct[])
        .filter(item => !favSet.has(item.id))
        .slice(0, 20)
        .map(item => processProduct(item))

    return {
        id: "personalized",
        title: "👀 Você pode gostar",
        subtitle: "Baseado nos seus favoritos e compras",
        gatilho: GATILHOS_MAP.personalized,
        items,
        seeMoreLink: `/explorar?section=for-you`,
    }
}

// 7. ⭐ Mais vendidos
async function fetchBestSellers(partnerIds: string[], ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()

    const { data } = await supabase
        .from("products")
        .select(`
            id, name, price, promotional_price, images, rating,
            sales_last_30_days,
            partners!inner(id, store_name, store_image_url, latitude, longitude)
        `)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", partnerIds)
        .not("sales_last_30_days", "eq", 0)
        .order("sales_last_30_days", { ascending: false })
        .limit(20)

    if (!data || data.length < 4) return null

    const items = (data as RawProduct[]).map(item => {
        const proof = item.sales_last_30_days! > 0
            ? `${item.sales_last_30_days} vendidos no último mês`
            : undefined
        return processProduct(item, { _socialProof: proof })
    })

    return {
        id: "bestSellers",
        title: "⭐ Mais vendidos",
        subtitle: "Os produtos mais vendidos da sua região",
        gatilho: GATILHOS_MAP.bestSellers,
        items,
        seeMoreLink: `/explorar?section=best-sellers`,
    }
}

// 8. 🏆 Melhor avaliados
async function fetchTopRated(partnerIds: string[], ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()

    const { data } = await supabase
        .from("products")
        .select(`
            id, name, price, promotional_price, images, rating,
            partners!inner(id, store_name, store_image_url, latitude, longitude)
        `)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", partnerIds)
        .gt("rating", 0)
        .order("rating", { ascending: false })
        .limit(20)

    if (!data || data.length < 4) return null

    const items = (data as RawProduct[]).map(item => {
        return processProduct(item, {
            _badgeLabel: item.rating! >= 4.5 ? "★★★" : "★",
            _badgeVariant: "blue",
        })
    })

    return {
        id: "topRated",
        title: "🏆 Melhor avaliados",
        subtitle: "Os queridinhos da sua região",
        gatilho: GATILHOS_MAP.topRated,
        items,
        seeMoreLink: `/explorar?section=top-rated`,
    }
}

// 9. 🎯 Promoções especiais
async function fetchPromos(partnerIds: string[], ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()

    const { data } = await supabase
        .from("products")
        .select(`
            id, name, price, promotional_price, images, rating,
            partners!inner(id, store_name, store_image_url, latitude, longitude)
        `)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", partnerIds)
        .not("promotional_price", "is", null)
        .limit(40)

    // Filter to only actual discounted prices
    const discounted = (data || []).filter(
        (item: any) => item.promotional_price && Number(item.promotional_price) < Number(item.price),
    )

    if (discounted.length < 4) return null

    const items = discounted.slice(0, 20).map((item: RawProduct) => {
        const discountPct = Math.round(
            ((Number(item.price) - Number(item.promotional_price)) / Number(item.price)) * 100,
        )
        return processProduct(item, {
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
        seeMoreLink: `/explorar?section=promos`,
    }
}

// 10. 💬 Mais visualizados
async function fetchMostViewed(partnerIds: string[], ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()

    const { data } = await supabase
        .from("products")
        .select(`
            id, name, price, promotional_price, images, rating,
            views_last_30_days,
            partners!inner(id, store_name, store_image_url, latitude, longitude)
        `)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", partnerIds)
        .not("views_last_30_days", "eq", 0)
        .order("views_last_30_days", { ascending: false })
        .limit(20)

    if (!data || data.length < 4) return null

    const items = (data as RawProduct[]).map(item => {
        const proof = item.views_last_30_days! > 0
            ? `${item.views_last_30_days} visualizações nos últimos 30 dias`
            : undefined
        return processProduct(item, { _socialProof: proof })
    })

    return {
        id: "mostViewed",
        title: "💬 Mais visualizados",
        subtitle: "O que todo mundo está de olho",
        gatilho: GATILHOS_MAP.mostViewed,
        items,
        seeMoreLink: `/explorar?section=most-viewed`,
    }
}

// 11. 🧰 Serviços perto de você
async function fetchServices(partnerIds: string[], ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()

    const { data } = await supabase
        .from("services")
        .select(`
            id, name, price, images, rating,
            partners!inner(id, store_name, store_image_url, latitude, longitude)
        `)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", partnerIds)
        .order("rating", { ascending: false })
        .limit(20)

    if (!data || data.length < 4) return null

    const items = data.map((item: any) => {
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
        seeMoreLink: `/explorar?type=servicos`,
    }
}

// 12. Produtos populares (fallback)
async function fetchPopular(partnerIds: string[], ctx: DiscoverCtx): Promise<HomeSection | null> {
    const supabase = getAdminClient()

    const { data } = await supabase
        .from("products")
        .select(`
            id, name, price, promotional_price, images, rating,
            marketplace_score,
            partners!inner(id, store_name, store_image_url, latitude, longitude)
        `)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .in("partner_id", partnerIds)
        .order("marketplace_score", { ascending: false })
        .limit(20)

    if (!data || data.length < 4) return null

    const items = (data as RawProduct[]).map(item => processProduct(item))

    return {
        id: "popular",
        title: "🔥 Populares na sua região",
        subtitle: "O que está bombando por aqui",
        gatilho: GATILHOS_MAP.popular,
        items,
        seeMoreLink: `/explorar?section=popular`,
    }
}

// ─── SECTION DEFINITIONS (used for dynamic selection) ────────────────────────

interface SectionDef {
    id: string
    gatilho: string
    priority: "high" | "medium" | "fallback"
    fetch: (partnerIds: string[], ctx: DiscoverCtx) => Promise<HomeSection | null>
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

// ─── MAIN ENTRY POINT ───────────────────────────────────────────────────────

export async function getHomeSections(ctx: DiscoverCtx): Promise<HomeSection[]> {
    const t0 = performance.now()
    console.log(`[Discover] START | city=${ctx.city}, state=${ctx.state}, user=${ctx.userId ? "logged" : "anon"}`)

    // 1. Fetch partner IDs for city
    const partnerIds = await getCityPartnerIds(ctx.city, ctx.state, ctx.stateOnly)

    if (partnerIds.length === 0) {
        console.log(`[Discover] No partners found in ${ctx.city}/${ctx.state}`)
        return []
    }

    // 2. FASE 1: Fetch all HIGH sections in parallel
    const highResults = await Promise.allSettled(
        HIGH_SECTIONS.map(s => s.fetch(partnerIds, ctx)),
    )

    let pool: HomeSection[] = []
    const usedGatilhos = new Set<string>()

    for (let i = 0; i < HIGH_SECTIONS.length; i++) {
        const result = highResults[i]
        if (result.status === "fulfilled" && result.value) {
            pool.push(result.value)
            usedGatilhos.add(result.value.gatilho)
        } else if (result.status === "rejected") {
            console.warn(`[Discover] Section ${HIGH_SECTIONS[i].id} failed:`, result.reason)
        }
    }

    console.log(`[Discover] Phase 1 (HIGH): ${pool.length}/5 sections valid`)

    // 3. Decide 6th section
    let sixthSection: HomeSection | null = null

    // Try personalized for logged users with signals
    if (ctx.userId) {
        const persResult = await fetchPersonalized(partnerIds, ctx)
        if (persResult) {
            sixthSection = persResult
        }
    }

    // If no personalized, rotate among MEDIUM sections with different gatilho
    if (!sixthSection) {
        const seed = dailySeed(ctx.userId)
        const available = MEDIUM_SECTIONS.filter(s => !usedGatilhos.has(s.gatilho))
        const shuffled = seededShuffle(available, `${seed}-sixth`)

        for (const def of shuffled) {
            const result = await def.fetch(partnerIds, ctx).catch(() => null)
            if (result && result.items.length >= 4) {
                sixthSection = result
                break
            }
        }
    }

    // If pool is still < 5, try to fill with MEDIUM sections (any gatilho)
    if (pool.length < 5) {
        const seed = dailySeed(ctx.userId)
        const usedIds = new Set(pool.map(s => s.id))
        const available = MEDIUM_SECTIONS.filter(s => !usedIds.has(s.id))
        const shuffled = seededShuffle(available, `${seed}-medium`)

        for (const def of shuffled) {
            if (pool.length >= 5) break
            if (usedGatilhos.has(def.gatilho) && pool.length >= 4) continue

            // Skip personalized since we already tried it above
            if (def.id === "personalized") continue

            const result = await def.fetch(partnerIds, ctx).catch(() => null)
            if (result && result.items.length >= 4) {
                pool.push(result)
                usedGatilhos.add(result.gatilho)
            }
        }
    }

    // If still < 5, try FALLBACK
    if (pool.length < 5) {
        for (const def of FALLBACK_SECTIONS) {
            if (pool.length >= 5) break
            const result = await def.fetch(partnerIds, ctx).catch(() => null)
            if (result && result.items.length >= 4) {
                pool.push(result)
            }
        }
    }

    // 4. Seeded shuffle the sections (preserving sixth as last)
    if (pool.length > 0) {
        const seed = dailySeed(ctx.userId)
        pool = seededShuffle(pool, seed)
    }

    // 5. Append sixth section at the end (no shuffle)
    if (sixthSection && sixthSection.items.length >= 4) {
        // Dedup items between pool and sixth
        const seen = new Set<string>()
        for (const section of pool) {
            for (const item of section.items) seen.add(item.id)
        }
        sixthSection.items = sixthSection.items.filter((item: any) => !seen.has(item.id))
        if (sixthSection.items.length >= 4) {
            pool.push(sixthSection)
        }
    }

    // 6. Global deduplication: ensure no item appears in multiple sections
    const globalSeen = new Set<string>()
    const finalSections: HomeSection[] = []

    for (const section of pool) {
        const deduped = section.items.filter((item: any) => {
            if (globalSeen.has(item.id)) return false
            globalSeen.add(item.id)
            return true
        })
        if (deduped.length >= 4) {
            finalSections.push({ ...section, items: deduped.slice(0, 20) })
        }
    }

    // Enforce limits
    const result = finalSections.slice(0, 6)

    const t1 = performance.now()
    console.log(`[Discover] END | ${result.length} sections | ${(t1 - t0).toFixed(0)}ms`)
    console.log(`[Discover] Sections: ${result.map(s => s.title).join(" | ")}`)

    return result
}
