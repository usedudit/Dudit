"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { revalidateCustomers } from "@/lib/utils/revalidation"
import { redirect } from "next/navigation"
import { formatDate, formatTime } from "@/lib/utils"
import { decryptCPF, encryptCPF } from "@/lib/crypto"
import { getDeliveryStatusMeta, getDeliveryStatusLabelForType } from "@/lib/orders/status"
import { requireUser, requireCustomerOwnership } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { createAddressAction } from "@/app/actions/shared/addresses"
import { validateCPF, validateCNPJ, validateEmail, validatePhoneBR, validateURL, validateCEP } from "@/lib/input-validator"

async function prepareEncryptedCpf(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  partnerId: string,
  cpf?: string | null,
  currentCustomerId?: string,
) {
  if (!cpf) {
    return { cpf: null }
  }

  if (!validateCPF(cpf)) {
    return { error: "CPF invÃ¡lido" }
  }

  const cleanCpf = cpf.replace(/\D/g, "")

  const cpfQuery = supabase
    .from("customers")
    .select("id, cpf")
    .eq("partner_id", partnerId)
    .not("cpf", "is", null)

  const { data: existingCpfs, error: fetchError } = currentCustomerId
    ? await cpfQuery.neq("id", currentCustomerId)
    : await cpfQuery

  if (fetchError) {
    console.error("Erro ao buscar CPFs de clientes para verificar unicidade:", fetchError)
  } else if (existingCpfs && existingCpfs.length > 0) {
    for (const row of existingCpfs) {
      try {
        const decrypted = await decryptCPF(row.cpf)
        if (decrypted === cleanCpf) {
          return { error: "JÃ¡ existe um cliente com este CPF." }
        }
      } catch {
        continue
      }
    }
  }

  try {
    return { cpf: await encryptCPF(cleanCpf) }
  } catch (err) {
    console.error("Error encrypting CPF:", err)
    return { error: "Erro ao criptografar o CPF" }
  }
}

