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

export default async function FavoritosPage() {
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

    // Fetch initial favorites on server to eliminate initial loading flash
    const favResult = await getUserFavoritesAction({ type: "todos" })
    const initialItems = favResult.success ? favResult.items : []
    const initialCounts = favResult.counts || {
        total: initialItems.length,
        produtos: initialItems.filter((i: any) => i.itemType === "produto").length,
        servicos: initialItems.filter((i: any) => i.itemType === "servico").length,
    }

    return (
        <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
            <MarketplaceHeader simpleTitle="Meus favoritos" userProfile={userProfile} cartCount={cartCount} />

            <FavoritesPageClient
                userProfile={userProfile}
                cartCount={cartCount}
                initialItems={initialItems}
                initialCounts={initialCounts}
            />

            <MarketplaceFooter />
        </div>
    )
}
