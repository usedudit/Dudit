import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserCollectionsPaginated } from "@/app/actions/marketplace/collections"
import { UserCollectionsPage } from "@/components/marketplace/UserCollectionsPage"

export const dynamic = "force-dynamic"

const COLLECTIONS_PER_PAGE = 20

export default async function MinhasColecoesPage({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
  const resolvedParams = await searchParams
  const user = await getCurrentUser()

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center bg-brand-page-bg">Acesso negado</div>
  }

  const currentPage = Math.max(1, Number(resolvedParams?.page) || 1)
  const { items: collections, total } = await getUserCollectionsPaginated(user.id, currentPage, COLLECTIONS_PER_PAGE)
  const totalPages = Math.max(1, Math.ceil(total / COLLECTIONS_PER_PAGE))

  return <UserCollectionsPage collections={collections} currentPage={currentPage} totalPages={totalPages} />
}
