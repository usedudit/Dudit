"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireUser, requirePartnerAccessWithPermission, requireCustomerOwnership } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { createAddressAction } from "@/app/actions/shared/addresses"

export async function createComprehensiveCustomerAction(data: {
  partnerId: string
  name: string
  email: string
  phone: string
  personType: "pf" | "pj" | "foreign"
  cpf?: string | null
  contribuinte?: string | null
  cnpj?: string | null
  nomeFantasia?: string | null
  inscricaoEstadual?: string | null
  regimeTributario?: string | null
  contribuinteIcms?: string | null
  country?: string | null
  zipCode: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
  municipioCodigoIbge?: string | null
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

  await requirePartnerAccessWithPermission(data.partnerId, "customers", "create")

  if (!data.name.trim()) {
    return { error: "Nome é obrigatório" }
  }

  const supabase = await getSupabaseServerClient()

  const { data: newCustomer, error } = await supabase.from("customers").insert({
    partner_id: data.partnerId,
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    person_type: data.personType,
    cpf: data.cpf || null,
    contribuinte: data.contribuinte || null,
    cnpj: data.cnpj || null,
    nome_fantasia: data.nomeFantasia || null,
    inscricao_estadual: data.inscricaoEstadual || null,
    regime_tributario: data.regimeTributario || null,
    contribuinte_icms: data.contribuinteIcms || null,
  }).select().single()

  if (error) {
    return { error: error.message }
  }

  // Criar endereço na tabela addresses
  if (data.street || data.city) {
    await createAddressAction({
      entityId: newCustomer.id,
      entityType: "customer",
      zipCode: data.zipCode || "",
      street: data.street || "",
      number: data.number || "",
      complement: data.complement,
      neighborhood: data.neighborhood || "",
      city: data.city || "",
      state: data.state || "",
      country: data.country || "BR",
      municipioCodigoIbge: data.municipioCodigoIbge || undefined,
      isDefault: true,
      csrf_token: data.csrf_token,
    })
  }

  revalidatePath("/erp/customers")
  redirect("/erp/customers")
}

export async function createCustomerAction(data: {
  partnerId: string
  name: string
  email: string
  phone: string
  address: string
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

  await requirePartnerAccessWithPermission(data.partnerId, "customers", "create")


  const supabase = await getSupabaseServerClient()

  const { error } = await supabase.from("customers").insert({
    partner_id: data.partnerId,
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    address: data.address || null,
    notes: data.notes || null,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/erp/customers")

  redirect("/erp/customers")
}

export async function updateCustomerAction(
  customerId: string,
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

  await requireCustomerOwnership(customerId)


  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("customers")
    .update({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      notes: data.notes || null,
    })
    .eq("id", customerId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/erp/customers")

  redirect("/erp/customers")
}

export async function deleteCustomerAction(customerId: string, csrf_token?: string) {
  // Validate CSRF token
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const user = await requireUser()

  await requireCustomerOwnership(customerId)


  const supabase = await getSupabaseServerClient()

  const { error } = await supabase.from("customers").delete().eq("id", customerId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/erp/customers")

  redirect("/erp/customers")
}

export async function updateComprehensiveCustomerAction(data: {
  customerId: string
  partnerId: string
  name: string
  email: string
  phone: string
  personType: "pf" | "pj" | "foreign"
  cpf?: string | null
  contribuinte?: string | null
  cnpj?: string | null
  nomeFantasia?: string | null
  inscricaoEstadual?: string | null
  regimeTributario?: string | null
  contribuinteIcms?: string | null
  country?: string | null
  zipCode: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
  municipioCodigoIbge?: string | null
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

  await requireCustomerOwnership(data.customerId)


  const supabase = await getSupabaseServerClient()

  // SECURITY: partner_id is intentionally excluded from the update payload.
  // A customer's tenant ownership must NEVER be changeable via update.
  const { error } = await supabase
    .from("customers")
    .update({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      address: [data.street, data.number, data.complement, data.neighborhood, data.city, data.state]
        .filter(Boolean)
        .join(", "),
      person_type: data.personType,
      cpf: data.cpf || null,
      contribuinte: data.contribuinte || null,
      cnpj: data.cnpj || null,
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
    })
    .eq("id", data.customerId)
    .eq("partner_id", data.partnerId) // Defense in depth

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/erp/customers")
  return { success: true }
}

export async function getCustomerOrdersAction(customerId: string) {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" }

  const supabase = await getSupabaseServerClient()

  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      created_at,
      situation,
      total_amount,
      order_items ( id )
    `)
    .eq("buyer_id", customerId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  const formattedOrders = orders.map((o: any) => {
    const date = new Date(o.created_at)
    const dateStr = `${date.getDate()} ${date.toLocaleString('pt-BR', { month: 'short' }).substring(0, 3)} ${date.getFullYear()}`

    let status = o.situation
    if (status === 'paid' || status === 'delivered') status = 'Paid'
    else if (status === 'cancelled') status = 'Cancelled'
    else status = 'Pending'

    return {
      id: o.order_number || o.id.substring(0, 8),
      date: dateStr,
      total: o.total_amount,
      status: status,
      items: o.order_items ? o.order_items.length : 0
    }
  })

  return { orders: formattedOrders }
}