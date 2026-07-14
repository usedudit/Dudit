"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidatePath } from "next/cache"
import { redirect } from 'next/navigation'
import { requireUser, requirePartnerAccessWithPermission, requireSupplierOwnership } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeNotes } from "@/lib/input-validator"

import { generateUniqueSupplierCode } from "@/lib/utils/code-generators"
import { createAddressAction } from "@/app/actions/shared/addresses"
import { canUseFeature } from "@/lib/services/subscription.service"
import { revalidateSuppliers } from "@/lib/utils/revalidation"

export async function createComprehensiveSupplierAction(data: {
  partnerId: string
  name: string
  email?: string
  phone?: string
  personType: string
  cpf?: string
  contribuinte?: string
  cnpj?: string
  nomeFantasia?: string
  inscricaoEstadual?: string
  regimeTributario?: string
  contribuinteIcms?: string
  country?: string
  zipCode?: string
  street?: string
  number?: string
  complement?: string
  neighborhood?: string
  city?: string
  state?: string
  municipioCodigoIbge?: string
  notes?: string
  image_url?: string | null
  csrf_token?: string
}) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  // Validate CSRF token
  const { requireCSRF, extractCSRFTokenFromObject } = await import("@/lib/security/csrf-action-wrapper")
  const csrfToken = extractCSRFTokenFromObject(data as Record<string, unknown>)
  const csrfValidation = await requireCSRF(csrfToken)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const user = await requireUser()

  await requirePartnerAccessWithPermission(data.partnerId, "products", "create")

  // Check subscription feature
  if (!await canUseFeature(data.partnerId, "supplier_management")) {
    return { error: "Seu plano não permite o cadastro de fornecedores. Faça upgrade para desbloquear esta função." }
  }

  if (!data.name.trim()) {
    return { error: "Nome é obrigatório" }
  }

  const supabase = await getSupabaseServerClient()

  const supplierCode = await generateUniqueSupplierCode(supabase)

  // Criar supplier SEM colunas de endereço
  const { data: newSupplier, error } = await supabase.from("suppliers").insert({
    partner_id: data.partnerId,
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    person_type: data.personType || null,
    cpf: data.cpf ? data.cpf.replace(/\D/g, "") : null,
    contribuinte: data.contribuinte || null,
    cnpj: data.cnpj ? data.cnpj.replace(/\D/g, "") : null,
    nome_fantasia: data.nomeFantasia || null,
    inscricao_estadual: data.inscricaoEstadual || null,
    regime_tributario: data.regimeTributario || null,
    contribuinte_icms: data.contribuinteIcms || null,
    notes: sanitizeNotes(data.notes),
    supplier_code: supplierCode,
    image_url: data.image_url || null,
  }).select().single()

  if (error) {
    return { error: error.message }
  }

  // Criar endereço na tabela addresses se dados foram fornecidos
  if (data.street || data.city) {
    await createAddressAction({
      entityId: newSupplier.id,
      entityType: "supplier",
      zipCode: data.zipCode || "",
      street: data.street || "",
      number: data.number || "",
      complement: data.complement,
      neighborhood: data.neighborhood || "",
      city: data.city || "",
      state: data.state || "",
      country: data.country || "BR",
      municipioCodigoIbge: data.municipioCodigoIbge,
      isDefault: true,
      csrf_token: data.csrf_token,
    })
  }

  revalidatePath("/erp/suppliers")
  redirect("/erp/suppliers")
}

export async function createSupplierAction(data: {
  partnerId: string
  name: string
  email: string
  phone: string
  address: string
  cnpj?: string
  notes: string
  csrf_token?: string
}) {
  // Validate CSRF token
  const { requireCSRF, extractCSRFTokenFromObject } = await import("@/lib/security/csrf-action-wrapper")
  const csrfToken = extractCSRFTokenFromObject(data as Record<string, unknown>)
  const csrfValidation = await requireCSRF(csrfToken)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const user = await requireUser()

  await requirePartnerAccessWithPermission(data.partnerId, "products", "create")

  // Check subscription feature
  if (!await canUseFeature(data.partnerId, "supplier_management")) {
    return { error: "Seu plano não permite o cadastro de fornecedores. Faça upgrade para desbloquear esta função." }
  }

  const supabase = await getSupabaseServerClient()

  const supplierCode = await generateUniqueSupplierCode(supabase)

  const { data: newSupplier, error } = await supabase.from("suppliers").insert({
    partner_id: data.partnerId,
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    cnpj: data.cnpj ? data.cnpj.replace(/\D/g, "") : null,
    notes: sanitizeNotes(data.notes),
    supplier_code: supplierCode,
  }).select().single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/erp/suppliers")

  redirect("/erp/suppliers")
}

