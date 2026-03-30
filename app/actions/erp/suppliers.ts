"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidatePath } from "next/cache"
import { redirect } from 'next/navigation'
import { requireUser, requirePartnerAccessWithPermission, requireSupplierOwnership } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

import { generateUniqueSupplierCode } from "@/lib/utils/code-generators"
import { createAddressAction } from "@/app/actions/shared/addresses"
import { canUseFeature } from "@/lib/services/subscription.service"

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
    notes: data.notes || null,
    supplier_code: supplierCode,
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
    notes: data.notes || null,
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
      notes: data.notes || null,
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
      notes: data.notes || null,
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
