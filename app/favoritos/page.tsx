import type { Metadata } from "next"
import { FavoritesPageClient } from "@/components/marketplace/FavoritesPageClient"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
    title: "Favoritos | Dudit",
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

    return (
        <div className="bg-white min-h-screen font-sans text-brand-dark flex flex-col pt-[60px]">
            <FavoritesPageClient
                userProfile={userProfile}
                cartCount={cartCount}
            />
        </div>
    )
}
