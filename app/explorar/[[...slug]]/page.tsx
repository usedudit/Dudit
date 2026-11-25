import { Suspense } from "react"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import { ExplorarPageClient } from "@/components/marketplace/ExplorarPageClient"
import { getCachedExploreProducts, resolveCityAndStateFromSlug } from "@/app/actions/marketplace/products"
import { resolveCityCoordsFromSlug } from "@/app/actions/marketplace/search"
import { getCommunityVideos } from "@/app/actions/marketplace/community-videos"
import type { Metadata } from "next"
import { getCurrentUser } from "@/lib/auth/authorization"
import { parseMarketplaceType } from "@/lib/types/marketplace"
import { getUserSessionData } from "@/lib/data/user"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"
import { enrichMarketplaceDistance } from "@/lib/services/location.service"
import { getSponsoredAdsForSlot } from "@/app/actions/marketplace/ads"
import type { SponsoredAd } from "@/lib/ads/types"
import ThreeDotsLoader from "@/components/reusable/ThreeDotsLoader"
import { cookies } from "next/headers"
import { FALLBACK_CATEGORIES, ESTADO_MAP, CATEGORY_SLUG_MAP } from "@/components/marketplace/explorar-constants"
import { FormSection } from "@/components/reusable/FormSection"
import { ListItem } from "@/components/reusable/ListItem"
import { notFound } from "next/navigation"
import { isValidCitySlug } from "@/lib/validation/city"
import { IntentPrefetchLink } from "@/components/navigation/IntentPrefetchLink"

function isValidLocationSlug(slug: string): boolean {
    if (!slug) return false
    if (slug === "brasil") return true
    if (slug.startsWith("estado-")) {
        const uf = slug.replace("estado-", "").toLowerCase()
        return !!ESTADO_MAP[uf]
    }
    return isValidCitySlug(slug)
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug?: string[] }>
}): Promise<Metadata> {
    const resolvedParams = await params
    const slug = resolvedParams.slug || []
    if (slug.length > 2) {
        return {
            title: "Página não encontrada",
            robots: { index: false, follow: false },
        }
    }

    const [location, category] = slug

    if (location && !isValidLocationSlug(location)) {
        return {
            title: "Página não encontrada",
            robots: { index: false, follow: false },
        }
    }

    if (category && !CATEGORY_SLUG_MAP[category]) {
        return {
            title: "Página não encontrada",
            robots: { index: false, follow: false },
        }
    }

    const categoryName = category ? (CATEGORY_SLUG_MAP[category] || category.replace(/-/g, " ")) : null

    // Build canonical URL without query params
    const pathParts = slug.length > 0 ? ["/explorar", ...slug] : ["/explorar"]
    const canonical = `https://dudit.com.br${pathParts.join("/")}`

    // Base site name and OG image
    const ogSiteName = "Dudit"
    const defaultOgImage = "https://img.dudit.com.br/static/og-image.png"

    const buildExploreMetadata = (title: string, description: string, ogTitle?: string): Metadata => {
        const resolvedOgTitle = ogTitle || `${title} | ${ogSiteName}`
        return {
            title,
            description,
            robots: { index: true, follow: true },
            alternates: { canonical },
            openGraph: {
                title: resolvedOgTitle,
                description,
                url: canonical,
                siteName: ogSiteName,
                locale: "pt_BR",
                type: "website",
                images: [
                    {
                        url: defaultOgImage,
                        width: 1200,
                        height: 630,
                        alt: resolvedOgTitle,
                    },
                ],
            },
            twitter: {
                card: "summary_large_image",
                title: resolvedOgTitle,
                description,
                images: [defaultOgImage],
            },
        }
    }

    // --- CASE 1: /explorar (no slug) ---
    if (!location) {
        return buildExploreMetadata(
            "Explorar - Produtos e serviços perto de você",
            "Descubra produtos, serviços e negócios perto de você. Explore, compare e compre direto de quem vende na sua cidade.",
            `Explorar | ${ogSiteName}`
        )
    }

    // --- CASE 2: /explorar/brasil or /explorar/brasil/[categoria] ---
    if (location === "brasil") {
        if (categoryName) {
            return buildExploreMetadata(
                `${categoryName} no Brasil inteiro`,
                `Encontre ${categoryName.toLowerCase()} em todo o Brasil. Compre direto de quem vende, sem taxa e sem sair de casa.`
            )
        }

        return buildExploreMetadata(
            "Comprar no Brasil inteiro - Produtos e serviços",
            "Encontre produtos e serviços em todo o Brasil. Compre de quem vende perto de você, direto e sem taxa."
        )
    }

    // --- CASE 3: /explorar/estado-[uf] or /explorar/estado-[uf]/[categoria] ---
    const isEstado = location.startsWith("estado-")
    if (isEstado) {
        const uf = location.replace("estado-", "").toLowerCase()
        const estadoNome = ESTADO_MAP[uf] || uf.toUpperCase()

        if (categoryName) {
            return buildExploreMetadata(
                `${categoryName} em ${estadoNome}`,
                `Encontre ${categoryName.toLowerCase()} em ${estadoNome}. Compre de quem vende perto de você, sem taxa.`
            )
        }

        return buildExploreMetadata(
            `Comprar em ${estadoNome} - Produtos e serviços`,
            `Encontre produtos e serviços em ${estadoNome}. Compre de quem vende perto de você, direto e sem taxa.`
        )
    }

    let cidadeDisplay = ""
    const resolvedCity = await resolveCityAndStateFromSlug(location)
    if (resolvedCity) {
        cidadeDisplay = `${resolvedCity.city}, ${resolvedCity.state}`
    } else {
        const cityNameRaw = location
            .split("-")
            .slice(0, -1)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ")
        const stateUf = location.split("-").pop()?.toUpperCase() || ""
        cidadeDisplay = `${cityNameRaw}, ${stateUf}`
    }

    if (categoryName) {
        return buildExploreMetadata(
            `${categoryName} em ${cidadeDisplay}`,
            `Encontre ${categoryName.toLowerCase()} em ${cidadeDisplay}. Compre de quem vende perto de você, sem taxa.`
        )
    }

    return buildExploreMetadata(
        `Comprar em ${cidadeDisplay} - Produtos e serviços`,
        `Encontre produtos e serviços em ${cidadeDisplay}. Compre de quem vende perto de você, direto e sem taxa.`
    )
}

