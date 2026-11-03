"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { revalidateCustomers } from "@/lib/utils/revalidation"
import { redirect } from "next/navigation"
import { formatDate, formatTime } from "@/lib/utils"
import { getCarrierBrandIcon } from "@/lib/utils/carrier-brand"
import { decryptCPF, encryptCPF } from "@/lib/crypto"
import { generateCpfLookupHash } from "@/lib/services/cpf-hash"
import { getDeliveryStatusMeta, getDeliveryStatusLabelForType } from "@/lib/orders/status"
import { requireUser, requireCustomerOwnership, requireStorePermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requirePermission } from "@/lib/permissions/access"
import { can } from "@/lib/permissions/can"
import type { RbacUserLike } from "@/lib/permissions/rbac-types"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeNotes, sanitizeInput } from "@/lib/input-validator"
import { createAddressAction } from "@/app/actions/shared/addresses"
import { enrichAddressData } from "@/lib/services/location.service"
import { validateCPF, validateCNPJ, validateEmail, validateBrazilMobile, validateBrazilLandline, validateURL, validateCEP } from "@/lib/input-validator"
import { buildSoftDeletePayload, buildRestorePayload, buildArchivePayload, scopeActiveOnly, scopeArchivedOnly, scopeWithArchived } from "@/lib/supabase/query-helpers"
import { checkLimit } from "@/lib/services/subscription.service"
import { requireAuthorizedCustomerContext, requireAuthorizedCustomerRecord } from "@/lib/services/authorized-customer-access"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { resolveRecordImage, validatePrivateRecordImageKey } from "@/lib/r2/private-record-image"

