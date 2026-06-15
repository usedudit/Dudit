import { Suspense } from "react"
import { ExplorarPageClient } from "@/components/marketplace/ExplorarPageClient"
import { getCachedExploreProducts } from "@/app/actions/marketplace/products"
import type { Metadata } from "next"
import { getCurrentUser } from "@/lib/auth/authorization"
import { parseMarketplaceType } from "@/lib/types/marketplace"
import { getUserSessionData } from "@/lib/data/user"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"
import { enrichMarketplaceDistance } from "@/lib/services/location.service"
import { getSponsoredAdsForSlot } from "@/app/actions/marketplace/ads"
import type { SponsoredAd } from "@/lib/ads/types"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import ThreeDotsLoader from "@/components/reusable/ThreeDotsLoader"

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

export async function generateMetadata({
    params
}: {
    params: Promise<{ slug?: string[] }>
}): Promise<Metadata> {
    return {
        title: "Explorar Produtos e Serviços Perto de Você | Dudit",
        description: "Chega de esperar dias pela entrega. Encontre os melhores produtos, serviços e negócios locais na sua cidade e compre sem pagar taxas extras.",
        robots: {
            index: true,
            follow: true
        },
        alternates: {
            canonical: "https://dudit.com.br/explorar",
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

    const slug = resolvedParams.slug || []
    const firstSlug = slug[0] || ""

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

    // Se não tem slug, redireciona para a localização do usuário
    if (!firstSlug) {
        if (userProfile?.city && userProfile?.state) {
            // Usuário logado: redireciona para cidade-estado
            const normalizedCity = userProfile.city
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/\s+/g, "-")
            const stateCode = userProfile.state.toLowerCase()
            redirect(`/explorar/${normalizedCity}-${stateCode}`)
        } else {
            // Usuário não logado: tenta pegar estado dos cookies
            const cookieStore = await cookies()
            const savedState = cookieStore.get("dudit_state")?.value
            if (savedState) {
                const stateCode = savedState.toLowerCase()
                redirect(`/explorar/estado-${stateCode}`)
            }
        }

        // Se não conseguir determinar localização, mostra loader
        return (
            <>
                <MarketplaceHeader />
                <div className="min-h-screen bg-white pt-[40px] lg:pt-[110px] font-sans flex flex-col items-center justify-center">
                    <ThreeDotsLoader />
                </div>
                <MarketplaceFooter />
            </>
        )
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
    const products = await getCachedExploreProducts(query, serverFetchType, searchSlug)

    const cartCount = sessionData?.cartCount || 0

    const productsWithDistance = enrichMarketplaceDistance(
        products || [],
        userProfile?.latitude && userProfile?.longitude
            ? { lat: userProfile.latitude, lng: userProfile.longitude }
            : null,
    )

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

    const [exploreAds, searchAds] = await Promise.all([
        getSponsoredAdsForSlot("explore", adLocation),
        query ? getSponsoredAdsForSlot("search", adLocation) : Promise.resolve([] as SponsoredAd[]),
    ])

    return (
        <div className="min-h-screen bg-white pt-[40px] lg:pt-[110px] font-sans flex flex-col">
            <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />

            <Suspense>
                <ExplorarPageClient
                    initialResults={productsWithDistance}
                    query={query}
                    type={type}
                    cidade={searchSlug}
                    categoria={categoria}
                    sectionTitle={sectionTitle}
                    userProfile={userProfile}
                    cartCount={cartCount}
                    hideHeaderAndFooter={true}
                    exploreAds={exploreAds}
                    searchAds={searchAds}
                    isStateRoute={isStateRoute}
                />
            </Suspense>

            <MarketplaceFooter />
        </div>
    )
}
