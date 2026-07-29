import { Suspense } from "react"
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

    let slug = resolvedParams.slug || []
    let firstSlug = slug[0] || ""

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

    // Server-side redirect: if no city slug in URL, try to redirect to user's city
    if (!firstSlug) {
        let redirectSlug: string | null = null

        // 1. Check user profile (logged in with address)
        if (userProfile?.city && userProfile?.state) {
            const normCity = userProfile.city
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "")
            redirectSlug = `${normCity}-${userProfile.state.toLowerCase()}`
        }
        // 2. Check cookie (logged out but has saved location)
        else {
            const cookieStore = await cookies()
            const savedCity = cookieStore.get("dudit_city")?.value
            if (savedCity && savedCity !== "brasil" && !savedCity.startsWith("estado-")) {
                redirectSlug = savedCity
            }
        }

        if (redirectSlug) {
            redirect(`/explorar/${redirectSlug}`)
        }
    }

    // Se não tem slug, mostra Brasil inteiro (como /explorar/brasil)
    if (!firstSlug) {
        slug = ["brasil"]
        firstSlug = "brasil"
    }

    // Detecta se é um estado (formato: "estado-sp") ou uma cidade
    const isStateRoute = firstSlug.startsWith("estado-")
    const stateSlug = isStateRoute ? firstSlug : null
    const cidade = !isStateRoute ? firstSlug : ""

    const categorySlug = slug[1] || ""
    const categoria = categorySlug ? (CATEGORY_SLUG_MAP[categorySlug] || categorySlug) : ""

    const query = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : ""
    const type = parseMarketplaceType(resolvedSearchParams.type)
    const section = typeof resolvedSearchParams.section === "string" ? resolvedSearchParams.section : undefined

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


    const state = stateSlug
        ? stateSlug.replace(/^estado-/, "").toUpperCase()
        : (cidade.split("-").pop()?.toUpperCase() || userProfile?.state || null)

    const adLocation = {
        lat: userProfile?.latitude ?? null,
        lng: userProfile?.longitude ?? null,
        citySlug: !stateSlug ? cidade : null,
        city: !stateSlug ? userProfile?.city : null,
        state,
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
    } else if (cidade) {
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
    } else if (cidade === "" && !isStateRoute) {
        // brasil
        breadcrumbItems.push({
            name: "Brasil",
            item: "https://dudit.com.br/explorar/brasil",
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
        <div className="min-h-screen bg-white pt-[40px] lg:pt-[110px] font-sans flex flex-col">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
            />
            <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />

            <HydrationBoundary state={dehydratedState}>
                <Suspense fallback={
                        <div className="min-h-screen bg-white pt-[40px] lg:pt-[110px] font-sans flex flex-col items-center justify-center">
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