async function prepareEncryptedCpf(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  partnerId: string,
  cpf?: string | null,
  currentCustomerId?: string,
): Promise<{ cpf?: string | null; cpfLookupHash?: string | null; error?: string }> {
  if (!cpf) {
    return { cpf: null, cpfLookupHash: null }
  }

  if (!validateCPF(cpf)) {
    return { error: "CPF inválido" }
  }

  const cleanCpf = cpf.replace(/\D/g, "")
  const lookupHash = generateCpfLookupHash(cleanCpf)

  // 1. Verificação instantânea O(1) via índice parcial cpf_lookup_hash
  if (lookupHash) {
    let hashQuery = supabase
      .from("customers")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("cpf_lookup_hash", lookupHash)
      .is("deleted_at", null)

    if (currentCustomerId) {
      hashQuery = hashQuery.neq("id", currentCustomerId)
    }

    const { data: duplicateByHash } = await hashQuery.limit(1)
    if (duplicateByHash && duplicateByHash.length > 0) {
      return { error: "Já existe um cliente com este CPF." }
    }
  }

  // 2. Fallback de transição segura apenas para clientes legados sem hash preenchido
  let legacyQuery = supabase
    .from("customers")
    .select("id, cpf")
    .eq("partner_id", partnerId)
    .is("cpf_lookup_hash", null)
    .not("cpf", "is", null)
    .is("deleted_at", null)

  if (currentCustomerId) {
    legacyQuery = legacyQuery.neq("id", currentCustomerId)
  }

  const { data: legacyRows } = await legacyQuery.limit(50)
  if (legacyRows && legacyRows.length > 0) {
    for (const row of legacyRows) {
      try {
        const decrypted = await decryptCPF(row.cpf)
        if (decrypted === cleanCpf) {
          return { error: "Já existe um cliente com este CPF." }
        }
      } catch {
        continue
      }
    }
  }

  try {
    return {
      cpf: await encryptCPF(cleanCpf),
      cpfLookupHash: lookupHash,
    }
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
  razaoSocial?: string | null
  inscricaoEstadual?: string | null
  ieIsento?: boolean
  inscricaoMunicipal?: string | null
  crt?: string | null
  country?: string | null
  zipCode: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
  municipioCodigoIbge?: string | null
  latitude?: number | null
  longitude?: number | null
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

  const customerAccess = await requireAuthorizedCustomerContext(data.partnerId, "create")
  const user = customerAccess.user
  const partnerId = customerAccess.partnerId
  const admin = customerAccess.admin
  let imageUrl: string | null
  try {
    imageUrl = validatePrivateRecordImageKey(data.image_url, user.id, "customers")
  } catch (error: any) {
    return { error: error.message || "Imagem inválida." }
  }

  if (!data.name.trim()) {
    return { error: "Nome é obrigatório" }
  }

  if (data.email && !validateEmail(data.email)) {
    return { error: "E-mail inválido" }
  }

  if (data.phone && !validateBrazilMobile(data.phone)) {
    return { error: "Celular inválido. Use o formato (00) 90000-0000" }
  }

  if (data.phoneFixed && !validateBrazilLandline(data.phoneFixed)) {
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
      partnerId,
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

  const cpfResult = await prepareEncryptedCpf(admin, partnerId, data.cpf)
  if (cpfResult.error) {
    return { error: cpfResult.error }
  }

  const { data: newCustomer, error } = await admin.from("customers").insert({
    partner_id: partnerId,
    name: sanitizeInput(data.name, 150),
    email: data.email || null,
    phone: data.phone || null,
    phone_fixed: data.phoneFixed || null,
    website: data.website || null,
    person_type: data.personType,
    cpf: cpfResult.cpf,
    cpf_lookup_hash: cpfResult.cpfLookupHash,
    contribuinte: data.contribuinte || null,
    cnpj: data.cnpj ? data.cnpj.replace(/\D/g, "") : null,
    nome_fantasia: data.nomeFantasia ? sanitizeInput(data.nomeFantasia, 150) : null,
    razao_social: data.razaoSocial ? sanitizeInput(data.razaoSocial, 150) : null,
    inscricao_estadual: data.ieIsento ? "" : (data.inscricaoEstadual || null),
    ie_isento: data.ieIsento ?? false,
    inscricao_municipal: data.inscricaoMunicipal || null,
    crt: data.crt || null,
    store_credit: 0,
    status: data.status || "ativo",
    notes: sanitizeNotes(data.notes),
    birth_date: data.birthDate || null,
    mother_name: data.motherName ? sanitizeInput(data.motherName, 150) : null,
    father_name: data.fatherName ? sanitizeInput(data.fatherName, 150) : null,
    image_url: imageUrl,
  }).select("id").single()

  if (error) {
    return { error: error.message }
  }

  const addressJobs: Promise<any>[] = []

  // The two address writes are independent after the customer exists. Running
  // them together removes one sequential server roundtrip from the save flow.
  if (data.street || data.city) {
    addressJobs.push(createAddressAction({
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
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      csrf_token: data.csrf_token,
    }))
  }

  if (data.hasDifferentBillingAddress && (data.billingStreet || data.billingCity)) {
    addressJobs.push(createAddressAction({
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
    }))
  }

  const addressResults = await Promise.all(addressJobs)
  for (const [index, addressResult] of addressResults.entries()) {
    if (addressResult?.error) {
      console.error("[createComprehensiveCustomerAction] Erro ao salvar endereço:", index, addressResult.error)
    }
  }

  await revalidateCustomers(partnerId)
  revalidatePath("/erp/clientes")
  const resolvedImage = await resolveRecordImage({ image_url: imageUrl })
  return {
    success: true,
    data: {
      id: newCustomer.id,
      partner_id: partnerId,
      name: sanitizeInput(data.name, 150),
      email: data.email || null,
      phone: data.phone || null,
      phone_fixed: data.phoneFixed || null,
      status: data.status || "ativo",
      is_active: (data.status || "ativo") === "ativo",
      store_credit: 0,
      created_at: new Date().toISOString(),
      person_type: data.personType,
      image_url: resolvedImage.image_url || null,
      image_key: resolvedImage.image_key,
      city: data.city || null,
      state: data.state || null,
      orders_count: 0,
      total_spent: 0,
      last_order_at: null,
    },
  }
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

  const payload = buildSoftDeletePayload(user.id)
  const { error } = await supabase.from("customers").update(payload).eq("id", customerId)

  if (error) {
    return { error: error.message }
  }

  await revalidateCustomers(partnerId)
  revalidatePath("/erp/clientes")

  return { success: true }
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
  razaoSocial?: string | null
  inscricaoEstadual?: string | null
  ieIsento?: boolean
  inscricaoMunicipal?: string | null
  crt?: string | null
  country?: string | null
  zipCode: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
  municipioCodigoIbge?: string | null
  latitude?: number | null
  longitude?: number | null
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

  const customerAccess = await requireAuthorizedCustomerRecord(data.customerId, "edit")
  const partnerId = customerAccess.partnerId
  const supabase = customerAccess.admin
  const { data: existingImageRow, error: existingImageError } = await supabase
    .from("customers")
    .select("image_url")
    .eq("id", data.customerId)
    .eq("partner_id", partnerId)
    .maybeSingle()
  if (existingImageError || !existingImageRow) return { error: "Cliente não encontrado." }
  let imageUrl: string | null
  try {
    imageUrl = validatePrivateRecordImageKey(data.image_url, customerAccess.user.id, "customers", existingImageRow.image_url)
  } catch (error: any) {
    return { error: error.message || "Imagem inválida." }
  }

  if (data.email && !validateEmail(data.email)) {
    return { error: "E-mail inválido" }
  }

  if (data.phone && !validateBrazilMobile(data.phone)) {
    return { error: "Celular inválido. Use o formato (00) 90000-0000" }
  }

  if (data.phoneFixed && !validateBrazilLandline(data.phoneFixed)) {
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
  const cpfResult: { cpf?: string | null; cpfLookupHash?: string | null; error?: string } = !can(customerAccess as RbacUserLike, "customers.view_fiscal_data")
    ? { cpf: null as string | null, cpfLookupHash: null as string | null }
    : await prepareEncryptedCpf(supabase, partnerId, data.cpf, data.customerId)
  if (cpfResult.error) {
    return { error: cpfResult.error }
  }

  // SECURITY: partner_id is intentionally excluded from the update payload.
  // A customer's tenant ownership must NEVER be changeable via update.
  // Operators can edit operational fields, but do not receive or overwrite
  // sensitive fiscal/family/internal fields they do not need for the flow.
  const customerUpdatePayload: Record<string, any> = {
    name: sanitizeInput(data.name, 150),
    email: data.email || null,
    phone: data.phone || null,
    phone_fixed: data.phoneFixed || null,
    website: data.website || null,
    person_type: data.personType,
    status: data.status || "ativo",
    image_url: imageUrl,
  }

  if (customerAccess.roleId !== "operator") {
    Object.assign(customerUpdatePayload, {
      cpf: cpfResult.cpf,
      cpf_lookup_hash: cpfResult.cpfLookupHash,
      contribuinte: data.contribuinte || null,
      cnpj: data.cnpj ? data.cnpj.replace(/\D/g, "") : null,
      nome_fantasia: data.nomeFantasia ? sanitizeInput(data.nomeFantasia, 150) : null,
      razao_social: data.razaoSocial ? sanitizeInput(data.razaoSocial, 150) : null,
      inscricao_estadual: data.ieIsento ? "" : (data.inscricaoEstadual || null),
      ie_isento: data.ieIsento ?? false,
      inscricao_municipal: data.inscricaoMunicipal || null,
      crt: data.crt || null,
      notes: sanitizeNotes(data.notes),
      birth_date: data.birthDate || null,
      mother_name: data.motherName ? sanitizeInput(data.motherName, 150) : null,
      father_name: data.fatherName ? sanitizeInput(data.fatherName, 150) : null,
    })
  }

  const { error } = await supabase
    .from("customers")
    .update(customerUpdatePayload)
    .eq("id", data.customerId)
    .eq("partner_id", partnerId) // Defense in depth

  if (error) {
    return { error: error.message }
  }

  // Fetch both address records together, then run independent writes in
  // parallel. This removes the sequential address roundtrips from the save
  // path without changing ownership checks or the existing error behavior.
  const needsPrimaryAddress = Boolean(data.street || data.city)
  const needsBillingAddress = Boolean(data.hasDifferentBillingAddress && (data.billingStreet || data.billingCity))
  const [primaryResult, billingResult] = await Promise.all([
    needsPrimaryAddress
      ? supabase
        .from("addresses")
        .select("id")
        .eq("customer_id", data.customerId)
        .eq("address_type", "primary")
        .limit(1)
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
    needsBillingAddress
      ? supabase
        .from("addresses")
        .select("id")
        .eq("customer_id", data.customerId)
        .eq("address_type", "billing")
        .limit(1)
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
  ])

  const addressJobs: Promise<any>[] = []

  if (needsPrimaryAddress) {
    const existingPrimary = primaryResult.data?.[0]
    if (existingPrimary) {
      addressJobs.push((async () => {
        const enrichedCustAddr = await enrichAddressData({
          zip_code: data.zipCode,
          street: data.street,
          number: data.number,
          complement: data.complement || null,
          neighborhood: data.neighborhood,
          city: data.city,
          state: data.state,
          country: data.country || "BR",
          municipio_codigo_ibge: data.municipioCodigoIbge || null,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
        })
        return supabase.from("addresses").update(enrichedCustAddr).eq("id", existingPrimary.id)
      })())
    } else {
      addressJobs.push(createAddressAction({
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
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        csrf_token: data.csrf_token,
      }))
    }
  }

  if (needsBillingAddress) {
    const existingBilling = billingResult.data?.[0]
    if (existingBilling) {
      addressJobs.push(
        supabase.from("addresses").update({
          zip_code: data.billingZipCode,
          street: data.billingStreet,
          number: data.billingNumber,
          complement: data.billingComplement || null,
          neighborhood: data.billingNeighborhood,
          city: data.billingCity,
          state: data.billingState,
          country: data.country || "BR",
        }).eq("id", existingBilling.id),
      )
    } else {
      addressJobs.push(createAddressAction({
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
      }))
    }
  } else if (!data.hasDifferentBillingAddress) {
    addressJobs.push(
      supabase
        .from("addresses")
        .delete()
        .eq("customer_id", data.customerId)
        .eq("address_type", "billing"),
    )
  }

  const addressResults = await Promise.all(addressJobs)
  for (const addressResult of addressResults) {
    if (addressResult?.error) {
      console.error("[updateComprehensiveCustomerAction] Erro ao sincronizar endereço:", addressResult.error.message || addressResult.error)
    }
  }

  await revalidateCustomers(partnerId)
  revalidatePath("/erp/clientes")
  const resolvedImage = await resolveRecordImage({ image_url: imageUrl })
  return {
    success: true,
    data: {
      id: data.customerId,
      partner_id: partnerId,
      name: sanitizeInput(data.name, 150),
      email: data.email || null,
      phone: data.phone || null,
      phone_fixed: data.phoneFixed || null,
      status: data.status || "ativo",
      is_active: (data.status || "ativo") === "ativo",
      person_type: data.personType,
      image_url: resolvedImage.image_url || null,
      image_key: resolvedImage.image_key,
      city: data.city || null,
      state: data.state || null,
    },
  }
}

export async function getCustomerByIdAction(customerId: string) {
  const customerAccess = await requireAuthorizedCustomerContext(undefined, "view")
  const authorizedPartner = { partnerId: customerAccess.partnerId }
  const detailAdmin = createAdminClient()
  const { data: customerData, error: customerError } = await getCachedErpPage(
    ["erp-customer-detail", authorizedPartner.partnerId, customerId],
    [TAGS.customers(authorizedPartner.partnerId), TAGS.orders(authorizedPartner.partnerId)],
    async () => {
      return detailAdmin
        .from("customers")
        .select(`
          id, partner_id, name, email, phone, phone_fixed, status, person_type,
          cpf, cnpj, nome_fantasia, inscricao_estadual, contribuinte,
          store_credit, notes, birth_date, mother_name, father_name, website,
          created_at, user_id, marketplace_user_id, image_url,
          addresses!customer_id(address_type, zip_code, street, number, complement, neighborhood, city, state, country, is_default)
        `)
        .eq("id", customerId)
        .eq("partner_id", authorizedPartner.partnerId)
        .maybeSingle()
    },
  )

  if (customerError) {
    console.error("[getCustomerByIdAction] Customer lookup error:", customerError)
  }

  if (!customerData) {
    return { error: "Cliente nÃ£o encontrado" }
  }

  const customer = await resolveRecordImage(customerData)

  // Decrypt CPF if present
  if (customer.cpf) {
    const rawCpf = String(customer.cpf)
    if (rawCpf.startsWith("v1:") || rawCpf.startsWith("v2:")) {
      try {
        customer.cpf = await decryptCPF(rawCpf)
      } catch (e) {
        console.error("[getCustomerByIdAction] Failed to decrypt CPF:", e)
        customer.cpf = null
      }
    }
  }

  // Marketplace-created customers often store the CPF only on the linked
  // marketplace profile (user_profiles). Backfill it into the customer record
  // so the ERP detail page shows it without requiring a new checkout.
  if (!customer.cpf) {
    const linkedUserId = customer.user_id || customer.marketplace_user_id
    if (linkedUserId) {
      try {
        const { data: profile } = await detailAdmin
          .from("user_profiles")
          .select("cpf")
          .eq("user_id", linkedUserId)
          .maybeSingle()

        if (profile?.cpf) {
          const rawProfileCpf = String(profile.cpf)
          const decryptedCpf = rawProfileCpf.startsWith("v1:") || rawProfileCpf.startsWith("v2:")
            ? await decryptCPF(rawProfileCpf)
            : rawProfileCpf

          if (decryptedCpf) {
            customer.cpf = decryptedCpf

            const cleanCpf = decryptedCpf.replace(/\D/g, "")
            if (validateCPF(cleanCpf)) {
              const encryptedCpf = rawProfileCpf.startsWith("v1:") || rawProfileCpf.startsWith("v2:")
                ? rawProfileCpf
                : await encryptCPF(cleanCpf)
              const cpfLookupHash = generateCpfLookupHash(cleanCpf)

              const { error: backfillError } = await detailAdmin
                .from("customers")
                .update({
                  cpf: encryptedCpf,
                  cpf_lookup_hash: cpfLookupHash,
                  person_type: customer.person_type || "pf",
                })
                .eq("id", customer.id)

              if (backfillError) {
                console.error("[getCustomerByIdAction] Failed to backfill CPF:", backfillError)
              }
            }
          }
        }
      } catch (e) {
        console.error("[getCustomerByIdAction] Failed to resolve CPF from marketplace profile:", e)
      }
    }
  }

  // Extract primary address from joined addresses for backwards compatibility
  const primaryAddress = customer.addresses?.find((a: any) => a.address_type === "primary" || a.is_default)
  if (primaryAddress) {
    ; (customer as any).zip_code = primaryAddress.zip_code
      ; (customer as any).street = primaryAddress.street
      ; (customer as any).number = primaryAddress.number
      ; (customer as any).complement = primaryAddress.complement
      ; (customer as any).neighborhood = primaryAddress.neighborhood
      ; (customer as any).city = primaryAddress.city
      ; (customer as any).state = primaryAddress.state
      ; (customer as any).country = primaryAddress.country
  }

  const { getPartnerPlan } = await import("@/lib/services/subscription.service")
  const plan = await getPartnerPlan(customer.partner_id)
    ; (customer as any).planSlug = plan?.slug || "free"

    // Dynamically add mobile property for compatibility with frontend components
    ; (customer as any).mobile = customer.phone

  // Aggregate order stats for KPI display (by buyer_id AND customer_id)
  const marketplaceUserId = customer.marketplace_user_id
  const userId = customer.user_id

  const allCustomerIds = Array.from(
    new Set([customer.id, userId, marketplaceUserId].filter(Boolean))
  ) as string[]
  const orParts: string[] = []
  for (const id of allCustomerIds) {
    orParts.push(`customer_id.eq.${id}`)
    orParts.push(`buyer_id.eq.${id}`)
  }
  const adminDbForStats = createAdminClient()
  const canViewOrders = can(customerAccess as RbacUserLike, "orders.view")
  let orderAgg: Array<{ total_amount: number | null; created_at: string | null }> | null = null
  if (canViewOrders) {
    const context = await getCurrentPartnerContext(customerAccess.user)
    const storeId = context?.activeStoreId || null
    if (storeId) await requireStorePermission(storeId, authorizedPartner.partnerId, "orders", "view")
    const orderStatsFilter = storeId
      ? orParts.flatMap((part) => [
          `and(${part},store_id.eq.${storeId})`,
          `and(${part},store_id.is.null)`,
        ]).join(",")
      : orParts.join(",")
    let orderStatsQuery = adminDbForStats
      .from("orders")
      .select("total_amount, created_at")
      .eq("partner_id", authorizedPartner.partnerId)
      .or(orderStatsFilter)
      .neq("situation", "cancelled")
    const result = await orderStatsQuery
    orderAgg = result.data
  }

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
    ; (customer as any).orders_count = totalOrders
      ; (customer as any).total_spent = totalSpent
      ; (customer as any).avg_order_value = avgOrder
      ; (customer as any).last_order_at = lastOrderDate
  } else {
    ; (customer as any).orders_count = 0
      ; (customer as any).total_spent = 0
      ; (customer as any).avg_order_value = 0
      ; (customer as any).last_order_at = null
  }

  if (!can(customerAccess as RbacUserLike, "customers.view_fiscal_data")) {
    for (const field of [
      "cpf",
      "cnpj",
      "contribuinte",
      "inscricao_estadual",
      "ie_isento",
      "inscricao_municipal",
      "crt",
      "notes",
      "mother_name",
      "father_name",
      "marketplace_user_id",
      "user_id",
    ]) {
      delete (customer as any)[field]
    }
  }

  if (!can(customerAccess as RbacUserLike, "customers.view_personal_data")) {
    delete (customer as any).birth_date
    delete (customer as any).user_id
    delete (customer as any).marketplace_user_id
  }

  return { customer }
}

export async function getCustomerOrdersAction(customerId: string) {
  const customerAccess = await requireAuthorizedCustomerContext(undefined, "view")
  const authorizedPartner = { partnerId: customerAccess.partnerId }
  const supabase = customerAccess.admin

  // RLS-bound lookup plus an explicit tenant predicate prevents an id from
  // another partner from becoming an input to the admin path.
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, partner_id, user_id, marketplace_user_id, email, phone")
    .eq("id", customerId)
    .eq("partner_id", authorizedPartner.partnerId)
    .maybeSingle()

  if (customerError) {
    console.error("[getCustomerOrdersAction] Customer lookup error:", customerError)
  }

  if (!customer) {
    return { orders: [], stats: null }
  }

  const partnerId = authorizedPartner.partnerId
  await requirePermission(partnerId, "orders", "view", customerAccess.user)
  const partnerContext = await getCurrentPartnerContext(customerAccess.user)
  const activeStoreId = partnerContext?.activeStoreId || null
  if (activeStoreId) await requireStorePermission(activeStoreId, partnerId, "orders", "view")
  // The service-role client is created only after authentication, partner
  // permission and the RLS-bound customer lookup have all succeeded.
  const adminDb = customerAccess.admin

  // Customer history is partner-scoped today; customers are not store-owned
  // in this flow and the existing UI expects the partner-wide history. If a
  // store-scoped variant is introduced, its storeId must come from the
  // server-side context and be added as another predicate here.

  const userId = customer.user_id
  const marketplaceUserId = customer.marketplace_user_id

  const allCustomerIds = Array.from(
    new Set([customer.id, userId, marketplaceUserId].filter(Boolean))
  ) as string[]

  const orParts: string[] = []
  for (const id of allCustomerIds) {
    orParts.push(`customer_id.eq.${id}`)
    orParts.push(`buyer_id.eq.${id}`)
  }
  const filter = orParts.join(",")
  const scopedOrderFilter = activeStoreId
    ? orParts.flatMap((part) => [
        `and(${part},store_id.eq.${activeStoreId})`,
        `and(${part},store_id.is.null)`,
      ]).join(",")
    : filter

  let ordersQuery = adminDb
    .from("orders")
    .select(`
      id,
      order_number,
      mp_payment_id,
      created_at,
      situation,
      delivery_status,
      delivery_type,
      total_amount,
      paid_amount,
      customer_name,
      order_source,
      notes,
      delivery_breakdown,
      order_shipments ( id, kind, carrier ),
      order_items ( id, quantity, service_id, line_type )
    `)
    .eq("partner_id", partnerId)
    .or(scopedOrderFilter)
  const { data: orders, error } = await ordersQuery
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    return { orders: [], error: error.message, stats: null }
  }

  // Aggregate stats across ALL orders (no limit) for accurate KPIs
  let statsQuery = adminDb
    .from("orders")
    .select("total_amount, created_at, situation")
    .eq("partner_id", partnerId)
    .or(scopedOrderFilter)
    .neq("situation", "cancelled")
  const { data: statsRaw } = await statsQuery

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
      carrierBrandIcon: (() => {
        const carrierShipments = Array.isArray(o.order_shipments)
          ? o.order_shipments.filter((s: any) => s.kind !== "return")
          : []
        const isCarrier = o.delivery_breakdown?.source === "superfrete" || carrierShipments.length > 0
        return isCarrier
          ? getCarrierBrandIcon(o.delivery_breakdown?.companyName, o.delivery_breakdown?.serviceName, carrierShipments[0]?.carrier, o.delivery_breakdown?.carrier)
          : null
      })(),
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
    const customerAccess = await requireAuthorizedCustomerContext(partnerId, "view")
    partnerId = customerAccess.partnerId
    const supabase = customerAccess.admin

    let q = supabase
      .from("customers")
      .select("id, name, email, phone, status, store_credit, created_at, partner_id, person_type, birth_date, image_url")
      .eq("partner_id", partnerId)

    q = scopeActiveOnly(q)

    const { data: customers, error } = await q
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) {
      console.error("[getPartnerCustomersAction] Error:", error)
      return { error: error.message }
    }

    let result = customers || []
    if (!can(customerAccess as RbacUserLike, "customers.view_personal_data")) {
      result = result.map((customer: any) => {
        const { birth_date: _birthDate, ...safeCustomer } = customer
        return safeCustomer
      })
    }

    const customersWithSignedImages = await Promise.all(result.map((customer: any) => resolveRecordImage(customer)))
    return { customers: customersWithSignedImages }
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

  const payload = buildSoftDeletePayload(user.id)
  const { error } = await supabase
    .from("customers")
    .update(payload)
    .in("id", customerIds)
    .eq("partner_id", partnerId)

  if (error) {
    return { error: error.message }
  }

  await revalidateCustomers(partnerId)
  revalidatePath("/erp/clientes")
  return { success: true }
}

