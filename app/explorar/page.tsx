import { ExplorarPageClient } from "@/components/marketplace/ExplorarPageClient"
import { getCachedExploreProducts } from "@/app/actions/marketplace/products"
import type { Metadata } from "next"
import { getCurrentUser } from "@/lib/auth/authorization"
import { parseMarketplaceType } from "@/lib/types/marketplace"
import { getUserSessionData } from "@/lib/data/user"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }): Promise<Metadata> {
    const resolvedParams = await searchParams
    const hasParams = Object.keys(resolvedParams).length > 0

    return {
        title: "Explorar Produtos e Serviços Perto de Você | Dudit",
        description: "Chega de esperar dias pela entrega. Encontre os melhores produtos, serviços e negócios locais na sua cidade e compre sem pagar taxas extras.",
        robots: {
            index: !hasParams,
            follow: true
        },
        alternates: {
            canonical: "https://dudit.com.br/explorar",
        },
    }
}

export default async function ExplorarPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const resolvedSearchParams = await searchParams

    const query = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : ""
    const type = parseMarketplaceType(resolvedSearchParams.type)

    // Fetch user and products in parallel
    const [user, products] = await Promise.all([
        getCurrentUser(),
        getCachedExploreProducts(query, type),
    ])

    const sessionData = user
        ? await getUserSessionData(user.id)
        : null

    const userProfile = sessionData?.profile
        ? {
            full_name: sessionData.profile.full_name,
            address: sessionData.profile.city
                ? `${sessionData.profile.city} - ${sessionData.profile.state}`
                : null,
        }
        : null

    const cartCount = sessionData?.cartCount || 0

    return (
        <div className="bg-white min-h-screen font-sans text-[#003d32] flex flex-col pt-[110px] lg:pt-[108px]">
            <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />

            <ExplorarPageClient
                initialResults={products}
                query={query}
                type={type}
                userProfile={userProfile}
                cartCount={cartCount}
                hideHeaderAndFooter={true}
            />

            <MarketplaceFooter />
        </div>
    )
}