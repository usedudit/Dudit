import CustomersPage from "@/components/erp/clientes/CustomersPage"
import { getErpRequestContext } from "@/lib/auth/erp-context"
import { checkPermission } from "@/lib/permissions/access"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { getERPCustomersPageAction } from "@/app/actions/erp/customers"
import { can } from "@/lib/permissions/can"
import type { RbacUserLike } from "@/lib/permissions/rbac-types"

export default async function CustomersRoute() {
  const context = await getErpRequestContext()
  if (!context) return <AccessDenied />

  if (!can(context as RbacUserLike, "customers.list")) {
    return <AccessDenied />
  }

  const partnerId = context.partnerId
  const [{ allowed }, page] = await Promise.all([
    checkPermission(partnerId, "customers", "view"),
    getERPCustomersPageAction(partnerId, { cursor: null, limit: 100, filters: { includeArchived: true } }),
  ])

  if (!allowed) return <AccessDenied />
  if (!page.success) {
    throw new Error(page.error || "Erro ao carregar clientes.")
  }

  return (
    <>
      <ERPPageHeader title="Clientes" />
      <FadeIn className="p-4">
        <CustomersPage
          partnerId={partnerId}
          initialCustomers={page.items || []}
          initialNextCursor={page.nextCursor}
          initialHasMore={page.hasMore}
        />
      </FadeIn>
    </>
  )
}
