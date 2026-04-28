import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { listCouponsAction } from "@/app/actions/shared/coupons"
import CouponsPage from "@/components/erp/coupons/CouponsPage"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { getPartnerPlan } from "@/lib/services/subscription.service"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function CouponsRoute() {
  const user = await getCurrentUser()
  if (!user) return <AccessDenied />

  const context = await getCurrentPartnerContext()
  if (!context) {
    redirect("/select-erp")
  }
  const partnerId = context.partnerId

  const [result, plan] = await Promise.all([
    listCouponsAction(partnerId, { page: 1, limit: 100 }),
    getPartnerPlan(partnerId)
  ])

  if (!result.success) {
    throw new Error(result.error || "Erro ao carregar cupons")
  }

  const isFreePlan = plan.slug.toLowerCase() === "free"
  const planGate = isFreePlan ? { 
    requiredPlanSlug: "vendedor" as const, 
    message: "O acesso aos cupons promocionais requer o plano Vendedor ou superior." 
  } : undefined

  return (
    <>
      <ERPPageHeader title="Cupons" />
      <FadeIn className="p-4">
        <CouponsPage
          partnerId={partnerId}
          initialCoupons={isFreePlan ? [] : (result.data || [])}
          initialTotal={isFreePlan ? 0 : (result.total || 0)}
          planGate={planGate}
        />
      </FadeIn>
    </>
  )
}
