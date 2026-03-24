import { CustomersPage } from "@/components/erp/clientes/CustomersPage"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPHeader } from "@/components/erp/erp-header"
import { FadeIn } from "@/components/animations/FadeIn"

export const revalidate = false

export default async function CustomersRoute() {
  const context = (await getCurrentPartnerContext())!
  const partnerId = context.partnerId

  const { allowed } = await checkPartnerPermission(partnerId, "customers", "view")
  if (!allowed) return <AccessDenied />

  return (
    <>
      <ERPHeader pageTitle="Clientes" />
      <FadeIn className="px-2 sm:px-4 md:px-6 w-full max-w-full">
        <div className="max-w-[1700px] mx-auto py-6">
          <CustomersPage partnerId={partnerId} />
        </div>
      </FadeIn>
    </>
  )
}