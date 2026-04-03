import CustomersPage from "@/components/erp/clientes/CustomersPage"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentUser } from "@/lib/auth/authorization"

export const dynamic = "force-dynamic"

export default async function CustomersRoute() {
  const user = await getCurrentUser()
  if (!user) return <AccessDenied />

  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  const partnerId = context.partnerId

  const { allowed } = await checkPartnerPermission(partnerId, "customers", "view")
  if (!allowed) return <AccessDenied />

  return (
    <>
      <ERPPageHeader title="Clientes" />
      <FadeIn className="p-4">
        <CustomersPage partnerId={partnerId} />
      </FadeIn>
    </>
  )
}