// Server component for Returns & Exchanges ERP page
import { ERPPageHeader } from "@/components/erp/page-header-state"
import ReturnsPage from "@/components/erp/returns/ReturnsPage"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { can } from "@/lib/permissions/can"
import type { RbacUserLike } from "@/lib/permissions/rbac-types"

export const dynamic = "force-dynamic"

export default async function ReturnsPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const { partnerId, roleId, activeStoreId } = context

  if (!can(context as RbacUserLike, "orders.can_refund")) {
    return <AccessDenied />
  }

  const plan = await getPartnerPlan(partnerId)
  const isFreePlan = plan.slug.toLowerCase() === "free"
  const planGate = isFreePlan ? { requiredPlanSlug: "crescer" as const } : undefined

  return (
    <>
      <ERPPageHeader title="Trocas e Devoluções" />
      <FadeIn className="p-4">
        <ReturnsPage
          partnerId={partnerId}
          roleId={roleId}
          storeId={activeStoreId || undefined}
          planGate={planGate}
        />
      </FadeIn>
    </>
  )
}