export async function archiveCustomerAction(customerId: string) {
  const customerAccess = await requireAuthorizedCustomerRecord(customerId, "edit")
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" }

  const supabase = customerAccess.admin
  const { data: customer } = await supabase.from("customers").select("partner_id, name").eq("id", customerId).single()
  if (!customer) return { error: "Cliente não encontrado" }

  await requirePermission(customer.partner_id, "customers", "edit", user)

  const payload = buildArchivePayload("arquivado")
  const { error } = await supabase.from("customers").update(payload).eq("id", customerId)
  if (error) return { error: error.message }

  await revalidateCustomers(customer.partner_id)
  revalidatePath("/erp/clientes")
  return { success: true }
}

export async function unarchiveCustomerAction(customerId: string) {
  const customerAccess = await requireAuthorizedCustomerRecord(customerId, "edit")
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" }

  const supabase = customerAccess.admin
  const { data: customer } = await supabase.from("customers").select("partner_id, name").eq("id", customerId).single()
  if (!customer) return { error: "Cliente não encontrado" }

  await requirePermission(customer.partner_id, "customers", "edit", user)

  const limitCheck = await checkLimit(customer.partner_id, "customers")
  if (!limitCheck.allowed) {
    return { error: limitCheck.message || "Limite de clientes do seu plano atingido. Faça upgrade para reativar este cliente." }
  }

  const payload = buildRestorePayload("ativo")
  const { error } = await supabase.from("customers").update(payload).eq("id", customerId)
  if (error) return { error: error.message }

  await revalidateCustomers(customer.partner_id)
  revalidatePath("/erp/clientes")
  return { success: true }
}

