import { getAdminClient } from "@/lib/supabase/admin"
import { revalidateAddresses, revalidateCustomers } from "@/lib/utils/revalidation"

export interface UserAddressData {
  zip_code?: string | null
  street?: string | null
  number?: string | null
  complement?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  municipio_codigo_ibge?: string | null
  latitude?: number | null
  longitude?: number | null
  // CamelCase & alternative aliases
  zipCode?: string | null
  bairro?: string | null
  uf?: string | null
  municipioCodigoIbge?: string | null
  ibge?: string | null
}

export interface SyncUserAddressToErpOptions {
  userId: string
  address: UserAddressData
  userEmail?: string | null
}

export interface SyncUserAddressToErpResult {
  success: boolean
  syncedCount: number
  partnerIds?: string[]
  error?: string
}

function normalizeAddress(address: UserAddressData) {
  return {
    zip_code: address.zip_code ?? address.zipCode ?? null,
    street: address.street ?? null,
    number: address.number ?? null,
    complement: address.complement ?? null,
    neighborhood: address.neighborhood ?? address.bairro ?? null,
    city: address.city ?? null,
    state: address.state ?? address.uf ?? null,
    country: address.country || "BR",
    municipio_codigo_ibge:
      address.municipio_codigo_ibge ??
      address.municipioCodigoIbge ??
      address.ibge ??
      null,
    latitude:
      typeof address.latitude === "number" && !isNaN(address.latitude)
        ? address.latitude
        : null,
    longitude:
      typeof address.longitude === "number" && !isNaN(address.longitude)
        ? address.longitude
        : null,
  }
}

/**
 * Sincroniza o endereço padrão/atual do cliente do marketplace para todas as
 * lojas (parceiros) no ERP onde ele já possui cadastro de cliente.
 */
