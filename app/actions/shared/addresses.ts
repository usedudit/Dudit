"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
// Removed createSupabaseAdmin
import { unstable_cache } from "next/cache"
import { revalidateAddresses } from "@/lib/utils/revalidation"
import { requireUser, requireCustomerOwnership, requireSupplierOwnership } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

import { getAdminClient } from "@/lib/supabase/admin"
import { geocodeAddress } from "@/lib/services/location.service"

// Tipos para endereços consolidados
type AddressType = "user" | "partner" | "supplier" | "customer" | "store"

// 1. Leitura Cacheada
export const getCachedAddresses = async (
  entityId: string,
  entityType: AddressType
) => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()

      const query = supabase
        .from("addresses")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })

      // Filter por tipo de entidade
      if (entityType === "user") {
        query.eq("user_id", entityId)
      } else if (entityType === "partner") {
        query.eq("partner_id", entityId)
      } else if (entityType === "supplier") {
        query.eq("supplier_id", entityId)
      } else if (entityType === "customer") {
        query.eq("customer_id", entityId)
      } else if (entityType === "store") {
        query.eq("store_id", entityId)
      }

      const { data: addresses, error } = await query

      if (error) {
        console.error("Erro ao buscar endereços:", error)
        return []
      }
      return addresses || []
    },
    [`addresses-${entityType}-${entityId}`],
    {
      tags: ["addresses", `addresses-${entityType}-${entityId}`],
      revalidate: 3600,
    }
  )
  return fn()
}

// 2. Actions Públicas

export async function getAddressesAction(
  entityId: string,
  entityType: AddressType
) {
  // SECURITY: Require authentication and verify ownership
  const user = await requireUser()
  await verifyEntityOwnership(user.id, entityId, entityType)

  const addresses = await getCachedAddresses(entityId, entityType)
  return { addresses }
}

/**
 * SECURITY: Verify the caller owns or has access to the target entity.
 * Prevents IDOR attacks where an attacker passes another tenant's entityId.
 */
async function verifyEntityOwnership(
  userId: string,
  entityId: string,
  entityType: AddressType
): Promise<void> {
  if (entityType === "user") {
    if (entityId !== userId) throw new Error("Acesso negado")
  } else if (entityType === "partner") {
    await requirePermission(entityId, "customers", "view")
  } else if (entityType === "customer") {
    await requireCustomerOwnership(entityId)
  } else if (entityType === "supplier") {
    await requireSupplierOwnership(entityId)
  } else if (entityType === "store") {
    // Stores belong to a partner - resolve partner_id and check access
    const supabase = await getSupabaseServerClient()
    const { data: store } = await supabase.from("stores").select("partner_id").eq("id", entityId).single()
    if (!store) throw new Error("Loja não encontrada")
    await requirePermission(store.partner_id, "customers", "view")
  }
}

