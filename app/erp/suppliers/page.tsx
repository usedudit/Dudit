import SuppliersPage from "@/components/erp/fornecedores/SuppliersPage"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPermission } from "@/lib/permissions/access"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { getERPSuppliersPageAction } from "@/app/actions/erp/suppliers"

export default async function SuppliersRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  const partnerId = context.partnerId
  const [{ allowed }, page] = await Promise.all([
    checkPermission(partnerId, "suppliers", "view"),
    getERPSuppliersPageAction(partnerId, { cursor: null, limit: 100 }),
  ])

  if (!allowed) return <AccessDenied />
  if (!page.success) {
    throw new Error(page.error || "Erro ao carregar fornecedores.")
  }

  return (
    <>
      <ERPPageHeader title="Fornecedores" />
      <FadeIn className="p-4">
        <SuppliersPage
          partnerId={partnerId}
          initialSuppliers={page.items || []}
          initialNextCursor={page.nextCursor}
          initialHasMore={page.hasMore}
        />
      </FadeIn>
    </>
  )
}
