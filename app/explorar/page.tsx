import { ExplorarPageClient } from "@/components/marketplace/ExplorarPageClient"
import { getCachedExploreProducts } from "@/app/actions/marketplace/products"
import type { Metadata } from "next"
import { getCurrentUser } from "@/lib/auth/authorization"
import { parseMarketplaceType } from "@/lib/types/marketplace"
import { getUserSessionData } from "@/lib/data/user"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"

export const metadata: Metadata = {
    title: "Explorar | Vitrine Digital Dudit",
    description: "Explore a vitrine digital Dudit com os melhores produtos, serviços e lojistas da sua região.",
    alternates: {
        canonical: "https://dudit.com.br/explorar",
    },
}

export default async function ExplorarPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const t0 = performance.now()

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

    const tEnd = performance.now()
    console.log(`[SSR] Explorar | Time: ${(tEnd - t0).toFixed(2)}ms | Query: ${query} | Type: ${type}`)

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