export async function createComprehensiveCustomerAction(data: {
  partnerId: string
  name: string
  email: string
  phone: string
  phoneFixed?: string | null
  website?: string | null
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
  birthDate?: string | null
  motherName?: string | null
  fatherName?: string | null
  image_url?: string | null
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
    return { error: csrfValidation.error || "Token CSRF invÃ¡lido" }
  }

  const user = await requireUser()

  await requirePermission(data.partnerId, "customers", "create")

  if (!data.name.trim()) {
    return { error: "Nome é obrigatório" }
  }

  if (data.email && !validateEmail(data.email)) {
    return { error: "E-mail inválido" }
  }
  
  if (data.phone && !validatePhoneBR(data.phone)) {
    return { error: "Celular inválido. Use o formato (00) 90000-0000" }
  }
  
  if (data.phoneFixed && !validatePhoneBR(data.phoneFixed)) {
    return { error: "Telefone fixo inválido. Use o formato (00) 0000-0000" }
  }
  
  if (data.website && !validateURL(data.website)) {
    const urlWithProto = data.website.startsWith("http") ? data.website : `https://${data.website}`
    if (!validateURL(urlWithProto)) {
      return { error: "Website inválido" }
    }
  }

  if (data.personType === "pf" && data.cpf && !validateCPF(data.cpf)) {
    return { error: "CPF inválido" }
  }

  if (data.personType === "pj" && data.cnpj && !validateCNPJ(data.cnpj)) {
    return { error: "CNPJ inválido" }
  }

  if (data.zipCode && !validateCEP(data.zipCode)) {
    return { error: "CEP inválido" }
  }

  if (data.hasDifferentBillingAddress && data.billingZipCode && !validateCEP(data.billingZipCode)) {
    return { error: "CEP de cobrança inválido" }
  }

  // Check for existing customer before creating
  if (data.email || data.cpf) {
    const { findExistingCustomer } = await import("@/lib/services/marketplace-customer")
    const match = await findExistingCustomer({
      partnerId: data.partnerId,
      email: data.email || null,
      cpf: data.cpf || null,
    })
    if (match) {
      return {
        error: `Já existe um cliente cadastrado com este ${match.matchBy === "email" ? "e-mail" : "CPF"}: "${match.customer.name}".`,
        existingCustomerId: match.customer.id,
      }
    }
  }

  const supabase = await getSupabaseServerClient()
  const cpfResult = await prepareEncryptedCpf(supabase, data.partnerId, data.cpf)
  if (cpfResult.error) {
    return { error: cpfResult.error }
  }

  const { data: newCustomer, error } = await supabase.from("customers").insert({
    partner_id: data.partnerId,
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    phone_fixed: data.phoneFixed || null,
    website: data.website || null,
    person_type: data.personType,
    cpf: cpfResult.cpf,
    contribuinte: data.contribuinte || null,
    cnpj: data.cnpj ? data.cnpj.replace(/\D/g, "") : null,
    nome_fantasia: data.nomeFantasia || null,
    inscricao_estadual: data.inscricaoEstadual || null,
    regime_tributario: data.regimeTributario || null,
    contribuinte_icms: data.contribuinteIcms || null,
    store_credit: data.store_credit ?? 0,
    status: data.status || "ativo",
    notes: data.notes || null,
    birth_date: data.birthDate || null,
    mother_name: data.motherName || null,
    father_name: data.fatherName || null,
    image_url: data.image_url || null,
  }).select().single()

  if (error) {
    return { error: error.message }
  }

  // Criar endereÃ§o na tabela addresses
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
      console.error("[createComprehensiveCustomerAction] Erro ao salvar endereÃ§o principal:", addressResult.error)
    }
  }

  // Criar endereÃ§o de cobranÃ§a se for diferente
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
      console.error("[createComprehensiveCustomerAction] Erro ao salvar endereÃ§o de cobranÃ§a:", billingResult.error)
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
    return { error: csrfValidation.error || "Token CSRF invÃ¡lido" }
  }

  const user = await requireUser()

  await requireCustomerOwnership(customerId)

  const supabase = await getSupabaseServerClient()

  // Fetch partner_id BEFORE deleting so we can invalidate the correct cache tag
  const { data: customer } = await supabase.from("customers").select("partner_id").eq("id", customerId).single()
  const partnerId = customer?.partner_id || ""

  await requirePermission(partnerId, "customers", "delete", user)

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
  phoneFixed?: string | null
  website?: string | null
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
  birthDate?: string | null
  motherName?: string | null
  fatherName?: string | null
  image_url?: string | null
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
    return { error: csrfValidation.error || "Token CSRF invÃ¡lido" }
  }

  const user = await requireUser()

  await requireCustomerOwnership(data.customerId)
  await requirePermission(data.partnerId, "customers", "edit", user)

  const supabase = await getSupabaseServerClient()

  if (data.email && !validateEmail(data.email)) {
    return { error: "E-mail inválido" }
  }
  
  if (data.phone && !validatePhoneBR(data.phone)) {
    return { error: "Celular inválido. Use o formato (00) 90000-0000" }
  }
  
  if (data.phoneFixed && !validatePhoneBR(data.phoneFixed)) {
    return { error: "Telefone fixo inválido. Use o formato (00) 0000-0000" }
  }
  
  if (data.website && !validateURL(data.website)) {
    const urlWithProto = data.website.startsWith("http") ? data.website : `https://${data.website}`
    if (!validateURL(urlWithProto)) {
      return { error: "Website inválido" }
    }
  }

  if (data.personType === "pf" && data.cpf && !validateCPF(data.cpf)) {
    return { error: "CPF inválido" }
  }

  if (data.personType === "pj" && data.cnpj && !validateCNPJ(data.cnpj)) {
    return { error: "CNPJ inválido" }
  }

  if (data.zipCode && !validateCEP(data.zipCode)) {
    return { error: "CEP inválido" }
  }

  if (data.hasDifferentBillingAddress && data.billingZipCode && !validateCEP(data.billingZipCode)) {
    return { error: "CEP de cobrança inválido" }
  }
  const cpfResult = await prepareEncryptedCpf(supabase, data.partnerId, data.cpf, data.customerId)
  if (cpfResult.error) {
    return { error: cpfResult.error }
  }

  // SECURITY: partner_id is intentionally excluded from the update payload.
  // A customer's tenant ownership must NEVER be changeable via update.
  const { error } = await supabase
    .from("customers")
    .update({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      phone_fixed: data.phoneFixed || null,
      website: data.website || null,
      person_type: data.personType,
      cpf: cpfResult.cpf,
      contribuinte: data.contribuinte || null,
      cnpj: data.cnpj ? data.cnpj.replace(/\D/g, "") : null,
      nome_fantasia: data.nomeFantasia || null,
      inscricao_estadual: data.inscricaoEstadual || null,
      regime_tributario: data.regimeTributario || null,
      contribuinte_icms: data.contribuinteIcms || null,
      store_credit: data.store_credit,
      status: data.status || "ativo",
      notes: data.notes || null,
      birth_date: data.birthDate || null,
      mother_name: data.motherName || null,
      father_name: data.fatherName || null,
      image_url: data.image_url || null,
    })
    .eq("id", data.customerId)
    .eq("partner_id", data.partnerId) // Defense in depth

  if (error) {
    return { error: error.message }
  }

  // Sincronizar endereÃ§o na tabela addresses
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
        console.error("[updateComprehensiveCustomerAction] Erro ao atualizar endereÃ§o principal:", addressUpdateError.message)
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
        console.error("[updateComprehensiveCustomerAction] Erro ao criar novo endereÃ§o principal:", addressResult.error)
      }
    }
  }

  // Sincronizar endereÃ§o de cobranÃ§a
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
        console.error("[updateComprehensiveCustomerAction] Erro ao atualizar endereÃ§o de cobranÃ§a:", billingUpdateError.message)
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
        console.error("[updateComprehensiveCustomerAction] Erro ao criar novo endereÃ§o de cobranÃ§a:", billingResult.error)
      }
    }
  } else if (!data.hasDifferentBillingAddress) {
    // Se nÃ£o tiver mais endereÃ§o de cobranÃ§a diferente, remover existente se houver
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

export async function getCustomerByIdAction(customerId: string) {
  const user = await requireUser()
  if (!user) return { error: "NÃ£o autenticado" }

  const supabase = await getSupabaseServerClient()

  const { data: customer } = await supabase
    .from("customers")
    .select(`
      id, partner_id, name, email, phone, phone_fixed, status, person_type,
      cpf, cnpj, nome_fantasia, inscricao_estadual, contribuinte,
      store_credit, notes, birth_date, mother_name, father_name, website,
      created_at, zip_code, street, number, complement, neighborhood,
      city, state, country, user_id, marketplace_user_id, image_url
    `)
    .eq("id", customerId)
    .maybeSingle()

  if (!customer) {
    return { error: "Cliente nÃ£o encontrado" }
  }

  // Decrypt CPF if present
  if (customer.cpf) {
    try {
      customer.cpf = await decryptCPF(customer.cpf)
    } catch (e) {
      // keep encrypted
    }
  }

  const { getPartnerPlan } = await import("@/lib/services/subscription.service")
  const plan = await getPartnerPlan(customer.partner_id)
  customer.planSlug = plan?.slug || "free"

  // Dynamically add mobile property for compatibility with frontend components
  ;(customer as any).mobile = customer.phone

  // Aggregate order stats for KPI display (by buyer_id AND customer_id)
  const buyerIds = [customer.user_id, customer.marketplace_user_id].filter(Boolean)
  const conditions = [`customer_id.eq.${customer.id}`]
  if (buyerIds.length > 0) conditions.push(`buyer_id.in.(${buyerIds.join(",")})`)
  const { data: orderAgg } = await supabase
    .from("orders")
    .select("total_amount, created_at")
    .or(conditions.join(","))
    .neq("situation", "cancelled")

  if (orderAgg) {
    const totalOrders = orderAgg.length
    const totalSpent = orderAgg.reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0)
    const avgOrder = totalOrders > 0 ? totalSpent / totalOrders : 0
    let lastOrderDate: string | null = null
    for (const o of orderAgg) {
      if (o.created_at && (!lastOrderDate || o.created_at > lastOrderDate)) {
        lastOrderDate = o.created_at
      }
    }
    ;(customer as any).orders_count = totalOrders
    ;(customer as any).total_spent = totalSpent
    ;(customer as any).avg_order_value = avgOrder
    ;(customer as any).last_order_at = lastOrderDate
  } else {
    ;(customer as any).orders_count = 0
    ;(customer as any).total_spent = 0
    ;(customer as any).avg_order_value = 0
    ;(customer as any).last_order_at = null
  }

  return { customer }
}