export async function toggleCustomersStatusAction(customerIds: string[], isActive: boolean) {
  const customerAccess = await requireAuthorizedCustomerContext(undefined, "edit")
  const user = await requireUser()
  if (!user) return { error: "NÃ£o autenticado" }

  const supabase = customerAccess.admin

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

  await revalidateCustomers(partnerId)
  revalidatePath("/erp/clientes")
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
  options?: { cursor?: ERPCustomerListCursor | null; storeId?: string | null; limit?: number; filters?: any },
): Promise<
  | { success: true; items: any[]; nextCursor: ERPCustomerListCursor | null; hasMore: boolean }
  | { success: false; error: string }
> {
  try {
    const customerAccess = await requireAuthorizedCustomerContext(partnerId, "view")
    if (!can(customerAccess as RbacUserLike, "customers.list")) {
      return { success: false, error: "Sem permissão para acessar a listagem de clientes." }
    }
    partnerId = customerAccess.partnerId
    const canViewPersonalData = can(customerAccess as RbacUserLike, "customers.view_personal_data")
    const canViewOrders = can(customerAccess as RbacUserLike, "orders.view")
    const partnerContext = await getCurrentPartnerContext(customerAccess.user)
    const effectiveStoreId = options?.storeId || partnerContext?.activeStoreId || null
    if (effectiveStoreId) {
      await requireStorePermission(effectiveStoreId, partnerId, "customers", "view")
      if (canViewOrders) await requireStorePermission(effectiveStoreId, partnerId, "orders", "view")
    }

    const cursor = options?.cursor ?? null
    const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || ERP_CUSTOMERS_PAGE_SIZE))))
    const fetchLimit = limit + 1

    const filterKey = options?.filters?.status || options?.filters?.tab || (options?.filters?.includeArchived ? "all" : "active")
    const page = await getCachedErpPage(
      [
        "erp-customers-page",
        partnerId,
        effectiveStoreId || "all-stores",
        cursor ? `${cursor.createdAt}:${cursor.id}` : "first",
        String(limit),
        String(filterKey),
      ],
      [TAGS.customers(partnerId)],
      async () => {
        const supabase = createAdminClient()
        let q = supabase
          .from("customers")
          .select("id, partner_id, name, email, phone, phone_fixed, status, is_active, store_credit, created_at, person_type, birth_date, user_id, image_url")
          .eq("partner_id", partnerId)

        if (options?.filters?.status === "archived" || options?.filters?.tab === "archived" || options?.filters?.status === "arquivado") {
          q = scopeArchivedOnly(q)
        } else if (!options?.filters?.includeArchived) {
          q = scopeActiveOnly(q)
        } else {
          q = scopeWithArchived(q)
        }

        if (cursor) q = q.or(buildCustomersKeysetOrFilter(cursor))

        const { data, error } = await q
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(fetchLimit)

        if (error) throw error

        const rows = data || []
        const hasMore = rows.length > limit
        const items: any[] = hasMore ? rows.slice(0, limit) : rows

        const customerIds = items.map((c: any) => c.id).filter(Boolean)

        if (customerIds.length > 0) {
          // Fetch address info (city, state) for all customers on this page
          const customerIdFilter = customerIds.join(",")
          const orderFilter = effectiveStoreId
            ? [
                `and(buyer_id.in.(${customerIdFilter}),store_id.eq.${effectiveStoreId})`,
                `and(customer_id.in.(${customerIdFilter}),store_id.eq.${effectiveStoreId})`,
                `and(buyer_id.in.(${customerIdFilter}),store_id.is.null)`,
                `and(customer_id.in.(${customerIdFilter}),store_id.is.null)`,
              ].join(",")
            : `buyer_id.in.(${customerIdFilter}),customer_id.in.(${customerIdFilter})`
          const [addressResult, orderResult] = await Promise.all([
            supabase
              .from("addresses")
              .select("customer_id, city, state")
              .in("customer_id", customerIds),
            canViewOrders
              ? supabase
                  .from("orders")
                  .select("buyer_id, customer_id, total_amount, created_at")
                  .eq("partner_id", partnerId)
                  .or(orderFilter)
                  .neq("situation", "cancelled")
              : Promise.resolve({ data: [], error: null }),
          ])

          const addrRows = addressResult.data

          if (addrRows) {
            const addrMap = new Map<string, { city: string | null; state: string | null }>()
            for (const a of addrRows) {
              if (!addrMap.has(a.customer_id)) {
                addrMap.set(a.customer_id, { city: a.city, state: a.state })
              }
            }
            for (const item of items) {
              const addr = addrMap.get(item.id)
              item.city = addr?.city || null
              item.state = addr?.state || null
            }
          }

          // Aggregate order stats only for the visible page, then cache the
          // result together with the list so revisiting the route is one hit.
          const orderAgg = orderResult.data

          if (orderAgg) {
            const statsMap = new Map<string, { orders_count: number; total_spent: number; last_order_at: string | null }>()
            for (const o of orderAgg) {
              const key = customerIds.includes(o.customer_id) ? o.customer_id : o.buyer_id
              if (!key) continue
              const prev = statsMap.get(key) || { orders_count: 0, total_spent: 0, last_order_at: null }
              prev.orders_count++
              prev.total_spent += Number(o.total_amount) || 0
              if (o.created_at && (!prev.last_order_at || o.created_at > prev.last_order_at)) prev.last_order_at = o.created_at
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

        return { items, hasMore }
      },
    )

    const hasMore = page.hasMore
    const items: any[] = page.items

    const visibleItems = await Promise.all(items.map(async (item) => {
      const safeItem = { ...item }
      if (!canViewPersonalData) {
        delete safeItem.birth_date
        delete safeItem.user_id
      }
      if (!canViewOrders) {
        delete safeItem.orders_count
        delete safeItem.total_spent
        delete safeItem.last_order_at
      }
      return resolveRecordImage(safeItem)
    }))

    const last = visibleItems[visibleItems.length - 1]
    const nextCursor: ERPCustomerListCursor | null =
      hasMore && last?.created_at && last?.id ? { createdAt: String(last.created_at), id: String(last.id) } : null

    return { success: true, items: visibleItems, nextCursor, hasMore }
  } catch (e: any) {
    return { success: false, error: e?.message || "Erro ao carregar clientes" }
  }
}

export async function getCustomerStoreCreditsAction(customerId: string) {
  const customerAccess = await requireAuthorizedCustomerContext(undefined, "view")
  const authorizedPartner = { partnerId: customerAccess.partnerId }
  await requirePermission(authorizedPartner.partnerId, "financial", "view", customerAccess.user)
  const partnerContext = await getCurrentPartnerContext(customerAccess.user)
  const activeStoreId = partnerContext?.activeStoreId || null
  if (activeStoreId) await requireStorePermission(activeStoreId, authorizedPartner.partnerId, "financial", "view")
  const supabase = customerAccess.admin

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, partner_id, user_id, marketplace_user_id")
    .eq("id", customerId)
    .eq("partner_id", authorizedPartner.partnerId)
    .maybeSingle()

  if (customerError) {
    console.error("[getCustomerStoreCreditsAction] Customer lookup error:", customerError)
  }

  if (!customer) {
    return { success: true, storeCredits: [] }
  }

  // Store credits may be attached to the ERP customer id or directly to the
  // marketplace user (customer_user_id), depending on how they were created.
  // Include every linked identity so vouchers from marketplace returns show up.
  const creditOwnerIds = Array.from(
    new Set([customer.id, customer.user_id, customer.marketplace_user_id].filter(Boolean))
  ) as string[]

  const creditOrParts: string[] = []
  for (const id of creditOwnerIds) {
    creditOrParts.push(`customer_id.eq.${id}`)
    creditOrParts.push(`customer_user_id.eq.${id}`)
  }
  const creditFilter = activeStoreId
    ? creditOrParts.flatMap((part) => [
        `and(${part},store_id.eq.${activeStoreId})`,
        `and(${part},store_id.is.null)`,
      ]).join(",")
    : creditOrParts.join(",")

  let creditQuery = supabase
    .from("store_credits")
    .select("id, amount, remaining_amount, status, expires_at, created_at")
    .eq("partner_id", authorizedPartner.partnerId)

  if (creditOrParts.length > 0) {
    creditQuery = creditQuery.or(creditFilter)
  }

  const { data, error } = await creditQuery.order("created_at", { ascending: false })

  if (error) {
    console.error("Erro ao buscar store_credits:", error)
    return { success: false, error: error.message }
  }

  return { success: true, storeCredits: data || [] }
}

