import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { PlanGatePage } from "@/components/erp/PlanGatePage"
import { listRecurringPlansAction } from "@/app/actions/erp/recurring-plans"
import RecurringPlansPage from "@/components/erp/recurring/RecurringPlansPage"
import { canAccessRoute, normalizeToRoutePermissions } from "@/lib/permissions/route-permissions"
import type { PartnerRole } from "@/lib/permissions/types"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function RecurringPlansRoute() {
    const context = await getCurrentPartnerContext()
    if (!context) return <AccessDenied />
    if (context.businessInfo?.mode === "quick" || context.businessInfo?.mode === "desapego") return <AccessDenied />

    const role = (context.role || "DELIVERY") as PartnerRole
    const routePermissions = normalizeToRoutePermissions(role, context.roleId === "owner" ? null : context.permissions)
    if (!canAccessRoute(routePermissions, "recurring_plans")) return <AccessDenied />

    const partnerId = context.partnerId
    const plan = await getPartnerPlan(partnerId)

    if (!hasMinimumPlan(plan.slug, "escalar")) {
        return (
            <PlanGatePage
                title="Planos Recorrentes"
                subtitle="Monte planos de cobrança recorrente com produtos e serviços, com cobrança automática no cartão pelo Mercado Pago. Disponível exclusivamente no Plano Escalar."
                requiredPlan="escalar"
            />
        )
    }

    const result = await listRecurringPlansAction(partnerId, { status: "all", storeId: context.activeStoreId })

    if (!result.success || !result.data) {
        throw new Error(result.error || "Erro ao carregar planos recorrentes")
    }

    return (
        <>
            <ERPPageHeader title="Planos Recorrentes" />
            <FadeIn className="p-4">
                <RecurringPlansPage
                    partnerId={partnerId}
                    initialPlans={result.data.items}
                    initialHasMore={result.data.hasMore}
                    initialNextCursor={result.data.nextCursor}
                />
            </FadeIn>
        </>
    )
}
