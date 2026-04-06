import CustomersPage from "@/components/erp/clientes/CustomersPage"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { getPartnerCustomersCached } from "@/lib/data/customers"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"

export default async function CustomersRoute() {
  // Layout already guarantees auth + valid context
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  const partnerId = context.partnerId

  // Parallelize permission check and data fetch
  const [{ allowed }, customers] = await Promise.all([
    checkPartnerPermission(partnerId, "customers", "view"),
    getPartnerCustomersCached(partnerId),
  ])

  if (!allowed) return <AccessDenied />

  return (
    <>
      <ERPPageHeader title="Clientes" />
      <FadeIn className="p-4">
        <CustomersPage partnerId={partnerId} initialCustomers={customers || []} />
      </FadeIn>
    </>
  )
}