export async function getCustomerOrdersAction(customerId: string) {
  const user = await requireUser()
  if (!user) return { error: "NÃ£o autenticado" }

  const supabase = await getSupabaseServerClient()
  const adminDb = createAdminClient()

  const { data: customer } = await supabase
    .from("customers")
    .select("id, user_id, marketplace_user_id")
    .eq("id", customerId)
    .maybeSingle()

  if (!customer) {
    return { orders: [] }
  }

  const buyerIds = [customer.user_id, customer.marketplace_user_id].filter(Boolean)

  const orderConditions = [`customer_id.eq.${customer.id}`]
  if (buyerIds.length > 0) orderConditions.push(`buyer_id.in.(${buyerIds.join(",")})`)

  const { data: orders, error } = await adminDb
    .from("orders")
    .select(`
      id,
      order_number,
      mp_payment_id,
      created_at,
      situation,
      payment_status,
      delivery_status,
      delivery_type,
      total_amount,
      paid_amount,
      customer_name,
      order_source,
      notes,
      order_items ( id, quantity, service_id, line_type )
    `)
    .or(orderConditions.join(","))
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    return { error: error.message, stats: null }
  }

  // Aggregate stats across ALL orders (no limit) for accurate KPIs
  const statsConditions = [`customer_id.eq.${customer.id}`]
  if (buyerIds.length > 0) statsConditions.push(`buyer_id.in.(${buyerIds.join(",")})`)

  const { data: statsRaw } = await adminDb
    .from("orders")
    .select("total_amount, created_at, situation")
    .or(statsConditions.join(","))
    .neq("situation", "cancelled")

  let stats = null
  if (statsRaw) {
    const totalOrders = statsRaw.length
    const totalSpent = statsRaw.reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0)
    const avgOrder = totalOrders > 0 ? totalSpent / totalOrders : 0
    let lastOrderDate: string | null = null
    for (const o of statsRaw) {
      if (o.created_at && (!lastOrderDate || o.created_at > lastOrderDate)) {
        lastOrderDate = o.created_at
      }
    }
    stats = { totalOrders, totalSpent, avgOrder, lastOrderDate }
  }

  const formattedOrders = orders.map((o: any) => {
    const deliveryInfo = getDeliveryStatusMeta(o.delivery_status) as any
    const orderItems = o.order_items || []
    const hasOnlyServices = orderItems.length > 0 && orderItems.every((item: any) => item.service_id || item.line_type === "service_booking")

    const statusMap: Record<string, { label: string; color: string }> = {
      paid: { label: "Pago", color: "green" },
      partially_paid: { label: "Parcialmente Pago", color: "orange" },
      shipped: { label: "Enviado", color: "blue" },
      delivered: { label: "Entregue", color: "green" },
      cancelled: { label: "Cancelado", color: "red" },
      in_process: { label: "Em anÃ¡lise", color: "yellow" },
      pending: { label: "Pendente", color: "gray" },
    }
    const statusInfo = statusMap[o.situation] || { label: o.situation, color: "gray" }

    return {
      id: o.order_number || o.mp_payment_id || `#${o.id.substring(0, 8)}`,
      originalId: o.id,
      date: formatDate(o.order_date || o.created_at),
      formattedTime: formatTime(o.order_date || o.created_at),
      total: o.total_amount,
      paidAmount: Number(o.paid_amount || 0),
      statusLabel: statusInfo.label,
      statusColor: statusInfo.color,
      situation: o.situation,
      delivery_status: o.delivery_status,
      delivery_type: o.delivery_type || "delivery",
      deliveryStatusLabel: getDeliveryStatusLabelForType(o.delivery_status, o.delivery_type),
      deliveryStatusColor: deliveryInfo.variant,
      items: o.order_items ? o.order_items.length : 0,
      items_count: orderItems.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0),
      customer_name: o.customer_name || "Consumidor final",
      order_source: o.order_source || "Manual",
      createdAt: o.order_date || o.created_at,
      hasOnlyServices,
    }
  })

  return { orders: formattedOrders, stats }
}

