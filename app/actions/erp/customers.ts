"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidatePath } from "next/cache"
import { revalidateCustomers } from "@/lib/utils/revalidation"
import { redirect } from "next/navigation"
import { formatDate } from "@/lib/utils"
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
  store_credit?: number
  status?: string
  notes?: string | null
  csrf_token?: string
  hasDifferentBillingAddress?: boolean
  billingZipCode?: string
  billingStreet?: string
  billingNumber?: string
  billingComplement?: string
  billingNeighborhood?: string
  billingCity?: string
  billingState?: string
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
    cpf: data.cpf ? await (await import("@/lib/crypto")).encryptCPF(data.cpf.replace(/\D/g, "")) : null,
    contribuinte: data.contribuinte || null,
    cnpj: data.cnpj ? data.cnpj.replace(/\D/g, "") : null,
    nome_fantasia: data.nomeFantasia || null,
    inscricao_estadual: data.inscricaoEstadual || null,
    regime_tributario: data.regimeTributario || null,
    contribuinte_icms: data.contribuinteIcms || null,
    store_credit: data.store_credit ?? 0,
    status: data.status || "ativo",
    notes: data.notes || null,
  }).select().single()

  if (error) {
    return { error: error.message }
  }

  // Criar endereço na tabela addresses
  if (data.street || data.city) {
    const addressResult = await createAddressAction({
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
      addressType: "primary",
      isDefault: true,
      csrf_token: data.csrf_token,
    })
    
    if (addressResult && addressResult.error) {
      console.error("[createComprehensiveCustomerAction] Erro ao salvar endereço principal:", addressResult.error)
    }
  }

  // Criar endereço de cobrança se for diferente
  if (data.hasDifferentBillingAddress && (data.billingStreet || data.billingCity)) {
    const billingResult = await createAddressAction({
      entityId: newCustomer.id,
      entityType: "customer",
      zipCode: data.billingZipCode || "",
      street: data.billingStreet || "",
      number: data.billingNumber || "",
      complement: data.billingComplement,
      neighborhood: data.billingNeighborhood || "",
      city: data.billingCity || "",
      state: data.billingState || "",
      country: data.country || "BR",
      addressType: "billing",
      isDefault: false,
      csrf_token: data.csrf_token,
    })
    
    if (billingResult && billingResult.error) {
      console.error("[createComprehensiveCustomerAction] Erro ao salvar endereço de cobrança:", billingResult.error)
    }
  }

  revalidateCustomers(data.partnerId)
  revalidatePath("/erp/customers")
  return { success: true }
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

  // Fetch partner_id BEFORE deleting so we can invalidate the correct cache tag
  const { data: customer } = await supabase.from("customers").select("partner_id").eq("id", customerId).single()
  const partnerId = customer?.partner_id || ""

  const { error } = await supabase.from("customers").delete().eq("id", customerId)

  if (error) {
    return { error: error.message }
  }

  revalidateCustomers(partnerId)
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
  store_credit?: number
  status?: string
  notes?: string | null
  csrf_token?: string
  hasDifferentBillingAddress?: boolean
  billingZipCode?: string
  billingStreet?: string
  billingNumber?: string
  billingComplement?: string
  billingNeighborhood?: string
  billingCity?: string
  billingState?: string
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
      person_type: data.personType,
      cpf: data.cpf ? await (await import("@/lib/crypto")).encryptCPF(data.cpf.replace(/\D/g, "")) : null,
      contribuinte: data.contribuinte || null,
      cnpj: data.cnpj ? data.cnpj.replace(/\D/g, "") : null,
      nome_fantasia: data.nomeFantasia || null,
      inscricao_estadual: data.inscricaoEstadual || null,
      regime_tributario: data.regimeTributario || null,
      contribuinte_icms: data.contribuinteIcms || null,
      store_credit: data.store_credit,
      status: data.status || "ativo",
      notes: data.notes || null,
    })
    .eq("id", data.customerId)
    .eq("partner_id", data.partnerId) // Defense in depth

  if (error) {
    return { error: error.message }
  }

  // Sincronizar endereço na tabela addresses
  if (data.street || data.city) {
    const { data: existingAddresses } = await supabase
      .from("addresses")
      .select("id")
      .eq("customer_id", data.customerId)
      .eq("address_type", "primary")
      .limit(1)

    if (existingAddresses && existingAddresses.length > 0) {
      const { error: addressUpdateError } = await supabase.from("addresses").update({
        zip_code: data.zipCode,
        street: data.street,
        number: data.number,
        complement: data.complement || null,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        country: data.country || "BR",
        municipio_codigo_ibge: data.municipioCodigoIbge || null,
      }).eq("id", existingAddresses[0].id)
      
      if (addressUpdateError) {
        console.error("[updateComprehensiveCustomerAction] Erro ao atualizar endereço principal:", addressUpdateError.message)
      }
    } else {
      const addressResult = await createAddressAction({
        entityId: data.customerId,
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
        addressType: "primary",
        isDefault: true,
        csrf_token: data.csrf_token,
      })
      
      if (addressResult && addressResult.error) {
        console.error("[updateComprehensiveCustomerAction] Erro ao criar novo endereço principal:", addressResult.error)
      }
    }
  }

  // Sincronizar endereço de cobrança
  if (data.hasDifferentBillingAddress && (data.billingStreet || data.billingCity)) {
    const { data: existingBilling } = await supabase
      .from("addresses")
      .select("id")
      .eq("customer_id", data.customerId)
      .eq("address_type", "billing")
      .limit(1)

    if (existingBilling && existingBilling.length > 0) {
      const { error: billingUpdateError } = await supabase.from("addresses").update({
        zip_code: data.billingZipCode,
        street: data.billingStreet,
        number: data.billingNumber,
        complement: data.billingComplement || null,
        neighborhood: data.billingNeighborhood,
        city: data.billingCity,
        state: data.billingState,
        country: data.country || "BR",
      }).eq("id", existingBilling[0].id)
      
      if (billingUpdateError) {
        console.error("[updateComprehensiveCustomerAction] Erro ao atualizar endereço de cobrança:", billingUpdateError.message)
      }
    } else {
      const billingResult = await createAddressAction({
        entityId: data.customerId,
        entityType: "customer",
        zipCode: data.billingZipCode || "",
        street: data.billingStreet || "",
        number: data.billingNumber || "",
        complement: data.billingComplement,
        neighborhood: data.billingNeighborhood || "",
        city: data.billingCity || "",
        state: data.billingState || "",
        country: data.country || "BR",
        addressType: "billing",
        isDefault: false,
        csrf_token: data.csrf_token,
      })
      
      if (billingResult && billingResult.error) {
        console.error("[updateComprehensiveCustomerAction] Erro ao criar novo endereço de cobrança:", billingResult.error)
      }
    }
  } else if (!data.hasDifferentBillingAddress) {
    // Se não tiver mais endereço de cobrança diferente, remover existente se houver
    await supabase
      .from("addresses")
      .delete()
      .eq("customer_id", data.customerId)
      .eq("address_type", "billing")
  }

  revalidateCustomers(data.partnerId)
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
    const dateStr = formatDate(o.created_at)

    let status = o.situation
    if (status === 'paid' || status === 'delivered') status = 'Paid'
    else if (status === 'cancelled') status = 'Cancelled'
    else status = 'Pending'

    return {
      id: o.order_number || o.id.substring(0, 8),
      originalId: o.id,
      date: dateStr,
      total: o.total_amount,
      status: status,
      situation: o.situation,
      items: o.order_items ? o.order_items.length : 0,
      createdAt: o.created_at
    }
  })

  return { orders: formattedOrders }
}

