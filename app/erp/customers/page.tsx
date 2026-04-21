import CustomersPage from "@/components/erp/clientes/CustomersPage"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { getERPCustomersPageAction } from "@/app/actions/erp/customers"

export default async function CustomersRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  const partnerId = context.partnerId
  const [{ allowed }, page] = await Promise.all([
    checkPartnerPermission(partnerId, "customers", "view"),
    getERPCustomersPageAction(partnerId, { cursor: null, limit: 100 }),
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