export default async function ExplorarPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug?: string[] }>
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const resolvedParams = await params
    const resolvedSearchParams = await searchParams

    const routeSlugs = resolvedParams.slug || []
    if (routeSlugs.length > 2) {
        notFound()
    }

    const routeFirstSlug = routeSlugs[0] || ""
    if (routeFirstSlug && !isValidLocationSlug(routeFirstSlug)) {
        notFound()
    }

    const routeCategorySlug = routeSlugs[1] || ""
    if (routeCategorySlug && !CATEGORY_SLUG_MAP[routeCategorySlug]) {
        notFound()
    }

    const query = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : ""
    const type = parseMarketplaceType(resolvedSearchParams.type)
    const section = typeof resolvedSearchParams.section === "string" ? resolvedSearchParams.section : undefined

    const hasSearchIntent = !!query
        || type !== "tudo"
        || !!section
        || typeof resolvedSearchParams.categoria === "string"
        // Filtros aplicados (preço, promoção, avaliação, raio...) também são
        // "intenção de busca": sem isso, um link compartilhado com filtros
        // cairia na landing page e perderia tudo o que o usuário escolheu.
        || ["preco_min", "preco_max", "promo", "cond", "envio", "avaliacao", "entrega", "raio", "vitrine", "ord"]
            .some((key) => resolvedSearchParams[key] !== undefined)

    const normalizeCityToSlug = (city: string, state: string) => {
        const normCity = city
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
        return `${normCity}-${state.toLowerCase()}`
    }

    // Inicia a sessão do usuário em segundo plano de forma paralela
    const userSessionPromise = getCurrentUser()
        .then(async (user) => {
            if (!user) return null
            const sessionData = await getUserSessionData(user.id)
            return { user, sessionData }
        })
        .catch(() => null)

    // Landing page: sem slug na rota e sem intenção de busca → renderiza cards de categorias
    if (!routeFirstSlug && !hasSearchIntent) {
        const sessionResult = await userSessionPromise
        const user = sessionResult?.user || null
        const sessionData = sessionResult?.sessionData || null

        const userProfile = sessionData?.profile
            ? {
                full_name: sessionData.profile.full_name,
                latitude: sessionData.profile.latitude,
                longitude: sessionData.profile.longitude,
                address: sessionData.profile.city
                    ? `${sessionData.profile.city} - ${sessionData.profile.state}`
                    : null,
                city: sessionData.profile.city || null,
                state: sessionData.profile.state || null,
                avatar_url: sessionData.profile.avatar_url || null,
                userId: user?.id || null,
            }
            : null

        const cartCount = sessionData?.cartCount || 0

        // Resolve city for category links (cookie → profile → brasil)
        let landingCitySlug = "brasil"
        const cookieStore = await cookies()
        const savedCity = cookieStore.get("dudit_city")?.value
        if (savedCity) {
            landingCitySlug = savedCity
        } else if (userProfile?.city && userProfile?.state) {
            landingCitySlug = normalizeCityToSlug(userProfile.city, userProfile.state)
        }

        return (
            <div className="min-h-screen bg-white dark:bg-dark-background pt-[40px] lg:pt-[110px] font-sans flex flex-col">
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: safeJsonLdStringify({
                            "@context": "https://schema.org",
                            "@type": "CollectionPage",
                            name: "Explorar | Dudit",
                            description: "Descubra produtos, serviços e negócios perto de você.",
                            url: "https://dudit.com.br/explorar",
                        })
                    }}
                />
                <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />

                <main className="flex-1 max-w-7xl mx-auto w-full px-4 lg:px-8 py-8 lg:py-12 pb-24 lg:pb-12">
                    <div className="mb-8 lg:mb-10">
                        <h1 className="text-2xl lg:text-4xl font-bold text-brand-dark dark:text-dark-heading">
                            Explore por categoria
                        </h1>
                    </div>

                    {(() => {
                        const productCategories = FALLBACK_CATEGORIES.filter(cat => cat.slug !== "servicos")
                        const serviceCategory = FALLBACK_CATEGORIES.find(cat => cat.slug === "servicos")

                        return (
                            <>
                                <FormSection title="Categorias de Produtos" className="mb-8">
                                    {productCategories.map((cat) => {
                                        const href = `/explorar/${landingCitySlug}/${cat.slug}`
                                        return (
                                            <div className="space-y-6">
                                                <IntentPrefetchLink key={cat.slug} href={href}>
                                                    <ListItem
                                                        icon={
                                                            cat.icon_url ? (
                                                                <img
                                                                    src={cat.icon_url}
                                                                    alt={cat.name}
                                                                    className="w-6 h-6 object-contain"
                                                                />
                                                            ) : (
                                                                <span className="text-lg">📦</span>
                                                            )
                                                        }
                                                        className="px-4 py-3"
                                                        title={cat.name}
                                                        showChevron
                                                    />
                                                </IntentPrefetchLink>
                                            </div>
                                        )
                                    })}
                                </FormSection>

                                {serviceCategory && (
                                    <FormSection title="Categorias de Serviços" hasSeparator>
                                        <div className="space-y-6">
                                            <IntentPrefetchLink href={`/explorar/${landingCitySlug}?type=servicos`}>
                                                <ListItem
                                                    icon={
                                                        serviceCategory.icon_url ? (
                                                            <img
                                                                src={serviceCategory.icon_url}
                                                                alt={serviceCategory.name}
                                                                className="w-6 h-6 object-contain"
                                                            />
                                                        ) : (
                                                            <span className="text-lg">🔧</span>
                                                        )
                                                    }
                                                    className="px-4 py-3"
                                                    title={serviceCategory.name}
                                                    showChevron
                                                />
                                            </IntentPrefetchLink>
                                        </div>
                                    </FormSection>
                                )}
                            </>
                        )
                    })()}
                </main>

                <MarketplaceFooter />
            </div>
        )
    }

    // Com busca (?q=, type, section...), permanece em /explorar e resolve o escopo para a
    // cidade do usuário (perfil → cookie → Brasil), mantendo o ?q= na URL.
    let slug = routeSlugs
    let firstSlug = routeFirstSlug
    let initialUserProfilePromise = userSessionPromise.then((res) => {
        const user = res?.user || null
        const sessionData = res?.sessionData || null
        return {
            userProfile: sessionData?.profile
                ? {
                    full_name: sessionData.profile.full_name,
                    latitude: sessionData.profile.latitude,
                    longitude: sessionData.profile.longitude,
                    address: sessionData.profile.city
                        ? `${sessionData.profile.city} - ${sessionData.profile.state}`
                        : null,
                    city: sessionData.profile.city || null,
                    state: sessionData.profile.state || null,
                    avatar_url: sessionData.profile.avatar_url || null,
                    userId: user?.id || null,
                }
                : null,
            cartCount: sessionData?.cartCount || 0,
        }
    })

    if (!firstSlug) {
        let scopeSlug: string | null = null
        const cookieStore = await cookies()
        const savedCity = cookieStore.get("dudit_city")?.value

        if (savedCity) {
            scopeSlug = savedCity
        } else {
            const { userProfile } = await initialUserProfilePromise
            if (userProfile?.city && userProfile?.state) {
                scopeSlug = normalizeCityToSlug(userProfile.city, userProfile.state)
            }
        }

        firstSlug = scopeSlug || "brasil"
        slug = [firstSlug]
    }

    // Detecta se é um estado (formato: "estado-sp") ou uma cidade
    const isStateRoute = firstSlug.startsWith("estado-")
    const stateSlug = isStateRoute ? firstSlug : null
    const cidade = !isStateRoute ? firstSlug : ""

    const categorySlug = slug[1] || ""
    const categoriaFromPath = categorySlug ? (CATEGORY_SLUG_MAP[categorySlug] || categorySlug) : ""
    const categoriaFromQuery = typeof resolvedSearchParams.categoria === "string" ? resolvedSearchParams.categoria : ""
    const categoria = categoriaFromPath || categoriaFromQuery

    const serverFetchType = type

    // Map section to a display title
    const sectionTitles: Record<string, string> = {
        trending: "🔥 Bombando na sua região",
        "ending-soon": "⏰ Acabando hoje",
        nearby: "📍 Perto de você",
        recent: "🆕 Recém anunciados",
        gems: "💎 Achados da Dudit",
        "for-you": "👀 Para você",
        "best-sellers": "⭐ Mais vendidos",
        "top-rated": "🏆 Melhor avaliados",
        promos: "🎯 Promoções especiais",
        "most-viewed": "💬 Mais visualizados",
        popular: "🔥 Populares",
        products: "🛍️ Produtos",
        businesses: "🏢 Negócios",
        "well-rated": "⭐ Bem avaliados",
        "on-offer": "🎯 Em oferta",
        "high-demand": "🔥 Em alta",
        "newly-announced": "🆕 Novos anunciados",
    }
    const sectionTitle = section ? sectionTitles[section] || "Explorar" : undefined

    // Para estados, passa apenas o slug do estado; a função searchMarketplaceByCity filtrará por estado
    const searchSlug = stateSlug ? stateSlug : cidade
    const isSpecificCityRoute = cidade && cidade !== "brasil" && !cidade.startsWith("estado-")

    // Coordenadas preliminares da cidade da rota (sem bloquear a busca de produtos)
    const cityCoordsPromise = searchSlug && isSpecificCityRoute
        ? resolveCityCoordsFromSlug(searchSlug).catch(() => null)
        : Promise.resolve(null)

    // Tudo que não depende um do outro sobe em paralelo: busca, nome da cidade,
    // coordenadas, escopo do cookie e vídeos da comunidade.
    const explorePromise = getCachedExploreProducts(query, serverFetchType, searchSlug, section)
        .then((fetched) => ({
            items: fetched.items || [],
            moreDistantSellers: fetched.moreDistantSellers || [],
            moreDistantItems: fetched.moreDistantItems || [],
            searchIntent: fetched.searchIntent ?? null,
            proximityRings: fetched.proximityRings ?? null,
        }))
        .catch((err) => {
            console.error("[ExplorarPage] Error fetching explore products:", err)
            return {
                items: [] as any[],
                moreDistantSellers: [] as any[],
                moreDistantItems: [] as any[],
                searchIntent: null,
                proximityRings: null,
            }
        })

    const cityPromise: Promise<{ city: string; state: string } | null> = isSpecificCityRoute
        ? resolveCityAndStateFromSlug(cidade).catch(() => null)
        : Promise.resolve(null)

    const cookieScopePromise = (async () => {
        // Se a rota já for uma cidade específica ou estado, escopo de cookie não é necessário para a listagem
        if (isSpecificCityRoute || isStateRoute) return null
        const { userProfile } = await initialUserProfilePromise
        if (userProfile?.city && userProfile?.state) return null
        const cookieStore = await cookies()
        const cookieCity = cookieStore.get("dudit_city")?.value
        if (!cookieCity || cookieCity === "brasil" || cookieCity.startsWith("estado-")) return null
        const needsCoords = !userProfile?.latitude || !userProfile?.longitude
        const [resolved, coords] = await Promise.all([
            resolveCityAndStateFromSlug(cookieCity).catch(() => null),
            needsCoords ? resolveCityCoordsFromSlug(cookieCity).catch(() => null) : Promise.resolve(null),
        ])
        return { cookieCity, resolved, coords }
    })()

    const videosPromise = getCommunityVideos(searchSlug || undefined)
        .catch((err) => {
            console.error("[ExplorarPage] Error fetching community videos:", err)
            return { items: [] as Awaited<ReturnType<typeof getCommunityVideos>>["items"], nextCursor: null, hasMore: false }
        })

    const [
        fetched,
        resolvedCity,
        cityCoordsResolved,
        cookieScope,
        communityVideosData,
        userSessionRes,
    ] = await Promise.all([
        explorePromise,
        cityPromise,
        cityCoordsPromise,
        cookieScopePromise,
        videosPromise,
        initialUserProfilePromise,
    ])

    const userProfile = userSessionRes.userProfile
    const cartCount = userSessionRes.cartCount

    let exploreItems: any[] = fetched.items
    let moreDistantSellers: any[] = fetched.moreDistantSellers
    let moreDistantItems: any[] = fetched.moreDistantItems

    let resolvedCityName: string | null = resolvedCity ? `${resolvedCity.city} - ${resolvedCity.state}` : null

    // Coordenadas de referência: perfil do usuário tem prioridade, depois coordenadas da cidade da rota
    const refCoords = (userProfile?.latitude && userProfile?.longitude)
        ? { lat: userProfile.latitude, lng: userProfile.longitude }
        : cityCoordsResolved

    let productsWithDistance = exploreItems
    let moreDistantSellersWithDistance = moreDistantSellers
    let moreDistantItemsWithDistance = moreDistantItems

    // Se o backend não tiver calculado distância ou novas coordenadas de perfil estiverem disponíveis:
    if (refCoords && productsWithDistance.length > 0 && productsWithDistance[0]?.partners?.distance_km == null) {
        try {
            productsWithDistance = enrichMarketplaceDistance(exploreItems || [], refCoords)
            moreDistantSellersWithDistance = enrichMarketplaceDistance(moreDistantSellers || [], refCoords)
            moreDistantItemsWithDistance = enrichMarketplaceDistance(moreDistantItems || [], refCoords)
        } catch (err) {
            console.error("[ExplorarPage] Error enriching distances:", err)
        }
    }

    // Resolução de localização para anúncios:
    let userCitySlug: string | null = null
    let userCityName: string | null = userProfile?.city || null
    let userStateName: string | null = userProfile?.state || null
    let userLat: number | null = userProfile?.latitude ?? null
    let userLng: number | null = userProfile?.longitude ?? null

    if (userProfile?.city && userProfile?.state) {
        userCitySlug = normalizeCityToSlug(userProfile.city, userProfile.state)
    } else if (cookieScope) {
        userCitySlug = cookieScope.cookieCity
        if (cookieScope.resolved) {
            userCityName = cookieScope.resolved.city
            userStateName = cookieScope.resolved.state
        }
        if ((!userLat || !userLng) && cookieScope.coords) {
            userLat = cookieScope.coords.lat
            userLng = cookieScope.coords.lng
        }
    }

    let targetCitySlug: string | null = null
    let targetCity: string | null = null
    let targetState: string | null = null
    let targetLat: number | null = userLat
    let targetLng: number | null = userLng

    if (isSpecificCityRoute) {
        targetCitySlug = cidade
        targetCity = resolvedCityName ? resolvedCityName.split(" - ")[0] : null
        targetState = cidade.split("-").pop()?.toUpperCase() || null
        if (!targetLat || !targetLng) {
            targetLat = refCoords?.lat ?? null
            targetLng = refCoords?.lng ?? null
        }
    } else if (isStateRoute && stateSlug) {
        targetState = stateSlug.replace(/^estado-/, "").toUpperCase()
        targetCitySlug = (userStateName?.toUpperCase() === targetState) ? userCitySlug : null
        targetCity = (userStateName?.toUpperCase() === targetState) ? userCityName : null
    } else {
        targetCitySlug = userCitySlug
        targetCity = userCityName
        targetState = userStateName
    }

    const adLocation = {
        lat: targetLat,
        lng: targetLng,
        citySlug: targetCitySlug,
        city: targetCity,
        state: targetState,
    }

    const [exploreAds, searchAds] = await Promise.all([
        getSponsoredAdsForSlot("explore", adLocation),
        query ? getSponsoredAdsForSlot("search", adLocation) : Promise.resolve([] as SponsoredAd[]),
    ])

    // BreadcrumbList Schema
    const breadcrumbItems: { name: string; item: string }[] = [
        { name: "Home", item: "https://dudit.com.br" },
        { name: "Explorar", item: "https://dudit.com.br/explorar" },
    ]

    if (isStateRoute && stateSlug) {
        const uf = stateSlug.replace("estado-", "").toLowerCase()
        const estadoNome = ESTADO_MAP[uf] || uf.toUpperCase()
        breadcrumbItems.push({
            name: estadoNome,
            item: `https://dudit.com.br/explorar/${stateSlug}`,
        })
    } else if (cidade === "brasil") {
        breadcrumbItems.push({
            name: "Brasil",
            item: "https://dudit.com.br/explorar/brasil",
        })
    } else if (routeFirstSlug && cidade) {
        const cidadeNome = cidade
            .split("-")
            .slice(0, -1)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ")
        const uf = cidade.split("-").pop()?.toUpperCase() || ""
        breadcrumbItems.push({
            name: `${cidadeNome}, ${uf}`,
            item: `https://dudit.com.br/explorar/${cidade}`,
        })
    }

    if (categoria) {
        breadcrumbItems.push({
            name: categoria,
            item: `https://dudit.com.br/explorar/${slug.join("/")}`,
        })
    }

    const breadcrumbLd = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbItems.map((item, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: item.name,
            item: item.item,
        })),
    }

    return (
        <div className="min-h-screen bg-white dark:bg-dark-background pt-[40px] lg:pt-[110px] font-sans flex flex-col">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(breadcrumbLd) }}
            />
            <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />

            <Suspense fallback={
                <div className="min-h-screen bg-white dark:bg-dark-background pt-[40px] lg:pt-[110px] font-sans flex flex-col items-center justify-center">
                    <ThreeDotsLoader />
                </div>
            }>
                <ExplorarPageClient
                    initialResults={productsWithDistance}
                    initialMoreDistantSellers={moreDistantSellersWithDistance}
                    initialMoreDistantItems={moreDistantItemsWithDistance}
                    initialSearchIntent={fetched.searchIntent}
                    initialProximityRings={fetched.proximityRings}
                    initialSection={section}
                    query={query}
                    type={type}
                    cidade={searchSlug}
                    resolvedCityName={resolvedCityName}
                    categoria={categoria}
                    sectionTitle={sectionTitle}
                    userProfile={userProfile}
                    cartCount={cartCount}
                    hideHeaderAndFooter={true}
                    exploreAds={exploreAds}
                    searchAds={searchAds}
                    isStateRoute={isStateRoute}
                    communityVideos={communityVideosData.items}
                />
            </Suspense>

            <MarketplaceFooter />
        </div>
    )
}
