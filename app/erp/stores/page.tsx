import { Suspense } from "react"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPermission } from "@/lib/permissions/access"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { StoresPageContent } from "@/components/erp/stores/StoresPageContent"

export const dynamic = "force-dynamic"

export default async function StoresPage() {
  await requireUser()
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const [{ allowed }, plan] = await Promise.all([
    checkPermission(context.partnerId, "stores", "view"),
    getPartnerPlan(context.partnerId),
  ])
  if (!allowed) return <AccessDenied />

  const isEscalar = hasMinimumPlan(plan.slug, "escalar")
  const planGate = !isEscalar ? {
    requiredPlanSlug: "escalar" as const,
    message: "O gerenciamento e criação de lojas/filiais é exclusivo do plano Escalar."
  } : undefined

  return (
    <>
      <ERPPageHeader title="Lojas e Filiais" />
      <FadeIn className="p-4">
        <Suspense fallback={<div>Carregando...</div>}>
          <StoresPageContent partnerId={context.partnerId} planGate={planGate} />
        </Suspense>
      </FadeIn>
    </>
  )
}