/**
 * Fetch all customers for a partner with store priority
 */
export async function getPartnerCustomersAction(partnerId: string, currentStoreId?: string | null) {
  try {
    const user = await requireUser()
    await requirePartnerAccessWithPermission(partnerId, "customers", "view", user)

    const supabase = await getSupabaseServerClient()

    const { data: customers, error } = await supabase
      .from("customers")
      .select("*")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[getPartnerCustomersAction] Error:", error)
      return { error: error.message }
    }

    let result = customers || []

    const { decryptCPF } = await import("@/lib/crypto")
    for (const c of result) {
      if (c.cpf && c.cpf.startsWith("v")) {
        try {
          c.cpf = await decryptCPF(c.cpf)
        } catch (e) {
          // Ignore if decryption fails
        }
      }
    }

    // Prioritize: current store customers first, then others
    if (currentStoreId) {
      result = [...result].sort((a: any, b: any) => {
        if (a.store_id === currentStoreId && b.store_id !== currentStoreId) return -1
        if (a.store_id !== currentStoreId && b.store_id === currentStoreId) return 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    }

    return { customers: result }
  } catch (err: any) {
    console.error("[getPartnerCustomersAction] Error:", err)
    return { error: err.message || "Erro interno ao buscar clientes" }
  }
}

export async function deleteCustomersInBatchAction(customerIds: string[]) {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" }

  const supabase = await getSupabaseServerClient()

  // Fetch partner_id from the first customer so we can invalidate the correct cache
  const { data: firstCustomer } = await supabase.from("customers").select("partner_id").eq("id", customerIds[0]).single()
  const partnerId = firstCustomer?.partner_id || ""

  const { error } = await supabase
    .from("customers")
    .delete()
    .in("id", customerIds)

  if (error) {
    return { error: error.message }
  }

  revalidateCustomers(partnerId)
  revalidatePath("/erp/customers")
  return { success: true }
}

export async function toggleCustomersStatusAction(customerIds: string[], isActive: boolean) {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" }

  const supabase = await getSupabaseServerClient()

  // Fetch partner_id from the first customer so we can invalidate the correct cache
  const { data: firstCustomer } = await supabase.from("customers").select("partner_id").eq("id", customerIds[0]).single()
  const partnerId = firstCustomer?.partner_id || ""

  const { error } = await supabase
    .from("customers")
    .update({ status: isActive ? "ativo" : "inativo" })
    .in("id", customerIds)

  if (error) {
    return { error: error.message }
  }

  revalidateCustomers(partnerId)
  revalidatePath("/erp/customers")
  return { success: true }
}

export type ERPCustomerListCursor = { createdAt: string; id: string }

function buildCustomersKeysetOrFilter(cursor: ERPCustomerListCursor): string {
  const ts = cursor.createdAt
  const id = cursor.id
  const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`
  // Page after (created_at DESC, id DESC)
  return `created_at.lt.${q(ts)},and(created_at.eq.${q(ts)},id.lt.${q(id)})`
}

const ERP_CUSTOMERS_PAGE_SIZE = 100

export async function getERPCustomersPageAction(
  partnerId: string,
  options?: { cursor?: ERPCustomerListCursor | null; storeId?: string | null; limit?: number },
): Promise<
  | { success: true; items: any[]; nextCursor: ERPCustomerListCursor | null; hasMore: boolean }
  | { success: false; error: string }
> {
  try {
    await requirePartnerAccessWithPermission(partnerId, "customers", "view")
    const supabase = await getSupabaseServerClient()

    const cursor = options?.cursor ?? null
    const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || ERP_CUSTOMERS_PAGE_SIZE))))
    const fetchLimit = limit + 1

    let q = supabase
      .from("customers")
      .select("id, name, email, phone, status, store_credit, created_at, store_id")
      .eq("partner_id", partnerId)

    if (options?.storeId) {
      q = q.eq("store_id", options.storeId)
    }

    if (cursor) {
      q = q.or(buildCustomersKeysetOrFilter(cursor))
    }

    const { data, error } = await q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(fetchLimit)

    if (error) throw error

    const rows = data || []
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const last = items[items.length - 1]
    const nextCursor: ERPCustomerListCursor | null =
      hasMore && last?.created_at && last?.id ? { createdAt: String(last.created_at), id: String(last.id) } : null

    return { success: true, items, nextCursor, hasMore }
  } catch (e: any) {
    return { success: false, error: e?.message || "Erro ao carregar clientes" }
  }
}