/**
 * Fetch all customers for a partner with store priority
 */
export async function getPartnerCustomersAction(partnerId: string, currentStoreId?: string | null) {
  try {
    const user = await requireUser()
    await requirePermission(partnerId, "customers", "view", user)

    const supabase = await getSupabaseServerClient()

    const { data: customers, error } = await supabase
      .from("customers")
      .select("id, name, email, phone, cpf, status, store_credit, created_at, store_id, partner_id, person_type, birth_date")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) {
      console.error("[getPartnerCustomersAction] Error:", error)
      return { error: error.message }
    }

    let result = customers || []

    // Decrypt CPFs in parallel
    await Promise.all(result.map(async (c: any) => {
      if (c.cpf) {
        try {
          c.cpf = await decryptCPF(c.cpf)
        } catch (e) {
          // Keep encrypted if decryption fails
        }
      }
    }))

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
  if (!user) return { error: "NÃ£o autenticado" }

  const supabase = await getSupabaseServerClient()

  // Verify all customers exist and belong to the same partner
  const { data: customers } = await supabase
    .from("customers")
    .select("partner_id")
    .in("id", customerIds)

  if (!customers || customers.length !== customerIds.length) {
    return { error: "Um ou mais clientes nÃ£o encontrados" }
  }

  const partnerIds = [...new Set(customers.map((c: { partner_id: string }) => c.partner_id))] as string[]
  if (partnerIds.length !== 1) {
    return { error: "Clientes de lojas diferentes" }
  }

  const partnerId = partnerIds[0]
  await requirePermission(partnerId, "customers", "delete", user)

  const { error } = await supabase
    .from("customers")
    .delete()
    .in("id", customerIds)
    .eq("partner_id", partnerId)

  if (error) {
    return { error: error.message }
  }

  revalidateCustomers(partnerId)
  revalidatePath("/erp/customers")
  return { success: true }
}

