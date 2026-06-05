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
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

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
    const cidade = slug[0] || ""

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

    if (!cidade) {
        const cookieStore = await cookies()
        let savedCity = cookieStore.get("dudit_city")?.value

        if (!savedCity && userProfile?.city && userProfile?.state) {
            const normCity = userProfile.city
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "")
            savedCity = `${normCity}-${userProfile.state.toLowerCase()}`
        }

        if (savedCity) {
            const queryParams = new URLSearchParams()
            const query = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : ""
            const type = parseMarketplaceType(resolvedSearchParams.type)
            if (query) queryParams.set("q", query)
            if (type !== "tudo") queryParams.set("type", type)
            const queryStr = queryParams.toString()
            const queryPart = queryStr ? `?${queryStr}` : ""
            redirect(`/explorar/${savedCity}${queryPart}`)
        } else {
            redirect("/")
        }
    }
    const categorySlug = slug[1] || ""
    const categoria = categorySlug ? (CATEGORY_SLUG_MAP[categorySlug] || categorySlug) : ""

    const query = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : ""
    const type = parseMarketplaceType(resolvedSearchParams.type)

    const isLandingPage = type === 'tudo' && !categoria && !query
    const serverFetchType = isLandingPage ? 'vitrines' : type

    const products = await getCachedExploreProducts(query, serverFetchType, cidade)

    const cartCount = sessionData?.cartCount || 0

    const productsWithDistance = enrichMarketplaceDistance(
        products || [],
        userProfile?.latitude && userProfile?.longitude
            ? { lat: userProfile.latitude, lng: userProfile.longitude }
            : null,
    )

    return (
        <div className="min-h-screen bg-white pt-[40px] lg:pt-[110px] font-sans flex flex-col">
            <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />

            <Suspense>
                <ExplorarPageClient
                    initialResults={productsWithDistance}
                    query={query}
                    type={type}
                    cidade={cidade}
                    categoria={categoria}
                    userProfile={userProfile}
                    cartCount={cartCount}
                    hideHeaderAndFooter={true}
                />
            </Suspense>

            <MarketplaceFooter />
        </div>
    )
}
