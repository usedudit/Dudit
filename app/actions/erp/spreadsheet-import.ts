"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import {
  readSpreadsheet,
  suggestMapping,
  detectEntity,
  createImportSession,
  getImportSession,
  generatePreview,
  executeImport,
  deleteImportSession,
} from "@/lib/erp/import"
import type { EntityType, ColumnMapping } from "@/lib/erp/import/types"

export async function uploadPlanilhaAction(
  formData: FormData,
): Promise<{
  success: boolean
  sessionId?: string
  entityType?: EntityType
  headers?: string[]
  totalRows?: number
  fileName?: string
  suggestedMapping?: ColumnMapping[]
  error?: string
}> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const user = await requireUser()

    const file = formData.get("file") as File
    if (!file) {
      return { success: false, error: "Nenhum arquivo enviado." }
    }

    const entityTypeParam = formData.get("entityType") as string | null
    const partnerId = formData.get("partnerId") as string
    const storeId = formData.get("storeId") as string

    if (!partnerId) {
      return { success: false, error: "Parceiro não identificado." }
    }

    const entityType = entityTypeParam as EntityType | null
    if (entityType) {
      await requirePermission(partnerId, entityType as any, "create", user)
    } else {
      await requirePermission(partnerId, "products", "create", user)
    }

    const buffer = await file.arrayBuffer()
    const readResult = await readSpreadsheet(buffer, file.name)

    const detectedEntity = entityType || detectEntity(readResult.headers)
    const mapping = suggestMapping(readResult.headers, detectedEntity)

    const sessionId = await createImportSession(partnerId, {
      entityType: detectedEntity,
      headers: readResult.headers,
      rows: readResult.rows,
      totalRows: readResult.totalRows,
      fileName: readResult.fileName,
      partnerId,
      storeId,
    })

    return {
      success: true,
      sessionId,
      entityType: detectedEntity,
      headers: readResult.headers,
      totalRows: readResult.totalRows,
      fileName: readResult.fileName,
      suggestedMapping: mapping,
    }
  } catch (err: any) {
    console.error("[uploadPlanilhaAction]", err)
    return { success: false, error: err.message || "Erro ao processar arquivo." }
  }
}

export async function previewImportAction(
  sessionId: string,
  partnerId: string,
  mapping: ColumnMapping[],
): Promise<{
  success: boolean
  preview?: any
  error?: string
}> {
  try {
    const user = await requireUser()
    const session = await getImportSession(partnerId, sessionId)

    if (!session) {
      return { success: false, error: "Sessão de importação expirada ou inválida." }
    }

    await requirePermission(partnerId, session.entityType as any, "create", user)

    const preview = await generatePreview(session, mapping)

    return { success: true, preview }
  } catch (err: any) {
    console.error("[previewImportAction]", err)
    return { success: false, error: err.message || "Erro ao gerar preview." }
  }
}

export async function confirmImportAction(
  sessionId: string,
  partnerId: string,
  mapping: ColumnMapping[],
  options: { skipDuplicates: boolean; skipErrors: boolean },
): Promise<{
  success: boolean
  result?: any
  error?: string
}> {
  const startTime = Date.now()

  let user: any
  try {
    user = await requireUser()
    const session = await getImportSession(partnerId, sessionId)

    if (!session) {
      return { success: false, error: "Sessão de importação expirada ou inválida." }
    }

    await requirePermission(partnerId, session.entityType as any, "create", user)
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const result = await executeImport(session, mapping, options)

    const supabase = await getSupabaseServerClient()
    await supabase.from("erp_imports").insert({
      partner_id: partnerId,
      entity_type: session.entityType,
      file_name: session.fileName,
      total_rows: session.totalRows,
      success_rows: result.successRows,
      error_rows: result.errorRows,
      duplicate_rows: result.duplicateRows,
      warnings_count: result.warningRows,
      duration_ms: Date.now() - startTime,
      status: "completed",
      created_by: user.id,
    })

    await deleteImportSession(partnerId, sessionId)

    return { success: true, result }
  } catch (err: any) {
    console.error("[confirmImportAction]", err)

    try {
      const supabase = await getSupabaseServerClient()
      const session = await getImportSession(partnerId, sessionId)
      if (session) {
        await supabase.from("erp_imports").insert({
          partner_id: partnerId,
          entity_type: session.entityType,
          file_name: session.fileName,
          total_rows: session.totalRows,
          success_rows: 0,
          error_rows: session.totalRows,
          duplicate_rows: 0,
          warnings_count: 0,
          duration_ms: Date.now() - startTime,
          status: "failed",
          created_by: user?.id || "",
        })
        await deleteImportSession(partnerId, sessionId)
      }
    } catch {}

    return { success: false, error: err.message || "Erro ao importar dados." }
  }
}

export async function listImportsAction(
  partnerId: string,
  limit = 15,
): Promise<{
  success: boolean
  imports?: any[]
  error?: string
}> {
  try {
    const user = await requireUser()
    await requirePermission(partnerId, "products", "view", user)

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("erp_imports")
      .select("*")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) throw error

    return { success: true, imports: data || [] }
  } catch (err: any) {
    console.error("[listImportsAction]", err)
    return { success: false, error: err.message }
  }
}
