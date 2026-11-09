import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserCollections } from "@/app/actions/marketplace/collections"
import { UserCollectionsPage } from "@/components/marketplace/UserCollectionsPage"
import { getUserSessionData } from "@/lib/data/user"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function MinhasColecoesPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/auth/login?next=/colecoes")
  }

  const [collectionsResult, sessionData] = await Promise.all([
    getUserCollections(user.id, undefined, 200),
    getUserSessionData(user.id),
  ])

  const userProfile = sessionData?.profile
    ? {
      full_name: sessionData.profile.full_name,
      address: sessionData.profile.city
        ? `${sessionData.profile.city} - ${sessionData.profile.state}`
        : null,
    }
    : null

  return (
    <UserCollectionsPage
      collections={collectionsResult.items || []}
      userProfile={userProfile}
      cartCount={sessionData?.cartCount || 0}
    />
  )
}
