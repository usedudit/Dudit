import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { listCampaignsAction, listPromotionsAction } from "@/app/actions/shared/promotions"
import { getPartnerProfile } from "@/app/actions/marketplace/partners"
import PromotionsPage from "@/components/erp/promotions/PromotionsPage"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { getPartnerPlan } from "@/lib/services/subscription.service"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function PromotionsRoute() {
  const user = await getCurrentUser()
  if (!user) return <AccessDenied />

  const context = await getCurrentPartnerContext()
  if (!context) {
    redirect("/select-erp")
  }
  const partnerId = context.partnerId

  const [campaignsResult, promotionsResult, plan, partner] = await Promise.all([
    listCampaignsAction(partnerId, { page: 1, limit: 100 }),
    listPromotionsAction(partnerId),
    getPartnerPlan(partnerId),
    getPartnerProfile(partnerId)
  ])

  if (!campaignsResult.success) {
    throw new Error(campaignsResult.error || "Erro ao carregar campanhas")
  }
  if (!promotionsResult.success) {
    throw new Error(promotionsResult.error || "Erro ao carregar promoções")
  }

  const isFreePlan = plan.slug.toLowerCase() === "free"
  const planGate = isFreePlan ? { 
    requiredPlanSlug: "escalar" as const, 
    message: "O acesso a campanhas e promoções requer o plano Escalar ou superior." 
  } : undefined

  return (
    <>
      <ERPPageHeader title="Campanhas e Promoções" />
      <FadeIn className="p-4">
        <PromotionsPage
          partnerId={partnerId}
          partner={partner}
          initialCampaigns={isFreePlan ? [] : (campaignsResult.data || [])}
          initialPromotions={isFreePlan ? [] : (promotionsResult.data || [])}
          initialTotal={isFreePlan ? 0 : (campaignsResult.total || 0)}
          planGate={planGate}
        />
      </FadeIn>
    </>
  )
}
