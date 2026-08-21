import { ERPPageHeader } from "@/components/erp/page-header-state"
import { DreView } from "@/components/erp/financial/dre/DreView"
import { checkPermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { PlanGatePage } from "@/components/erp/PlanGatePage"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function DreRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  if (context.businessInfo?.mode === "quick") return <AccessDenied />

  const partnerId = context.partnerId
  const activeStoreId = context.activeStoreId || null
  const { allowed } = await checkPermission(partnerId, "financial", "view")

  const [plan] = await Promise.all([
    getPartnerPlan(partnerId),
  ])

  if (!allowed) return <AccessDenied />
  if (plan.slug.toLowerCase() === "free") {
    return (
      <PlanGatePage
        title="DRE Gerencial"
        subtitle="Acompanhe a Demonstração do Resultado do Exercício com margens, EBITDA e lucro líquido em tempo real. Disponível nos planos Crescer e Escalar."
        requiredPlan="crescer"
      />
    )
  }

  // Buscar lojas do parceiro para filtro multi-loja
  const supabase = createAdminClient()
  const { data: storesData } = await supabase
    .from("stores")
    .select("id, name")
    .eq("partner_id", partnerId)
    .order("is_headquarters", { ascending: false })

  const stores = (storesData || []).map((s: { id: string; name: string }) => ({
    id: s.id,
    name: s.name,
  }))

  return (
    <>
      <ERPPageHeader title="DRE Gerencial" />
      <FadeIn className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">
              Demonstração do Resultado do Exercício (DRE)
            </h1>
            <p className="text-sm text-brand-inactive-text dark:text-dark-muted mt-1">
              Visão consolidada de receitas, deduções, custos diretos (CMV/CSP), despesas operacionais e lucratividade líquida.
            </p>
          </div>

          <DreView
            partnerId={partnerId}
            stores={stores}
            activeStoreId={activeStoreId}
          />
        </div>
      </FadeIn>
    </>
  )
}