export async function createAddressAction(data: {
  entityId: string
  entityType: AddressType
  zipCode: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
  country?: string
  municipioCodigoIbge?: string
  addressType?: string
  isDefault?: boolean
  csrf_token?: string
}) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  const { requireCSRF, extractCSRFTokenFromObject } = await import(
    "@/lib/security/csrf-action-wrapper"
  )
  const csrfToken = extractCSRFTokenFromObject(data as Record<string, unknown>)
  const csrfValidation = await requireCSRF(csrfToken)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  // SECURITY: Require authenticated user + verify ownership
  const user = await requireUser()
  await verifyEntityOwnership(user.id, data.entityId, data.entityType)

  const supabase = await getSupabaseServerClient()

  // Build insert object based on entity type
  const insertData: any = {
    zip_code: data.zipCode,
    street: data.street,
    number: data.number,
    complement: data.complement || null,
    neighborhood: data.neighborhood,
    city: data.city,
    state: data.state,
    country: data.country || "BR",
    address_type: data.addressType || "primary",
    is_default: data.isDefault || false,
  }

  // 1.5 Geocode the address before saving
  const fullAddressString = [
    data.street,
    data.number,
    data.neighborhood,
    data.city,
    data.state,
    data.country || "BR"
  ].filter(Boolean).join(", ")

  try {
    const coords = await geocodeAddress(fullAddressString)
    if (coords) {
      insertData.latitude = coords.lat
      insertData.longitude = coords.lng
    }
  } catch (e) {
    console.error("Geocoding failed for address:", fullAddressString, e)
  }

  // Add entity reference
  if (data.entityType === "user") {
    insertData.user_id = data.entityId
  } else if (data.entityType === "partner") {
    insertData.partner_id = data.entityId
  } else if (data.entityType === "supplier") {
    insertData.supplier_id = data.entityId
    insertData.municipio_codigo_ibge = data.municipioCodigoIbge || null
  } else if (data.entityType === "customer") {
    insertData.customer_id = data.entityId
    insertData.municipio_codigo_ibge = data.municipioCodigoIbge || null
  } else if (data.entityType === "store") {
    insertData.store_id = data.entityId
  }

  // Remove default anterior se necessário
  if (data.isDefault) {
    const whereClause: any = {}
    if (data.entityType === "user") {
      whereClause.user_id = data.entityId
    } else if (data.entityType === "partner") {
      whereClause.partner_id = data.entityId
    } else if (data.entityType === "supplier") {
      whereClause.supplier_id = data.entityId
    } else if (data.entityType === "customer") {
      whereClause.customer_id = data.entityId
    } else if (data.entityType === "store") {
      whereClause.store_id = data.entityId
    }

    await supabase.from("addresses").update({ is_default: false }).match(whereClause)
  }

  // Enforce max 5 addresses per user
  if (data.entityType === "user") {
    const { count } = await supabase
      .from("addresses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", data.entityId)

    if (count != null && count >= 5) {
      return { error: "Limite de 5 endereços atingido. Remova um endereço antes de adicionar outro." }
    }
  }

  // Insert novo endereço
  const { data: address, error } = await supabase
    .from("addresses")
    .insert(insertData)
    .select()
    .single()

  if (error) return { error: error.message }

  // Keep store coordinates synchronized for marketplace/map queries.
  if ((data.entityType === "partner" || data.entityType === "store") && insertData.latitude != null && insertData.longitude != null) {
    await supabase
      .from("stores")
      .update({ latitude: insertData.latitude, longitude: insertData.longitude })
      .eq(data.entityType === "store" ? "id" : "partner_id", data.entityId)
  }

  // Limpa Cache
  await revalidateAddresses(data.entityType, data.entityId)

  return { success: true, address }
}

