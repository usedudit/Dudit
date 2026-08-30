import { getCurrentUser } from "@/lib/auth/server-user"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { getDreReport, type DreRegime } from "@/lib/services/dre.service"
import { DreA4Preview } from "@/components/erp/financial/dre/receipt/DreA4Preview"
import PrintLayout from "@/components/erp/shared/PrintLayout"
import { redirect, notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/server"
import { checkPermission } from "@/lib/permissions/access"

interface PrintDrePageProps {
  searchParams: Promise<{
    partnerId?: string
    storeId?: string
    startDate?: string
    endDate?: string
    regime?: string
    showSubItems?: string
    showComparison?: string
    showKpiSummary?: string
    showSignatures?: string
  }>
}

export default async function PrintDrePage({ searchParams }: PrintDrePageProps) {
  const resolvedSearchParams = await searchParams
  const partnerId = resolvedSearchParams.partnerId
  const storeId = resolvedSearchParams.storeId || undefined
  const startDate = resolvedSearchParams.startDate
  const endDate = resolvedSearchParams.endDate
  const regime = (resolvedSearchParams.regime || "competencia") as DreRegime

  if (!partnerId || !startDate || !endDate) {
    notFound()
  }

  const user = await getCurrentUser()
  if (!user) {
    redirect("/auth/login")
  }

  const admin = createAdminClient()
  const [plan, partnerRes, puRes] = await Promise.all([
    getPartnerPlan(partnerId),
    admin.from("partners").select("user_id").eq("id", partnerId).maybeSingle(),
    admin.from("partner_users").select("id, role_id").eq("partner_id", partnerId).eq("user_id", user.id).maybeSingle(),
  ])

  // 1. Validação do Plano Escalar
  if (!hasMinimumPlan(plan.slug, "escalar")) {
    return (
      <div className="p-8 text-center text-red-600 font-bold font-sans">
        O DRE é um recurso exclusivo do Plano Escalar.
      </div>
    )
  }

  const isPartnerOwner = partnerRes.data?.user_id === user.id

  // 2. Validação de Permissão: Owner bypasses, outros precisam de reports.export_dre
  if (!isPartnerOwner) {
    const { allowed } = await checkPermission(partnerId, "reports", "export_dre")
    if (!allowed) {
      return (
        <div className="p-8 text-center text-red-600 font-bold font-sans">
          Apenas proprietários, administradores e gerentes podem visualizar o DRE.
        </div>
      )
    }
  }

  // 3. Validação de Lojas Acessíveis
  let allowedStoreIds: string[] | null = null
  if (!isPartnerOwner) {
    if (!puRes.data) {
      return (
        <div className="p-8 text-center text-red-600 font-bold font-sans">
          Acesso negado às lojas desta empresa.
        </div>
      )
    }
    const { data: members } = await admin
      .from("store_members")
      .select("store_id")
      .eq("partner_user_id", puRes.data.id)

    const memberStoreIds = (members || []).map((m: any) => m.store_id)
    if (memberStoreIds.length === 0) {
      return (
        <div className="p-8 text-center text-red-600 font-bold font-sans">
          Acesso negado às lojas desta empresa.
        </div>
      )
    }
    allowedStoreIds = memberStoreIds
  }

  if (storeId && storeId !== "all") {
    if (allowedStoreIds !== null && !allowedStoreIds.includes(storeId)) {
      return (
        <div className="p-8 text-center text-red-600 font-bold font-sans">
          Você não possui permissão para visualizar os dados desta loja.
        </div>
      )
    }
  }

  const report = await getDreReport({
    partnerId,
    storeId: storeId === "all" ? null : storeId,
    allowedStoreIds: storeId && storeId !== "all" ? null : allowedStoreIds,
    startDate,
    endDate,
    regime,
    compareWithPrevious: resolvedSearchParams.showComparison !== "false",
  })

  const showSubItems = resolvedSearchParams.showSubItems !== "false"
  const showComparison = resolvedSearchParams.showComparison !== "false"
  const showKpiSummary = resolvedSearchParams.showKpiSummary !== "false"
  const showSignatures = resolvedSearchParams.showSignatures !== "false"

  return (
    <PrintLayout paperSize="a4">
      <DreA4Preview
        report={report}
        regime={regime}
        startDate={startDate}
        endDate={endDate}
        storeName={report.companyInfo?.storeName || "Todas as Lojas (Consolidado)"}
        showSubItems={showSubItems}
        showComparison={showComparison}
        showKpiSummary={showKpiSummary}
        showSignatures={showSignatures}
        printMode={true}
      />
    </PrintLayout>
  )
}
