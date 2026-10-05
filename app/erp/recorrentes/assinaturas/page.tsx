import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { PlanGatePage } from "@/components/erp/PlanGatePage"
import { listRecurringSubscriptionsAction } from "@/app/actions/erp/recurring-subscriptions"
import RecurringSubscriptionsPage from "@/components/erp/recurring/RecurringSubscriptionsPage"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function RecurringSubscriptionsRoute() {
    const context = await getCurrentPartnerContext()
    if (!context) return <AccessDenied />
    if (context.businessInfo?.mode === "quick" || context.businessInfo?.mode === "desapego") return <AccessDenied />

    const partnerId = context.partnerId
    const plan = await getPartnerPlan(partnerId)

    if (!hasMinimumPlan(plan.slug, "escalar")) {
        return (
            <PlanGatePage
                title="Assinaturas de Clientes"
                subtitle="Acompanhe as assinaturas ativas, as cobranças recorrentes, o crédito de serviços e as próximas execuções. Disponível exclusivamente no Plano Escalar."
                requiredPlan="escalar"
            />
        )
    }

    const result = await listRecurringSubscriptionsAction(partnerId, { status: "all", storeId: context.activeStoreId })

    if (!result.success || !result.data) {
        throw new Error(result.error || "Erro ao carregar assinaturas")
    }

    return (
        <>
            <ERPPageHeader title="Assinaturas Recorrentes" />
            <FadeIn className="p-4">
                <RecurringSubscriptionsPage
                    partnerId={partnerId}
                    initialSubscriptions={result.data.items}
                    initialHasMore={result.data.hasMore}
                    initialNextCursor={result.data.nextCursor}
                />
            </FadeIn>
        </>
    )
}