export async function toggleCustomersStatusAction(customerIds: string[], isActive: boolean) {
  const user = await requireUser()
  if (!user) return { error: "NÃ£o autenticado" }

  const supabase = await getSupabaseServerClient()

  const { data: customers } = await supabase
    .from("customers")
    .select("partner_id")
    .in("id", customerIds)

  if (!customers || customers.length !== customerIds.length) {
    return { error: "Um ou mais clientes nÃ£o encontrados" }
  }

  const partnerIds = [...new Set(customers.map((c: { partner_id: string }) => c.partner_id))] as string[]
  if (partnerIds.length !== 1) {
    return { error: "Clientes de lojas diferentes" }
  }

  const partnerId = partnerIds[0]

  await requirePermission(partnerId, "customers", "edit", user)

  const { error } = await supabase
    .from("customers")
    .update({ status: isActive ? "ativo" : "inativo" })
    .in("id", customerIds)
    .eq("partner_id", partnerId)

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
    await requirePermission(partnerId, "customers", "view")
    const supabase = await getSupabaseServerClient()

    const cursor = options?.cursor ?? null
    const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || ERP_CUSTOMERS_PAGE_SIZE))))
    const fetchLimit = limit + 1

    let q = supabase
      .from("customers")
      .select("id, partner_id, name, email, phone, phone_fixed, status, store_credit, created_at, store_id, cpf, person_type, cnpj, birth_date, user_id")
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

    // Decrypt CPFs in parallel
    await Promise.all(items.map(async (item: any) => {
      if (item.cpf) {
        try {
          item.cpf = await decryptCPF(item.cpf)
        } catch (e) {
          // Keep encrypted if decryption fails
        }
      }
    }))

    // Aggregate order stats for this page of customers (by buyer_id OR customer_id)
    const customerIds = items.map((c: any) => c.id).filter(Boolean)
    if (customerIds.length > 0) {
      const { data: orderAgg } = await supabase
        .from("orders")
        .select("buyer_id, customer_id, total_amount, created_at")
        .or(`buyer_id.in.(${customerIds.join(",")}),customer_id.in.(${customerIds.join(",")})`)
        .neq("situation", "cancelled")

      if (orderAgg) {
        const statsMap = new Map<string, { orders_count: number; total_spent: number; last_order_at: string | null }>()
        for (const o of orderAgg) {
          const key = customerIds.includes(o.buyer_id) ? o.buyer_id : o.customer_id
          if (!key) continue
          const prev = statsMap.get(key) || { orders_count: 0, total_spent: 0, last_order_at: null }
          prev.orders_count++
          prev.total_spent += Number(o.total_amount) || 0
          if (o.created_at && (!prev.last_order_at || o.created_at > prev.last_order_at)) {
            prev.last_order_at = o.created_at
          }
          statsMap.set(key, prev)
        }
        for (const item of items) {
          const stats = statsMap.get(item.id)
          item.orders_count = stats?.orders_count || 0
          item.total_spent = stats?.total_spent || 0
          item.last_order_at = stats?.last_order_at || null
        }
      }
    }

    const last = items[items.length - 1]
    const nextCursor: ERPCustomerListCursor | null =
      hasMore && last?.created_at && last?.id ? { createdAt: String(last.created_at), id: String(last.id) } : null

    return { success: true, items, nextCursor, hasMore }
  } catch (e: any) {
    return { success: false, error: e?.message || "Erro ao carregar clientes" }
  }
}

export async function getCustomerStoreCreditsAction(customerId: string) {
  const supabase = await getSupabaseServerClient()
  await requireUser()

  const { data, error } = await supabase
    .from("store_credits")
    .select("id, amount, remaining_amount, status, expires_at, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Erro ao buscar store_credits:", error)
    return { success: false, error: error.message }
  }

  return { success: true, storeCredits: data || [] }
}

