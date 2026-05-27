import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import DriversPage from "@/components/erp/deliveries/DriversPage"

export const dynamic = "force-dynamic"

export default async function LogisticsDriversPage() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId
  const { allowed } = await checkPartnerPermission(partnerId, "delivery", "view")
  if (!allowed) return <AccessDenied />

  return (
    <>
      <ERPPageHeader title="Entregadores" />
      <FadeIn className="p-4">
        <DriversPage partnerId={partnerId} />
      </FadeIn>
    </>
  )
}