export async function updateAddressAction(data: {
  addressId: string
  entityId: string
  entityType: AddressType
  zipCode?: string
  street?: string
  number?: string
  complement?: string
  neighborhood?: string
  city?: string
  state?: string
  country?: string
  addressType?: string
  isDefault?: boolean
  csrf_token?: string
}) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  const { requireCSRF, extractCSRFTokenFromObject } = await import(
    "@/lib/security/csrf-action-wrapper"
  )
  const csrfToken = extractCSRFTokenFromObject(data as Record<string, unknown>)
  const csrfValidation = await requireCSRF(csrfToken)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  const user = await requireUser()
  await verifyEntityOwnership(user.id, data.entityId, data.entityType)

  const supabase = await getSupabaseServerClient()

  const updateData: any = {
    updated_at: new Date().toISOString(),
  }

  if (data.zipCode !== undefined) updateData.zip_code = data.zipCode
  if (data.street !== undefined) updateData.street = data.street
  if (data.number !== undefined) updateData.number = data.number
  if (data.complement !== undefined) updateData.complement = data.complement || null
  if (data.neighborhood !== undefined) updateData.neighborhood = data.neighborhood
  if (data.city !== undefined) updateData.city = data.city
  if (data.state !== undefined) updateData.state = data.state
  if (data.country !== undefined) updateData.country = data.country
  if (data.addressType !== undefined) updateData.address_type = data.addressType

  // Geocode the updated address
  const street = data.street ?? ""
  const city = data.city ?? ""
  if (street || city) {
    const fullAddressString = [
      data.street, data.number, data.neighborhood,
      data.city, data.state, data.country || "BR"
    ].filter(Boolean).join(", ")

    try {
      const coords = await geocodeAddress(fullAddressString)
      if (coords) {
        updateData.latitude = coords.lat
        updateData.longitude = coords.lng
      }
    } catch (e) {
      console.error("Geocoding failed for address update:", fullAddressString, e)
    }
  }

  // Handle is_default change
  if (data.isDefault) {
    const whereClause: any = {}
    if (data.entityType === "user") whereClause.user_id = data.entityId
    else if (data.entityType === "partner") whereClause.partner_id = data.entityId
    else if (data.entityType === "supplier") whereClause.supplier_id = data.entityId
    else if (data.entityType === "customer") whereClause.customer_id = data.entityId
    else if (data.entityType === "store") whereClause.store_id = data.entityId

    await supabase.from("addresses").update({ is_default: false }).match(whereClause)
    updateData.is_default = true
  }

  const { data: address, error } = await supabase
    .from("addresses")
    .update(updateData)
    .eq("id", data.addressId)
    .select()
    .single()

  if (error) return { error: error.message }

  // Keep store coordinates synchronized
  if ((data.entityType === "partner" || data.entityType === "store") && updateData.latitude != null && updateData.longitude != null) {
    await supabase
      .from("stores")
      .update({ latitude: updateData.latitude, longitude: updateData.longitude })
      .eq(data.entityType === "store" ? "id" : "partner_id", data.entityId)
  }

  await revalidateAddresses(data.entityType, data.entityId)

  return { success: true, address }
}

export async function deleteAddressAction(
  addressId: string,
  entityType: AddressType,
  entityId: string,
  csrf_token?: string
) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  // SECURITY: Require authenticated user + verify ownership
  const user = await requireUser()
  await verifyEntityOwnership(user.id, entityId, entityType)

  const supabase = await getSupabaseServerClient()
  const whereClause: any = { id: addressId }
  if (entityType === "user") {
    whereClause.user_id = entityId
  } else if (entityType === "partner") {
    whereClause.partner_id = entityId
  } else if (entityType === "supplier") {
    whereClause.supplier_id = entityId
  } else if (entityType === "customer") {
    whereClause.customer_id = entityId
  } else if (entityType === "store") {
    whereClause.store_id = entityId
  }

  const { error } = await supabase.from("addresses").delete().match(whereClause)

  if (error) return { error: error.message }

  await revalidateAddresses(entityType, entityId)
  return { success: true }
}

export async function setDefaultAddressAction(
  addressId: string,
  entityType: AddressType,
  entityId: string,
  csrf_token?: string
) {
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  // SECURITY: Require authenticated user + verify ownership
  const user = await requireUser()
  await verifyEntityOwnership(user.id, entityId, entityType)

  const supabase = await getSupabaseServerClient()

  // Remove default anterior
  const whereClause: any = {}
  if (entityType === "user") {
    whereClause.user_id = entityId
  } else if (entityType === "partner") {
    whereClause.partner_id = entityId
  } else if (entityType === "supplier") {
    whereClause.supplier_id = entityId
  } else if (entityType === "customer") {
    whereClause.customer_id = entityId
  } else if (entityType === "store") {
    whereClause.store_id = entityId
  }

  await supabase.from("addresses").update({ is_default: false }).match(whereClause)

  // Set novo default
  const { error } = await supabase
    .from("addresses")
    .update({ is_default: true })
    .eq("id", addressId)

  if (error) return { error: error.message }

  await revalidateAddresses(entityType, entityId)
  return { success: true }
}