export async function syncUserDefaultAddressToErpCustomers(
  options: SyncUserAddressToErpOptions
): Promise<SyncUserAddressToErpResult> {
  const { userId, address, userEmail } = options

  if (!userId) {
    return { success: false, syncedCount: 0, error: "userId is required" }
  }

  const normalized = normalizeAddress(address)
  const admin = getAdminClient()

  try {
    // 1. Busca todos os clientes vinculados a este usuário no marketplace
    let query = admin
      .from("customers")
      .select("id, partner_id, marketplace_user_id, user_id, email")
      .is("deleted_at", null)

    if (userEmail) {
      query = query.or(
        `marketplace_user_id.eq.${userId},user_id.eq.${userId},email.eq.${userEmail}`
      )
    } else {
      query = query.or(`marketplace_user_id.eq.${userId},user_id.eq.${userId}`)
    }

    const { data: customers, error: custErr } = await query

    if (custErr) {
      console.error(
        "[customer-address-sync] Erro ao buscar clientes vinculados:",
        custErr
      )
      return { success: false, syncedCount: 0, error: custErr.message }
    }

    if (!customers || customers.length === 0) {
      return { success: true, syncedCount: 0, partnerIds: [] }
    }

    // 2. Se houver clientes que bateram por email sem marketplace_user_id, vincula
    const unlinkedIds = customers
      .filter((c) => !c.marketplace_user_id)
      .map((c) => c.id)

    if (unlinkedIds.length > 0) {
      await admin
        .from("customers")
        .update({ marketplace_user_id: userId, user_id: userId })
        .in("id", unlinkedIds)
    }

    const customerIds = customers.map((c) => c.id)

    // 3. Busca endereços existentes de todos esses clientes
    const { data: existingAddresses, error: addrErr } = await admin
      .from("addresses")
      .select("id, customer_id, address_type, is_default, created_at")
      .in("customer_id", customerIds)

    if (addrErr) {
      console.error(
        "[customer-address-sync] Erro ao buscar endereços dos clientes:",
        addrErr
      )
      return { success: false, syncedCount: 0, error: addrErr.message }
    }

    // 4. Mapeia endereços por customer_id
    const addrMap = new Map<string, Array<any>>()
    for (const addr of existingAddresses || []) {
      const list = addrMap.get(addr.customer_id) || []
      list.push(addr)
      addrMap.set(addr.customer_id, list)
    }

    const addressIdsToUpdate: string[] = []
    const customersNeedingInsert: Array<{ id: string; partner_id: string }> = []

    for (const cust of customers) {
      const addrs = addrMap.get(cust.id) || []
      if (addrs.length === 0) {
        customersNeedingInsert.push(cust)
      } else {
        // Seleciona o endereço principal / padrão a ser atualizado
        let targetAddr = addrs.find((a) => a.is_default)
        if (!targetAddr) {
          targetAddr = addrs.find((a) => a.address_type === "primary")
        }
        if (!targetAddr) {
          targetAddr = addrs.find((a) => a.address_type !== "billing")
        }
        if (!targetAddr) {
          // Se o cliente só tiver endereço de cobrança ("billing"), não sobrescreve
          if (addrs.every((a) => a.address_type === "billing")) {
            customersNeedingInsert.push(cust)
            continue
          }
          targetAddr = addrs[0]
        }

        addressIdsToUpdate.push(targetAddr.id)
      }
    }

    const now = new Date().toISOString()
    const updatePayload = {
      zip_code: normalized.zip_code,
      street: normalized.street,
      number: normalized.number,
      complement: normalized.complement,
      neighborhood: normalized.neighborhood,
      city: normalized.city,
      state: normalized.state,
      country: normalized.country,
      municipio_codigo_ibge: normalized.municipio_codigo_ibge,
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      address_type: "primary",
      is_default: true,
      updated_at: now,
    }

    // 5. Atualiza endereços existentes em lote
    if (addressIdsToUpdate.length > 0) {
      const { error: updateErr } = await admin
        .from("addresses")
        .update(updatePayload)
        .in("id", addressIdsToUpdate)

      if (updateErr) {
        console.error(
          "[customer-address-sync] Erro ao atualizar endereços existentes:",
          updateErr
        )
      }
    }

    // 6. Insere novo endereço para clientes que ainda não tinham endereço
    if (customersNeedingInsert.length > 0) {
      const insertPayload = customersNeedingInsert.map((c) => ({
        customer_id: c.id,
        zip_code: normalized.zip_code,
        street: normalized.street,
        number: normalized.number,
        complement: normalized.complement,
        neighborhood: normalized.neighborhood,
        city: normalized.city,
        state: normalized.state,
        country: normalized.country,
        municipio_codigo_ibge: normalized.municipio_codigo_ibge,
        latitude: normalized.latitude,
        longitude: normalized.longitude,
        address_type: "primary",
        is_default: true,
        created_at: now,
        updated_at: now,
      }))

      const { error: insertErr } = await admin
        .from("addresses")
        .insert(insertPayload)

      if (insertErr) {
        console.error(
          "[customer-address-sync] Erro ao inserir endereços de clientes:",
          insertErr
        )
      }
    }

    // 7. Revalida caches dos clientes e das lojas (parceiros)
    await Promise.allSettled(
      customerIds.map((cId) => revalidateAddresses("customer", cId))
    )

    const uniquePartnerIds = Array.from(
      new Set(customers.map((c) => c.partner_id).filter(Boolean))
    )

    await Promise.allSettled(
      uniquePartnerIds.map((pId) => revalidateCustomers(pId))
    )

    return {
      success: true,
      syncedCount: customers.length,
      partnerIds: uniquePartnerIds,
    }
  } catch (err: any) {
    console.error(
      "[customer-address-sync] Exceção inesperada na sincronização:",
      err
    )
    return {
      success: false,
      syncedCount: 0,
      error: err?.message || String(err),
    }
  }
}

/**
 * Sincroniza a localização de motorista caso o usuário também seja entregador.
 */
export async function syncDeliveryDriverAddress(
  userId: string,
  address: UserAddressData
): Promise<void> {
  if (!userId) return

  const normalized = normalizeAddress(address)
  try {
    const admin = getAdminClient()
    await admin
      .from("delivery_drivers")
      .update({
        city: normalized.city,
        neighborhood: normalized.neighborhood,
        street: normalized.street,
        number: normalized.number,
        complement: normalized.complement,
        state: normalized.state,
        zip_code: normalized.zip_code,
        latitude: normalized.latitude,
        longitude: normalized.longitude,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
  } catch (err) {
    console.warn(
      "[customer-address-sync] Falha ao sincronizar localização do motorista:",
      err
    )
  }
}

/**
 * Ponto de entrada unificado para atualizar endereços padrão em todos os subsistemas
 * (ERP das lojas onde o cliente compra + motorista de entrega).
 */
export async function syncUserDefaultAddressEverywhere(
  options: SyncUserAddressToErpOptions
): Promise<SyncUserAddressToErpResult> {
  const [erpResult] = await Promise.all([
    syncUserDefaultAddressToErpCustomers(options),
    syncDeliveryDriverAddress(options.userId, options.address),
  ])
  return erpResult
}

