import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getServiceMetadataAction } from "@/app/actions/erp/service-metadata"
import ServiceCategoriesPage from "@/components/erp/servicos/cadastros/ServiceCategoriesPage"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { getPartnerPlan } from "@/lib/services/subscription.service"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) return <AccessDenied />

  const context = await getCurrentPartnerContext()
  if (!context) {
    redirect("/select-erp")
  }
  const partnerId = context.partnerId

  const [result, plan] = await Promise.all([
    getServiceMetadataAction(partnerId),
    getPartnerPlan(partnerId)
  ])

  if (!result.success || !result.data) {
    throw new Error(result.error || "Erro ao carregar dados")
  }

  const isFreePlan = plan.slug.toLowerCase() === "free"
  const planGate = isFreePlan ? {
    requiredPlanSlug: "crescer" as const,
    message: "O acesso aos cadastros de categorias requer o plano Crescer ou superior."
  } : undefined

  return (
    <>
      <ERPPageHeader title="Categorias de Serviços" />
      <FadeIn className="p-4">
        <ServiceCategoriesPage
          initialMetadata={isFreePlan ? { categories: [] } : result.data}
          partnerId={partnerId}
          planGate={planGate}
        />
      </FadeIn>
    </>
  )
}