export async function updateSupplierAction(
  supplierId: string,
  data: {
    name: string
    email: string
    phone: string
    address: string
    notes: string
    csrf_token?: string
  },
) {
  // Validate CSRF token
  const { requireCSRF, extractCSRFTokenFromObject } = await import("@/lib/security/csrf-action-wrapper")
  const csrfToken = extractCSRFTokenFromObject(data as Record<string, unknown>)
  const csrfValidation = await requireCSRF(csrfToken)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const user = await requireUser()

  await requireSupplierOwnership(supplierId)


  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("suppliers")
    .update({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      notes: sanitizeNotes(data.notes),
      updated_at: new Date().toISOString(),
    })
    .eq("id", supplierId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/erp/suppliers")

  redirect("/erp/suppliers")
}

export async function deleteSupplierAction(supplierId: string, csrf_token?: string) {
  // Validate CSRF token
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const user = await requireUser()

  await requireSupplierOwnership(supplierId)


  const supabase = await getSupabaseServerClient()

  const { error } = await supabase.from("suppliers").delete().eq("id", supplierId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/erp/suppliers")

  redirect("/erp/suppliers")
}

export async function updateComprehensiveSupplierAction(data: {
  supplierId: string
  partnerId: string
  name: string
  email?: string
  phone?: string
  personType: string
  cpf?: string
  contribuinte?: string
  cnpj?: string
  nomeFantasia?: string
  inscricaoEstadual?: string
  regimeTributario?: string
  contribuinteIcms?: string
  country?: string
  zipCode?: string
  street?: string
  number?: string
  complement?: string
  neighborhood?: string
  city?: string
  state?: string
  municipioCodigoIbge?: string
  notes?: string
  image_url?: string | null
  csrf_token?: string
}) {
  // Validate CSRF token
  const { requireCSRF, extractCSRFTokenFromObject } = await import("@/lib/security/csrf-action-wrapper")
  const csrfToken = extractCSRFTokenFromObject(data as Record<string, unknown>)
  const csrfValidation = await requireCSRF(csrfToken)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const user = await requireUser()

  await requireSupplierOwnership(data.supplierId)


  const supabase = await getSupabaseServerClient()

  // SECURITY: partner_id is intentionally excluded from the update payload.
  // A supplier's tenant ownership must NEVER be changeable via update.
  const { error } = await supabase
    .from("suppliers")
    .update({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      person_type: data.personType || null,
      cpf: data.cpf ? data.cpf.replace(/\D/g, "") : null,
      contribuinte: data.contribuinte || null,
      cnpj: data.cnpj ? data.cnpj.replace(/\D/g, "") : null,
      nome_fantasia: data.nomeFantasia || null,
      inscricao_estadual: data.inscricaoEstadual || null,
      regime_tributario: data.regimeTributario || null,
      contribuinte_icms: data.contribuinteIcms || null,
      country: data.country || null,
      zip_code: data.zipCode || null,
      street: data.street || null,
      number: data.number || null,
      complement: data.complement || null,
      neighborhood: data.neighborhood || null,
      city: data.city || null,
      state: data.state || null,
      municipio_codigo_ibge: data.municipioCodigoIbge || null,
      notes: sanitizeNotes(data.notes),
      image_url: data.image_url || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.supplierId)
    .eq("partner_id", data.partnerId) // Defense in depth

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/erp/suppliers")
  return { success: true }
}

export async function duplicateSupplierAction(supplierId: string) {
  const user = await requireUser()

  await requireSupplierOwnership(supplierId)


  const supabase = await getSupabaseServerClient()

  const { data: originalSupplier, error: fetchError } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", supplierId)
    .single()

  if (fetchError || !originalSupplier) {
    return { error: "Fornecedor não encontrado" }
  }

  // Check subscription feature
  if (!await canUseFeature(originalSupplier.partner_id, "supplier_management")) {
    return { error: "Seu plano não permite o cadastro de fornecedores. Faça upgrade para desbloquear esta função." }
  }

  const newSupplierCode = await generateUniqueSupplierCode(supabase)

  const { error: createError } = await supabase
    .from("suppliers")
    .insert({
      partner_id: originalSupplier.partner_id,
      name: `${originalSupplier.name} (copia)`,
      email: originalSupplier.email,
      phone: originalSupplier.phone,
      person_type: originalSupplier.person_type,
      cpf: originalSupplier.cpf,
      contribuinte: originalSupplier.contribuinte,
      cnpj: originalSupplier.cnpj,
      nome_fantasia: originalSupplier.nome_fantasia,
      inscricao_estadual: originalSupplier.inscricao_estadual,
      regime_tributario: originalSupplier.regime_tributario,
      contribuinte_icms: originalSupplier.contribuinte_icms,
      country: originalSupplier.country,
      zip_code: originalSupplier.zip_code,
      street: originalSupplier.street,
      number: originalSupplier.number,
      complement: originalSupplier.complement,
      neighborhood: originalSupplier.neighborhood,
      city: originalSupplier.city,
      state: originalSupplier.state,
      municipio_codigo_ibge: originalSupplier.municipio_codigo_ibge,
      notes: originalSupplier.notes,
      supplier_code: newSupplierCode, // New unique code
    })

  if (createError) {
    return { error: createError.message }
  }

  revalidatePath("/erp/suppliers")
  return { success: true }
}

// ─── Cursor-based pagination for the suppliers page ───────────────────────

export type ERPSupplierListCursor = { createdAt: string; id: string }

function buildSupplierKeysetOrFilter(cursor: ERPSupplierListCursor): string {
  const ts = cursor.createdAt
  const id = cursor.id
  const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`
  return `created_at.lt.${q(ts)},and(created_at.eq.${q(ts)},id.lt.${q(id)})`
}

const ERP_SUPPLIERS_PAGE_SIZE = 100

export async function getERPSuppliersPageAction(
  partnerId: string,
  options?: { cursor?: ERPSupplierListCursor | null; limit?: number },
): Promise<
  | { success: true; items: any[]; nextCursor: ERPSupplierListCursor | null; hasMore: boolean }
  | { success: false; error: string }
> {
  try {
    await requirePermission(partnerId, "suppliers", "view")
    const supabase = await getSupabaseServerClient()

    const cursor = options?.cursor ?? null
    const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || ERP_SUPPLIERS_PAGE_SIZE))))
    const fetchLimit = limit + 1

    let q = supabase
      .from("suppliers")
      .select("id, name, email, phone, person_type, cpf, cnpj, nome_fantasia, inscricao_estadual, status, created_at, supplier_code, notes")
      .eq("partner_id", partnerId)

    if (cursor) {
      q = q.or(buildSupplierKeysetOrFilter(cursor))
    }

    const { data, error } = await q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(fetchLimit)

    if (error) throw error

    const rows = data || []
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows

    // Aggregate XML import stats for this page of suppliers
    const supplierIds = items.map((s: any) => s.id).filter(Boolean)
    if (supplierIds.length > 0) {
      const { data: xmlAgg } = await supabase
        .from("xml_imports")
        .select("supplier_id, total_value, created_at, id")
        .in("supplier_id", supplierIds)
        .neq("status", "reversed")

      if (xmlAgg) {
        const statsMap = new Map<string, { xml_count: number; total_value: number; last_import_at: string | null }>()
        for (const x of xmlAgg) {
          const prev = statsMap.get(x.supplier_id) || { xml_count: 0, total_value: 0, last_import_at: null }
          prev.xml_count++
          prev.total_value += Number(x.total_value) || 0
          if (x.created_at && (!prev.last_import_at || x.created_at > prev.last_import_at)) {
            prev.last_import_at = x.created_at
          }
          statsMap.set(x.supplier_id, prev)
        }
        for (const item of items) {
          const stats = statsMap.get(item.id)
          item.xml_count = stats?.xml_count || 0
          item.total_imported_value = stats?.total_value || 0
          item.last_import_at = stats?.last_import_at || null
        }
      }
    }

    const last = items[items.length - 1]
    const nextCursor: ERPSupplierListCursor | null =
      hasMore && last?.created_at && last?.id ? { createdAt: String(last.created_at), id: String(last.id) } : null

    // Decrypt CPFs
    const { decryptCPF } = await import("@/lib/crypto")
    await Promise.all(items.map(async (item: any) => {
      if (item.cpf) {
        try { item.cpf = await decryptCPF(item.cpf) } catch { /* keep encrypted */ }
      }
    }))

    return { success: true, items, nextCursor, hasMore }
  } catch (e: any) {
    return { success: false, error: e?.message || "Erro ao carregar fornecedores" }
  }
}

export async function getSupplierByIdAction(supplierId: string) {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" }

  const supabase = await getSupabaseServerClient()

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", supplierId)
    .maybeSingle()

  if (!supplier) return { error: "Fornecedor não encontrado" }

  if (supplier.cpf) {
    try {
      const { decryptCPF } = await import("@/lib/crypto")
      supplier.cpf = await decryptCPF(supplier.cpf)
    } catch { /* keep encrypted */ }
  }

  return { supplier }
}

export async function deleteSuppliersInBatchAction(supplierIds: string[]) {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" }

  const supabase = await getSupabaseServerClient()

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("partner_id")
    .in("id", supplierIds)

  if (!suppliers || suppliers.length !== supplierIds.length) {
    return { error: "Um ou mais fornecedores não encontrados" }
  }

  const partnerIds = [...new Set(suppliers.map((s: { partner_id: string }) => s.partner_id))] as string[]
  if (partnerIds.length !== 1) {
    return { error: "Fornecedores de lojas diferentes" }
  }

  const partnerId = partnerIds[0]
  await requirePermission(partnerId, "suppliers", "delete", user)

  const { error } = await supabase
    .from("suppliers")
    .delete()
    .in("id", supplierIds)
    .eq("partner_id", partnerId)

  if (error) return { error: error.message }

  revalidateSuppliers(partnerId)
  revalidatePath("/erp/suppliers")
  return { success: true }
}

export async function toggleSuppliersStatusAction(supplierIds: string[], isActive: boolean) {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" }

  const supabase = await getSupabaseServerClient()

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("partner_id")
    .in("id", supplierIds)

  if (!suppliers || suppliers.length !== supplierIds.length) {
    return { error: "Um ou mais fornecedores não encontrados" }
  }

  const partnerIds = [...new Set(suppliers.map((s: { partner_id: string }) => s.partner_id))] as string[]
  if (partnerIds.length !== 1) {
    return { error: "Fornecedores de lojas diferentes" }
  }

  const partnerId = partnerIds[0]
  await requirePermission(partnerId, "suppliers", "edit", user)

  const { error } = await supabase
    .from("suppliers")
    .update({ status: isActive ? "ativo" : "inativo", updated_at: new Date().toISOString() })
    .in("id", supplierIds)
    .eq("partner_id", partnerId)

  if (error) return { error: error.message }

  revalidateSuppliers(partnerId)
  revalidatePath("/erp/suppliers")
  return { success: true }
}

export async function createSupplierQuickAction(input: {
  partnerId: string
  name: string
  email?: string
  phone?: string
  cnpj?: string
}) {
  await requireUser()
  await requirePermission(input.partnerId, "suppliers", "create")

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const name = String(input.name || "").trim()
  const email = String(input.email || "").trim().toLowerCase()
  const phone = String(input.phone || "").trim()
  const cnpjDigits = String(input.cnpj || "").replace(/\D/g, "")

  if (!name) return { success: false as const, error: "Informe o nome do fornecedor." }

  const supabase = await getSupabaseServerClient()

  if (email) {
    const { data: existingEmail } = await supabase
      .from("suppliers")
      .select("id")
      .eq("partner_id", input.partnerId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle()
    if (existingEmail?.id) {
      return { success: false as const, error: "Já existe fornecedor com este email." }
    }
  }

  if (cnpjDigits) {
    const { data: existingCnpj } = await supabase
      .from("suppliers")
      .select("id")
      .eq("partner_id", input.partnerId)
      .eq("cnpj", cnpjDigits)
      .limit(1)
      .maybeSingle()
    if (existingCnpj?.id) {
      return { success: false as const, error: "Já existe fornecedor com este CNPJ." }
    }
  }

  const supplierCode = await generateUniqueSupplierCode(supabase)

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .insert({
      partner_id: input.partnerId,
      name,
      email: email || null,
      phone: phone || null,
      cnpj: cnpjDigits || null,
      supplier_code: supplierCode,
      status: "ativo",
    })
    .select("id, name, email, phone, cnpj")
    .single()

  if (error) return { success: false as const, error: error.message }

  return {
    success: true as const,
    data: {
      id: supplier.id,
      name: supplier.name,
      email: supplier.email || null,
      phone: supplier.phone || null,
      cnpj: supplier.cnpj || null,
    },
  }
}

export async function getSupplierXmlImportsAction(supplierId: string) {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" }

  const supabase = await getSupabaseServerClient()

  await requireSupplierOwnership(supplierId)

  const { data: xmlImports, error } = await supabase
    .from("xml_imports")
    .select("id, access_key, total_value, created_at, status, invoice_number, invoice_series, invoice_date")
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { xmlImports }
}
