import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserCollections } from "@/app/actions/marketplace/collections"
import { UserCollectionsPage } from "@/components/marketplace/UserCollectionsPage"

export const dynamic = "force-dynamic"

export default async function MinhasColecoesPage() {
  const user = await getCurrentUser()

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center bg-brand-page-bg">Acesso negado</div>
  }

  const { items: collections } = await getUserCollections(user.id, undefined, 200)

  return <UserCollectionsPage collections={collections} />
}
