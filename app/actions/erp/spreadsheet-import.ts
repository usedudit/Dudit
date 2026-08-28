"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { revalidatePath } from "next/cache"
import { safeRevalidateTag, revalidateProducts, revalidateCustomers } from "@/lib/utils/revalidation"
import { TAGS } from "@/lib/utils/revalidation-tags"
import {
  readSpreadsheet,
  suggestMapping,
  detectEntity,
  createImportSession,
  getImportSession,
  generatePreview,
  executeImport,
  deleteImportSession,
  getFieldsForEntity,
  generateImportTemplate,
  generateFailedRowsReport,
  validateMappingCompatibility,
} from "@/lib/erp/import"
import type { EntityType, ColumnMapping, ImportOptions, FailedRow } from "@/lib/erp/import/types"
import { requireActivePartnerContext, requireAuthorizedPartnerContext } from "@/lib/services/authorized-customer-access"

export async function downloadImportTemplateAction(
  entityType: EntityType,
): Promise<{
  success: boolean
  filename?: string
  mimeType?: string
  base64?: string
  error?: string
}> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const template = await generateImportTemplate(entityType)
    return {
      success: true,
      filename: template.filename,
      mimeType: template.mimeType,
      base64: template.buffer.toString("base64"),
    }
  } catch (err: any) {
    console.error("[downloadImportTemplateAction]", err)
    return { success: false, error: err.message || "Erro ao gerar planilha modelo." }
  }
}

export async function downloadFailedRowsAction(
  entityType: EntityType,
  headers: string[],
  failedRows: FailedRow[],
): Promise<{
  success: boolean
  filename?: string
  mimeType?: string
  base64?: string
  error?: string
}> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!failedRows || failedRows.length === 0) {
      return { success: false, error: "Nenhuma linha com falha para exportar." }
    }
    const report = await generateFailedRowsReport(entityType, headers, failedRows)
    return {
      success: true,
      filename: report.filename,
      mimeType: report.mimeType,
      base64: report.buffer.toString("base64"),
    }
  } catch (err: any) {
    console.error("[downloadFailedRowsAction]", err)
    return { success: false, error: err.message || "Erro ao gerar relatório de falhas." }
  }
}

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
  availableFields?: { name: string; label: string; required?: boolean; type?: string; example?: string }[]
  previewProducts?: any[]
  error?: string
}> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const file = formData.get("file") as File
    if (!file) {
      return { success: false, error: "Nenhum arquivo enviado." }
    }

    const entityTypeParam = formData.get("entityType") as string | null
    let partnerId = formData.get("partnerId") as string
    let storeId = (formData.get("storeId") as string) || null

    if (!partnerId) {
      return { success: false, error: "Parceiro não identificado." }
    }

    const buffer = await file.arrayBuffer()
    const readResult = await readSpreadsheet(buffer, file.name)

    const entityType = entityTypeParam as EntityType | null
    const detectedEntity = entityType || detectEntity(readResult.headers)
    const access = await requireAuthorizedPartnerContext(partnerId, detectedEntity as any, "create")
    partnerId = access.partnerId

    if (!storeId && (detectedEntity === "products" || detectedEntity === "services")) {
      const partnerContext = await getCurrentPartnerContext()
      if (partnerContext?.activeStoreId && partnerContext.partnerId === partnerId) {
        storeId = partnerContext.activeStoreId
      }
      if (!storeId) {
        const admin = getAdminClient()
        const { data: stores } = await admin.from("stores").select("id").eq("partner_id", partnerId).limit(1)
        if (stores && stores.length > 0) {
          storeId = stores[0].id
        }
      }
    }

    const mapping = suggestMapping(readResult.headers, detectedEntity, readResult.rows)
    const fields = getFieldsForEntity(detectedEntity)
    const availableFields = fields.map((f) => ({
      name: f.name,
      label: f.label,
      required: f.required,
      type: f.type,
      example: f.example,
    }))

    const sessionId = await createImportSession(partnerId, {
      entityType: detectedEntity,
      headers: readResult.headers,
      rows: readResult.rows,
      totalRows: readResult.totalRows,
      fileName: readResult.fileName,
      partnerId,
      storeId: storeId || "",
    })

    // Verify session was stored
    const verifySession = await getImportSession(partnerId, sessionId)
    if (!verifySession) {
      console.error(`[uploadPlanilhaAction] Session verification FAILED - session was not persisted for ID ${sessionId}`)
      return { success: false, error: "Erro ao persistir sessão de importação. Verifique a conexão com Redis." }
    }

    const previewProducts = readResult.rows.slice(0, 50).map((row, i) =>
      rowToPreviewEntity(detectedEntity, row, mapping, i)
    )

    return {
      success: true,
      sessionId,
      entityType: detectedEntity,
      headers: readResult.headers,
      totalRows: readResult.totalRows,
      fileName: readResult.fileName,
      suggestedMapping: mapping,
      availableFields,
      previewProducts,
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
  validation?: { warnings: string[]; errors: string[]; missingRequired: string[] }
  error?: string
}> {
  try {
    const access = await requireActivePartnerContext(partnerId)
    const session = await getImportSession(access.partnerId, sessionId)

    if (!session) {
      return { success: false, error: "Sessão de importação expirada ou inválida." }
    }

    await requirePermission(access.partnerId, session.entityType as any, "create", access.user)

    const validation = validateMappingCompatibility(mapping, session.entityType, session.rows)
    const preview = await generatePreview(session, mapping)

    return { success: true, preview, validation }
  } catch (err: any) {
    console.error("[previewImportAction]", err)
    return { success: false, error: err.message || "Erro ao gerar preview." }
  }
}

