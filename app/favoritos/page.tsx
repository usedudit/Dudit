import type { Metadata } from "next"
import { FavoritesPageClient } from "@/components/marketplace/FavoritesPageClient"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"
import { redirect } from "next/navigation"
import MarketplaceHeader from "@/components/marketplace/MarketplaceHeader"
import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"

import { getUserFavoritesAction } from "@/app/actions/marketplace/favorites"

export const metadata: Metadata = {
    title: "Favoritos",
    description: "Seus produtos e serviços favoritos no marketplace Dudit. Encontre rapidamente tudo que você salvou.",
}

export default async function FavoritosPage({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
    const resolvedParams = await searchParams
    const user = await getCurrentUser()

    if (!user) {
        redirect("/auth/login?next=/favoritos")
    }

    const sessionData = await getUserSessionData(user.id)

    const userProfile = sessionData?.profile
        ? {
            full_name: sessionData.profile.full_name,
            address: sessionData.profile.city
                ? `${sessionData.profile.city} - ${sessionData.profile.state}`
                : null,
        }
        : null

    const cartCount = sessionData?.cartCount || 0

    const currentPage = Math.max(1, Number(resolvedParams?.page) || 1)

    // Fetch initial favorites on server to eliminate initial loading flash
    const favResult = await getUserFavoritesAction({ type: "todos", page: currentPage, pageSize: 24 })
    const initialItems = favResult.success ? favResult.items : []
    const total = favResult.total || 0
    const totalPages = Math.max(1, Math.ceil(total / 24))
    const initialCounts = favResult.counts || {
        total: initialItems.length,
        produtos: initialItems.filter((i: any) => i.itemType === "produto").length,
        servicos: initialItems.filter((i: any) => i.itemType === "servico").length,
    }

    return (
        <div className="min-h-screen bg-white dark:bg-dark-background pt-[40px] lg:pt-[110px] font-sans flex flex-col">
            <MarketplaceHeader simpleTitle="Meus favoritos" userProfile={userProfile} cartCount={cartCount} />

            <FavoritesPageClient
                userProfile={userProfile}
                cartCount={cartCount}
                initialItems={initialItems}
                initialCounts={initialCounts}
                currentPage={currentPage}
                totalPages={totalPages}
            />

            <MarketplaceFooter />
        </div>
    )
}
