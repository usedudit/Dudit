import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getDreReport, type DreRegime } from "@/lib/services/dre.service"
import { DreA4Preview } from "@/components/erp/financial/dre/receipt/DreA4Preview"
import PrintLayout from "@/components/erp/shared/PrintLayout"
import { redirect, notFound } from "next/navigation"

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

  try {
    await requirePartnerAccessWithPermission(partnerId, "financial", "view", user)
  } catch {
    return (
      <div className="p-8 text-center text-red-600 font-bold font-sans">
        Acesso negado. Você não possui permissão para visualizar este relatório.
      </div>
    )
  }

  const report = await getDreReport({
    partnerId,
    storeId: storeId === "all" ? null : storeId,
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