export async function confirmImportAction(
  sessionId: string,
  partnerId: string,
  mapping: ColumnMapping[],
  options: ImportOptions = {},
): Promise<{
  success: boolean
  result?: any
  error?: string
}> {
  const startTime = Date.now()

  let user: any
  let canonicalPartnerId = partnerId
  try {
    const access = await requireActivePartnerContext(partnerId)
    user = access.user
    canonicalPartnerId = access.partnerId
    const session = await getImportSession(canonicalPartnerId, sessionId)

    if (!session) {
      console.warn(`[confirmImportAction] Session not found: partnerId=${partnerId}, sessionId=${sessionId}`)
      return { success: false, error: "Sessão de importação expirada ou inválida." }
    }

    await requirePermission(canonicalPartnerId, session.entityType as any, "create", user)
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    // Ensure session has resolved storeId if missing for products or services
    if (!session.storeId && (session.entityType === "products" || session.entityType === "services")) {
      const partnerContext = await getCurrentPartnerContext(user)
      if (partnerContext?.activeStoreId && partnerContext.partnerId === canonicalPartnerId) {
        session.storeId = partnerContext.activeStoreId
      }
      if (!session.storeId) {
        const admin = getAdminClient()
        const { data: stores } = await admin.from("stores").select("id").eq("partner_id", canonicalPartnerId).limit(1)
        if (stores && stores.length > 0) {
          session.storeId = stores[0].id
        }
      }
    }

    const result = await executeImport(session, mapping, options)

    const supabase = await getSupabaseServerClient()
    const status = (result.successRows === 0 && result.errorRows > 0) ? "failed" : "completed"

    await supabase.from("erp_imports").insert({
      partner_id: canonicalPartnerId,
      entity_type: session.entityType,
      file_name: session.fileName,
      total_rows: session.totalRows,
      success_rows: result.successRows,
      error_rows: result.errorRows,
      duplicate_rows: result.duplicateRows,
      warnings_count: result.warningRows,
      duration_ms: Date.now() - startTime,
      status: status,
      created_by: user.id,
    })

    await deleteImportSession(canonicalPartnerId, sessionId)

    // Invalidate caches & tags on successful import
    if (result.successRows > 0) {
      if (session.entityType === "services") {
        await safeRevalidateTag(TAGS.services(canonicalPartnerId))
        revalidatePath("/erp/servicos")
      } else if (session.entityType === "products") {
        await revalidateProducts(canonicalPartnerId)
        revalidatePath("/erp/produtos")
      } else if (session.entityType === "customers") {
        await revalidateCustomers(canonicalPartnerId)
        revalidatePath("/erp/clientes")
      } else if (session.entityType === "appointments") {
        await safeRevalidateTag(TAGS.appointments(canonicalPartnerId))
        revalidatePath("/erp/agendamentos")
      }
    }

    if (status === "failed") {
      return { success: false, error: result.errorMessage || "Nenhum dado pôde ser importado. Verifique os erros na planilha.", result }
    }

    return { success: true, result }
  } catch (err: any) {
    console.error("[confirmImportAction]", err)

    try {
      const supabase = await getSupabaseServerClient()
      const session = await getImportSession(canonicalPartnerId, sessionId)
      if (session) {
        await supabase.from("erp_imports").insert({
          partner_id: canonicalPartnerId,
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
        await deleteImportSession(canonicalPartnerId, sessionId)
      }
    } catch { }

    return { success: false, error: err.message || "Erro ao importar dados." }
  }
}

export async function applyMappingAction(
  sessionId: string,
  partnerId: string,
  mapping: ColumnMapping[],
): Promise<{
  success: boolean
  previewProducts?: any[]
  validation?: { warnings: string[]; errors: string[]; missingRequired: string[] }
  error?: string
}> {
  try {
    const access = await requireActivePartnerContext(partnerId)
    const session = await getImportSession(access.partnerId, sessionId)
    if (!session) {
      console.warn(`[applyMappingAction] Session not found: partnerId=${partnerId}, sessionId=${sessionId}`)
      return { success: false, error: "Sessão de importação expirada ou inválida." }
    }

    await requirePermission(access.partnerId, session.entityType as any, "create", access.user)

    const validation = validateMappingCompatibility(mapping, session.entityType, session.rows)

    const previewProducts = session.rows.slice(0, 50).map((row, i) =>
      rowToPreviewEntity(session.entityType, row, mapping, i)
    )

    return { success: true, previewProducts, validation }
  } catch (err: any) {
    console.error("[applyMappingAction]", err)
    return { success: false, error: err.message || "Erro ao aplicar mapeamento." }
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

function rowToPreviewEntity(
  entityType: EntityType,
  row: string[],
  mapping: ColumnMapping[],
  index: number
): Record<string, any> {
  const get = (field: string) => {
    const col = mapping.find((m) => m.field === field)
    if (!col || col.headerIndex >= row.length) return null
    return row[col.headerIndex]?.trim() || null
  }

  const rawName = get("name")
  let name = rawName || (entityType === "customers" ? `Cliente ${index + 1}` : entityType === "services" ? `Serviço ${index + 1}` : `Item ${index + 1}`)
  if (name.length > 150) {
    name = name.substring(0, 147) + "..."
  }

  const rawStatus = get("status")?.toLowerCase()
  const status = rawStatus && ["inativo", "inactive", "0", "false", "desativado"].includes(rawStatus) ? "inativo" : "ativo"

  if (entityType === "customers") {
    return {
      id: `import-${Date.now()}-${index}`,
      name,
      email: get("email"),
      phone: get("phone"),
      phone_fixed: get("phone_fixed"),
      cpf: get("cpf"),
      cnpj: get("cnpj"),
      birth_date: get("birth_date"),
      notes: get("notes"),
      street: get("street"),
      number: get("number"),
      complement: get("complement"),
      neighborhood: get("neighborhood"),
      city: get("city"),
      state: get("state"),
      zip_code: get("zip_code"),
      inscricao_estadual: get("inscricao_estadual"),
      status,
      is_active: status === "ativo",
      created_at: new Date().toISOString(),
    }
  }

  if (entityType === "appointments") {
    const priceStr = get("price")
    const price = priceStr ? parseFloat(priceStr.replace(/R\$/gi, "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "")) || 0 : 0
    return {
      id: `import-${Date.now()}-${index}`,
      customer_name: get("customer_name") || name || "Cliente Sem Nome",
      customer_phone: get("customer_phone"),
      customer_email: get("customer_email"),
      service_name: get("service_name") || "Atendimento Geral",
      start_date: get("start_date") || new Date().toISOString().split("T")[0],
      start_time: get("start_time") || "09:00",
      end_time: get("end_time") || "10:00",
      duration_minutes: get("duration_minutes") ? parseInt(get("duration_minutes")!.replace(/\D/g, "")) : 60,
      staff_name: get("staff_name") || "Profissional",
      price,
      status: get("status") || "Confirmado",
      notes: get("notes"),
      created_at: new Date().toISOString(),
    }
  }

  if (entityType === "services") {
    const priceStr = get("price")
    const price = priceStr ? parseFloat(priceStr.replace(/R\$/gi, "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "")) || 0 : 0
    const rawVis = get("visibility_scope")?.toLowerCase()
    let visibility_scope = "all"
    if (rawVis && ["privado", "selecionado", "selected"].includes(rawVis)) visibility_scope = "selected"
    else if (rawVis && ["exclusivo", "exclusive"].includes(rawVis)) visibility_scope = "exclusive"

    return {
      id: `import-${Date.now()}-${index}`,
      name,
      sku: get("sku"),
      price,
      cost_price: get("cost_price") ? parseFloat(get("cost_price")!.replace(/R\$/gi, "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "")) : null,
      description: get("description"),
      category: get("category"),
      duration_minutes: get("duration_minutes") ? parseInt(get("duration_minutes")!.replace(/\D/g, "")) : 60,
      unit: get("unit") || "Serviço",
      service_type: get("service_type") || "Presencial",
      status,
      visibility_scope,
      is_active: status === "ativo",
      created_at: new Date().toISOString(),
    }
  }

  const rawPrice = get("price")
  const price = rawPrice ? parseFloat(rawPrice.replace(/R\$/gi, "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "")) || 0 : 0
  const rawStock = get("stock_quantity")
  const stock = rawStock ? parseInt(rawStock.replace(/\D/g, "")) || 0 : 0
  const rawVis = get("show_in_marketplace")?.toLowerCase()
  const show_in_marketplace = !(rawVis && ["oculto", "privado", "unpublished", "inativo", "0", "false", "nao", "não"].includes(rawVis))
  const variant_type = get("variant_type")
  const variants = get("variants")

  return {
    id: `import-${Date.now()}-${index}`,
    name,
    sku: get("sku"),
    price,
    stock_quantity: stock,
    cost_price: get("cost_price") ? parseFloat(get("cost_price")!.replace(/R\$/gi, "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "")) : null,
    gtin: get("gtin"),
    category: get("category"),
    subcategory: get("subcategory"),
    brand: get("brand"),
    supplier: get("supplier"),
    variant_type,
    variants,
    unit: get("unit") || "UN",
    description: get("description"),
    ncm: get("ncm"),
    cest: get("cest"),
    status,
    show_in_marketplace,
    is_active: status === "ativo",
    condition: get("condition") || "Novo",
    product_type: get("product_type") || "Físico",
    min_stock: get("min_stock") ? parseInt(get("min_stock")!.replace(/\D/g, "")) : null,
    show_price_in_store: true,
    images: [],
    created_at: new Date().toISOString(),
    partner_id: "",
    rating: 0,
  }
}
