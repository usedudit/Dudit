"use server"

import { requirePermission } from "@/lib/permissions/access"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getDreReport, type DreFilters, type DreReportData } from "@/lib/services/dre.service"

export async function getDreReportAction(filters: DreFilters): Promise<{
  success: boolean
  data?: DreReportData
  error?: string
}> {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) {
      return { success: false, error: rl.error || "Muitas tentativas. Aguarde um momento." }
    }

    await requirePermission(filters.partnerId, "financial", "view")

    const report = await getDreReport(filters)
    return { success: true, data: report }
  } catch (error: any) {
    console.error("Error fetching DRE report:", error)
    return { success: false, error: error.message || "Erro ao gerar DRE." }
  }
}
