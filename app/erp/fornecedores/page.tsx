import SuppliersPage from "@/components/erp/fornecedores/SuppliersPage"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPermission } from "@/lib/permissions/access"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { getERPSuppliersPageAction } from "@/app/actions/erp/suppliers"

export default async function SuppliersRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  const partnerId = context.partnerId
  const activeStoreId = context.activeStoreId || null

  const plan = await getPartnerPlan(partnerId)
  const isFreePlan = plan.slug.toLowerCase() === "free"
  const planGate = isFreePlan ? { requiredPlanSlug: "crescer" as const } : undefined

  const [{ allowed }, page] = await Promise.all([
    checkPermission(partnerId, "suppliers", "view"),
    !isFreePlan ? getERPSuppliersPageAction(partnerId, { cursor: null, limit: 100, storeId: activeStoreId || undefined }) : { success: true as const, items: [] as any[], error: undefined as string | undefined },
  ])

  if (!allowed) return <AccessDenied />
  if (!isFreePlan && !page.success) {
    throw new Error(page.error || "Erro ao carregar fornecedores.")
  }

  return (
    <>
      <ERPPageHeader title="Fornecedores" />
      <FadeIn className="p-4">
        <SuppliersPage
          partnerId={partnerId}
          initialSuppliers={!isFreePlan ? (page as any).items || [] : []}
          initialNextCursor={!isFreePlan ? (page as any).nextCursor : null}
          initialHasMore={!isFreePlan ? (page as any).hasMore : false}
          planGate={planGate}
        />
      </FadeIn>
    </>
  )
}
