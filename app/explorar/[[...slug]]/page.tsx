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
import { QueryClient, dehydrate } from "@tanstack/react-query"
import { HydrationBoundary } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"

const CATEGORY_SLUG_MAP: { [key: string]: string } = {
    "casa-e-utilidades": "Casa & Utilidades",
    "moda-e-beleza": "Moda & Beleza",
    "saude-e-bem-estar": "Saúde & Bem-estar",
    "tecnologia-e-eletronicos": "Tecnologia & Eletrônicos",
    "auto-e-moto": "Auto & Moto",
    "pets": "Pets",
    "construcao-e-ferramentas": "Construção & Ferramentas",
    "agro-e-jardim": "Agro & Jardim",
    "infantil-e-brinquedos": "Infantil & Brinquedos",
    "alimentacao": "Alimentação",
    "outros": "Outros"
}

const ESTADO_MAP: Record<string, string> = {
    ac: "Acre", al: "Alagoas", ap: "Amapá", am: "Amazonas",
    ba: "Bahia", ce: "Ceará", df: "Distrito Federal",
    es: "Espírito Santo", go: "Goiás", ma: "Maranhão",
    mt: "Mato Grosso", ms: "Mato Grosso do Sul", mg: "Minas Gerais",
    pa: "Pará", pb: "Paraíba", pr: "Paraná", pe: "Pernambuco",
    pi: "Piauí", rj: "Rio de Janeiro", rn: "Rio Grande do Norte",
    rs: "Rio Grande do Sul", ro: "Rondônia", rr: "Roraima",
    sc: "Santa Catarina", sp: "São Paulo", se: "Sergipe", to: "Tocantins",
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug?: string[] }>
}): Promise<Metadata> {
    const resolvedParams = await params
    const slug = resolvedParams.slug || []
    const [location, category] = slug

    const categoryName = category ? (CATEGORY_SLUG_MAP[category] || category.replace(/-/g, " ")) : null

    // Build canonical URL without query params
    const pathParts = slug.length > 0 ? ["/explorar", ...slug] : ["/explorar"]
    const canonical = `https://dudit.com.br${pathParts.join("/")}`

    // Base site name for OG
    const ogSiteName = "Dudit"

    // --- CASE 1: /explorar (no slug) ---
    if (!location) {
        const title = "Explorar - Produtos e serviços perto de você"
        const description =
            "Descubra produtos, serviços e negócios perto de você. Explore, compare e compre direto de quem vende na sua cidade."
        return {
            title,
            description,
            robots: { index: true, follow: true },
            alternates: { canonical },
            openGraph: {
                title: `Explorar | ${ogSiteName}`,
                description,
                url: canonical,
                siteName: ogSiteName,
            },
            twitter: {
                card: "summary_large_image",
                title: `Explorar | ${ogSiteName}`,
                description,
            },
        }
    }

    // --- CASE 2: /explorar/brasil or /explorar/brasil/[categoria] ---
    if (location === "brasil") {
        if (categoryName) {
            const title = `${categoryName} no Brasil inteiro`
            const description =
                `Encontre ${categoryName.toLowerCase()} em todo o Brasil. Compre direto de quem vende, sem taxa e sem sair de casa.`
            return {
                title,
                description,
                robots: { index: true, follow: true },
                alternates: { canonical },
                openGraph: {
                    title: `${title} | ${ogSiteName}`,
                    description,
                    url: canonical,
                    siteName: ogSiteName,
                },
                twitter: {
                    card: "summary_large_image",
                    title: `${title} | ${ogSiteName}`,
                    description,
                },
            }
        }

        const title = "Comprar no Brasil inteiro - Produtos e serviços"
        const description =
            "Encontre produtos e serviços em todo o Brasil. Compre de quem vende perto de você, direto e sem taxa."
        return {
            title,
            description,
            robots: { index: true, follow: true },
            alternates: { canonical },
            openGraph: {
                title: `${title} | ${ogSiteName}`,
                description,
                url: canonical,
                siteName: ogSiteName,
            },
            twitter: {
                card: "summary_large_image",
                title: `${title} | ${ogSiteName}`,
                description,
            },
        }
    }

    // --- CASE 3: /explorar/estado-[uf] or /explorar/estado-[uf]/[categoria] ---
    const isEstado = location.startsWith("estado-")
    if (isEstado) {
        const uf = location.replace("estado-", "").toLowerCase()
        const estadoNome = ESTADO_MAP[uf] || uf.toUpperCase()

        if (categoryName) {
            const title = `${categoryName} em ${estadoNome}`
            const description =
                `Encontre ${categoryName.toLowerCase()} em ${estadoNome}. Compre de quem vende perto de você, sem taxa.`
            return {
                title,
                description,
                robots: { index: true, follow: true },
                alternates: { canonical },
                openGraph: {
                    title: `${title} | ${ogSiteName}`,
                    description,
                    url: canonical,
                    siteName: ogSiteName,
                },
                twitter: {
                    card: "summary_large_image",
                    title: `${title} | ${ogSiteName}`,
                    description,
                },
            }
        }

        const title = `Comprar em ${estadoNome} - Produtos e serviços`
        const description =
            `Encontre produtos e serviços em ${estadoNome}. Compre de quem vende perto de você, direto e sem taxa.`
        return {
            title,
            description,
            robots: { index: true, follow: true },
            alternates: { canonical },
            openGraph: {
                title: `${title} | ${ogSiteName}`,
                description,
                url: canonical,
                siteName: ogSiteName,
            },
            twitter: {
                card: "summary_large_image",
                title: `${title} | ${ogSiteName}`,
                description,
            },
        }
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
        const title = `${categoryName} em ${cidadeDisplay}`
        const description =
            `Encontre ${categoryName.toLowerCase()} em ${cidadeDisplay}. Compre de quem vende perto de você, sem taxa.`
        return {
            title,
            description,
            robots: { index: true, follow: true },
            alternates: { canonical },
            openGraph: {
                title: `${title} | ${ogSiteName}`,
                description,
                url: canonical,
                siteName: ogSiteName,
            },
            twitter: {
                card: "summary_large_image",
                title: `${title} | ${ogSiteName}`,
                description,
            },
        }
    }

    const title = `Comprar em ${cidadeDisplay} - Produtos e serviços`
    const description =
        `Encontre produtos e serviços em ${cidadeDisplay}. Compre de quem vende perto de você, direto e sem taxa.`
    return {
        title,
        description,
        robots: { index: true, follow: true },
        alternates: { canonical },
        openGraph: {
            title: `${title} | ${ogSiteName}`,
            description,
            url: canonical,
            siteName: ogSiteName,
        },
        twitter: {
            card: "summary_large_image",
            title: `${title} | ${ogSiteName}`,
            description,
        },
    }
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
    const routeFirstSlug = routeSlugs[0] || ""

    const user = await getCurrentUser()
    const sessionData = user
        ? await getUserSessionData(user.id)
        : null

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
        }
        : null

    const query = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : ""
    const type = parseMarketplaceType(resolvedSearchParams.type)
    const section = typeof resolvedSearchParams.section === "string" ? resolvedSearchParams.section : undefined

    const hasSearchIntent = !!query
        || type !== "tudo"
        || !!section
        || typeof resolvedSearchParams.radius === "string"
        || typeof resolvedSearchParams.categoria === "string"

    const normalizeCityToSlug = (city: string, state: string) => {
        const normCity = city
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
        return `${normCity}-${state.toLowerCase()}`
    }

    // Modo navegação (sem slug na rota e sem intenção de busca): redireciona para a
    // localização do usuário (cidade do perfil, cookie ou Brasil), preservando SEO.
    if (!routeFirstSlug && !hasSearchIntent) {
        let redirectSlug: string | null = null

        // 1. Check user profile (logged in WITH address)
        if (userProfile?.city && userProfile?.state) {
            redirectSlug = normalizeCityToSlug(userProfile.city, userProfile.state)
        }
        // 2. Logged-in users WITHOUT address: stay on /explorar (Brasil)
        // 3. Check cookie (only for logged-out visitors with saved location)
        else if (!userProfile) {
            const cookieStore = await cookies()
            const savedCity = cookieStore.get("dudit_city")?.value
            if (savedCity && savedCity !== "brasil" && !savedCity.startsWith("estado-")) {
                redirectSlug = savedCity
            }
        }

        redirect(redirectSlug ? `/explorar/${redirectSlug}` : "/explorar/brasil")
    }

    // Com busca (?q=, type, section...), permanece em /explorar e resolve o escopo para a
    // cidade do usuário (perfil → cookie → Brasil), mantendo o ?q= na URL.
    let slug = routeSlugs
    let firstSlug = routeFirstSlug
    if (!firstSlug) {
        let scopeSlug: string | null = null

        if (userProfile?.city && userProfile?.state) {
            scopeSlug = normalizeCityToSlug(userProfile.city, userProfile.state)
        } else if (!userProfile) {
            const cookieStore = await cookies()
            const savedCity = cookieStore.get("dudit_city")?.value
            if (savedCity && savedCity !== "brasil" && !savedCity.startsWith("estado-")) {
                scopeSlug = savedCity
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
    const categoria = categorySlug ? (CATEGORY_SLUG_MAP[categorySlug] || categorySlug) : ""

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
    const { items: exploreItems, moreDistantSellers, moreDistantItems } = await getCachedExploreProducts(query, serverFetchType, searchSlug, section)

    let resolvedCityName: string | null = null
    if (cidade && cidade !== "brasil" && !cidade.startsWith("estado-")) {
        const resolved = await resolveCityAndStateFromSlug(cidade)
        if (resolved) {
            resolvedCityName = `${resolved.city} - ${resolved.state}`
        }
    }

    const cartCount = sessionData?.cartCount || 0

    let refCoords = userProfile?.latitude && userProfile?.longitude
        ? { lat: userProfile.latitude, lng: userProfile.longitude }
        : null
    if (!refCoords && searchSlug) {
        refCoords = await resolveCityCoordsFromSlug(searchSlug)
    }

    const productsWithDistance = enrichMarketplaceDistance(exploreItems || [], refCoords)
    const moreDistantSellersWithDistance = enrichMarketplaceDistance(moreDistantSellers || [], refCoords)
    const moreDistantItemsWithDistance = enrichMarketplaceDistance(moreDistantItems || [], refCoords)


    // Resolução de localização para anúncios:
    // 1. Se a rota for uma cidade específica (ex: /explorar/franca-sp), prioriza a cidade da rota.
    // 2. Se for estado (ex: /explorar/estado-sp), filtra pelo estado.
    // 3. Se for busca nacional / Brasil (/explorar/brasil ou /explorar), usa a localização real do usuário (perfil ou cookie dudit_city).
    let userCitySlug: string | null = null
    let userCityName: string | null = userProfile?.city || null
    let userStateName: string | null = userProfile?.state || null
    let userLat: number | null = userProfile?.latitude ?? null
    let userLng: number | null = userProfile?.longitude ?? null

    if (userProfile?.city && userProfile?.state) {
        const normCity = userProfile.city
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
        userCitySlug = `${normCity}-${userProfile.state.toLowerCase()}`
    } else {
        const cookieStore = await cookies()
        const cookieCity = cookieStore.get("dudit_city")?.value
        if (cookieCity && cookieCity !== "brasil" && !cookieCity.startsWith("estado-")) {
            userCitySlug = cookieCity
            const resolved = await resolveCityAndStateFromSlug(cookieCity)
            if (resolved) {
                userCityName = resolved.city
                userStateName = resolved.state
            }
            if (!userLat || !userLng) {
                const cookieCoords = await resolveCityCoordsFromSlug(cookieCity)
                if (cookieCoords) {
                    userLat = cookieCoords.lat
                    userLng = cookieCoords.lng
                }
            }
        }
    }

    const isSpecificCityRoute = cidade && cidade !== "brasil" && !cidade.startsWith("estado-")

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

    const [exploreAds, searchAds, communityVideosData] = await Promise.all([
        getSponsoredAdsForSlot("explore", adLocation),
        query ? getSponsoredAdsForSlot("search", adLocation) : Promise.resolve([] as SponsoredAd[]),
        getCommunityVideos(),
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

    // TanStack Query Hydration: pre-populate cache with server data
    const queryClient = new QueryClient()
    const radius = typeof resolvedSearchParams.radius === "string" ? Number(resolvedSearchParams.radius) : undefined
    const queryKey = ["explore", query, serverFetchType, searchSlug, radius, section]

    queryClient.setQueryData(queryKey, {
        pages: [{
            items: productsWithDistance || [],
            nextCursor: (productsWithDistance && productsWithDistance.length > 0) ? productsWithDistance[productsWithDistance.length - 1]?.id : null,
            hasMore: (productsWithDistance && productsWithDistance.length >= 40)
        }],
        pageParams: [null]
    })

    const dehydratedState = dehydrate(queryClient)

    return (
        <div className="min-h-screen bg-white dark:bg-dark-background pt-[40px] lg:pt-[110px] font-sans flex flex-col">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(breadcrumbLd) }}
            />
            <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />

            <HydrationBoundary state={dehydratedState}>
                <Suspense fallback={
                        <div className="min-h-screen bg-white dark:bg-dark-background pt-[40px] lg:pt-[110px] font-sans flex flex-col items-center justify-center">
                            <ThreeDotsLoader />
                        </div>
                    }>
                    <ExplorarPageClient
                        initialResults={productsWithDistance}
                        initialMoreDistantSellers={moreDistantSellersWithDistance}
                        initialMoreDistantItems={moreDistantItemsWithDistance}
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
            </HydrationBoundary>

            <MarketplaceFooter />
        </div>
    )
}
