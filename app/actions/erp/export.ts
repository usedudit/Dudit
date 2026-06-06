"use server"

import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireErpExportPermission } from "@/lib/erp/export/auth"
import { generateErpExport } from "@/lib/erp/export"
import type { ErpExportFormat, ErpExportModule } from "@/lib/erp/export/types"

export type ExportERPInput = {
  partnerId: string
  module: ErpExportModule
  format?: ErpExportFormat
  filters?: Record<string, unknown>
}

export type ExportERPResult =
  | {
      success: true
      filename: string
      mimeType: string
      base64: string
      rowCount: number
    }
  | { success: false; error: string }

export async function exportERPAction(input: ExportERPInput): Promise<ExportERPResult> {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) {
      return { success: false, error: rl.error || "Muitas tentativas. Aguarde e tente novamente." }
    }

    const partnerId = String(input.partnerId || "").trim()
    if (!partnerId) return { success: false, error: "Parceiro inválido." }

    await requireErpExportPermission(partnerId, input.module)

    const format: ErpExportFormat = input.format === "csv" ? "csv" : "xlsx"
    const result = await generateErpExport({
      partnerId,
      module: input.module,
      format,
      filters: input.filters,
    })

    if (result.rowCount === 0) {
      return { success: false, error: "Nenhum registro encontrado com os filtros atuais." }
    }

    return {
      success: true,
      filename: result.filename,
      mimeType: result.mimeType,
      base64: result.base64,
      rowCount: result.rowCount,
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao gerar exportação."
    return { success: false, error: message }
  }
}
