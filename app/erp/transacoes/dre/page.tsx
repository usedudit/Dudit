import { ERPPageHeader } from "@/components/erp/page-header-state"
import { DreView } from "@/components/erp/financial/dre/DreView"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
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
  const admin = createAdminClient()

  const [plan, partnerRes, puRes] = await Promise.all([
    getPartnerPlan(partnerId),
    admin.from("partners").select("user_id").eq("id", partnerId).maybeSingle(),
    admin.from("partner_users").select("id, role_id").eq("partner_id", partnerId).eq("user_id", context.userId).maybeSingle(),
  ])

  // 1. Verificação do Plano Escalar
  if (!hasMinimumPlan(plan.slug, "escalar")) {
    return (
      <PlanGatePage
        title="DRE Gerencial"
        subtitle="Acompanhe a Demonstração do Resultado do Exercício com margens, EBITDA e lucro líquido em tempo real. Disponível exclusivamente no Plano Escalar."
        requiredPlan="escalar"
      />
    )
  }

  const isPartnerOwner = partnerRes.data?.user_id === context.userId
  const roleId = String(puRes.data?.role_id || context.roleId || context.role || "").toLowerCase()

  // 2. Verificação de Role: Somente Owner, Admin e Gerente (Manager)
  if (!isPartnerOwner && !["owner", "admin", "manager"].includes(roleId)) {
    return <AccessDenied />
  }

  // 3. Filtrar somente as lojas que o usuário tem acesso
  let allowedStoreIds: string[] | null = null
  if (!isPartnerOwner && roleId !== "owner") {
    if (!puRes.data) return <AccessDenied />
    const { data: members } = await admin
      .from("store_members")
      .select("store_id")
      .eq("partner_user_id", puRes.data.id)

    const memberStoreIds = (members || []).map((m: any) => m.store_id)
    if (memberStoreIds.length === 0) return <AccessDenied />
    allowedStoreIds = memberStoreIds
  }

  let storesQuery = admin
    .from("stores")
    .select("id, name")
    .eq("partner_id", partnerId)
    .order("is_headquarters", { ascending: false })

  if (allowedStoreIds !== null) {
    storesQuery = storesQuery.in("id", allowedStoreIds)
  }

  const { data: storesData } = await storesQuery
  const stores = (storesData || []).map((s: { id: string; name: string }) => ({
    id: s.id,
    name: s.name,
  }))

  if (stores.length === 0) {
    return <AccessDenied />
  }

  const activeStoreId = context.activeStoreId && (allowedStoreIds === null || allowedStoreIds.includes(context.activeStoreId))
    ? context.activeStoreId
    : stores[0].id

  return (
    <>
      <ERPPageHeader title="DRE Gerencial" />
      <FadeIn className="p-4">
        <DreView
          partnerId={partnerId}
          stores={stores}
          activeStoreId={activeStoreId}
        />
      </FadeIn>
    </>
  )
}
