import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import POSPage from "@/components/erp/pos/POSPage"
import { getPOSInitialDataAction } from "@/app/actions/erp/pos"

export const dynamic = "force-dynamic"

export default async function POSPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId
  const [{ allowed }, initialDataResult] = await Promise.all([
    checkPartnerPermission(partnerId, "orders", "create"),
    getPOSInitialDataAction(partnerId),
  ])

  if (!allowed) return <AccessDenied />

  if (!initialDataResult.success) {
    return <AccessDenied />
  }

  return (
    <>
      <ERPPageHeader title="PDV" />
      <FadeIn className="p-4 md:p-6 h-full">
        <POSPage partnerId={partnerId} initialData={initialDataResult.data} />
      </FadeIn>
    </>
  )
}
