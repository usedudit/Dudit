import { getAdminClient } from "@/lib/supabase/admin"
import { validateCPF } from "@/lib/input-validator"
import { revalidateAddresses } from "@/lib/utils/revalidation"

export interface ExistingCustomerMatch {
  customer: { id: string; name: string; email: string | null }
  matchBy: "email" | "cpf"
}

/**
 * Pure lookup - never creates or alters records.
 * Searches for an existing customer by email first, then by CPF.
 */
export async function findExistingCustomer(params: {
  partnerId: string
  email?: string | null
  cpf?: string | null
}): Promise<ExistingCustomerMatch | null> {
  const supabase = getAdminClient()
  const { partnerId, email, cpf } = params

  if (email) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id, name, email")
      .eq("partner_id", partnerId)
      .eq("email", email)
      .maybeSingle()

    if (existing) {
      return { customer: existing, matchBy: "email" }
    }
  }

  if (cpf) {
    const cleanCpf = cpf.replace(/\D/g, "")
    if (cleanCpf && validateCPF(cleanCpf)) {
      const { decryptCPF } = await import("@/lib/crypto")
      const { generateCpfLookupHash } = await import("@/lib/services/cpf-hash")
      const lookupHash = generateCpfLookupHash(cleanCpf)

      if (lookupHash) {
        const { data: matched } = await supabase
          .from("customers")
          .select("id, name, email")
          .eq("partner_id", partnerId)
          .eq("cpf_lookup_hash", lookupHash)
          .is("deleted_at", null)
          .maybeSingle()

        if (matched) {
          return { customer: matched, matchBy: "cpf" }
        }
      }

      // Fallback seguro de transição apenas para clientes legados sem hash preenchido
      const { data: legacyCpfs } = await supabase
        .from("customers")
        .select("id, name, email, cpf")
        .eq("partner_id", partnerId)
        .is("cpf_lookup_hash", null)
        .not("cpf", "is", null)
        .is("deleted_at", null)
        .limit(50)

      if (legacyCpfs) {
        for (const row of legacyCpfs) {
          try {
            const decrypted = await decryptCPF(row.cpf)
            if (decrypted === cleanCpf) {
              return {
                customer: { id: row.id, name: row.name, email: row.email },
                matchBy: "cpf",
              }
            }
          } catch {
            continue
          }
        }
      }
    }
  }

  return null
}

interface CustomerParams {
  partnerId: string
  name: string
  email?: string | null
  phone?: string | null
  cpf?: string | null
  userId?: string | null
}

async function syncMarketplaceUserAddress(
  supabase: any,
  customerId: string,
  userId: string | null,
): Promise<void> {
  if (!userId) return

  const { data: existingAddress } = await supabase
    .from("addresses")
    .select("id")
    .eq("customer_id", customerId)
    .maybeSingle()

  if (existingAddress) return

  const { data: userAddress } = await supabase
    .from("addresses")
    .select(
      "zip_code, street, number, complement, neighborhood, city, state, country, municipio_codigo_ibge, latitude, longitude, address_type, is_default",
    )
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (userAddress) {
    const { error: insertErr } = await supabase.from("addresses").insert({
      customer_id: customerId,
      zip_code: userAddress.zip_code,
      street: userAddress.street,
      number: userAddress.number,
      complement: userAddress.complement || null,
      neighborhood: userAddress.neighborhood,
      city: userAddress.city,
      state: userAddress.state,
      country: userAddress.country || "BR",
      municipio_codigo_ibge: userAddress.municipio_codigo_ibge || null,
      latitude: userAddress.latitude ?? null,
      longitude: userAddress.longitude ?? null,
      address_type: userAddress.address_type || "primary",
      is_default: true,
    })

    if (insertErr) {
      console.error(
        "[ensureMarketplaceCustomer] Error syncing user address to customer:",
        insertErr,
      )
    } else {
      await revalidateAddresses("customer", customerId)
    }
  }
}

async function resolveMarketplaceProfileCpf(
  supabase: any,
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null

  const { data } = await supabase
    .from("user_profiles")
    .select("cpf")
    .eq("user_id", userId)
    .maybeSingle()

  if (!data?.cpf) return null

  try {
    const rawCpf = String(data.cpf)
    const decrypted = rawCpf.startsWith("v1:") || rawCpf.startsWith("v2:")
      ? await (await import("@/lib/crypto")).decryptCPF(rawCpf)
      : rawCpf
    const cleanCpf = decrypted.replace(/\D/g, "")
    return validateCPF(cleanCpf) ? cleanCpf : null
  } catch (error) {
    console.error("[ensureMarketplaceCustomer] Failed to resolve profile CPF:", error)
    return null
  }
}

export async function ensureMarketplaceCustomer({
   partnerId,
   name,
   email,
   phone,
   cpf,
   userId,
 }: CustomerParams): Promise<string | null> {
  const supabase = getAdminClient()

  const marketplaceUserId = userId || null
  let cleanCpf = cpf ? cpf.replace(/\D/g, "") : null
  let isValidCpf = Boolean(cleanCpf && validateCPF(cleanCpf))

  // Marketplace profiles already hold the CPF collected at signup/checkout.
  // Reuse it when the caller did not pass a CPF (e.g. cart/catalog flows).
  if (!isValidCpf && marketplaceUserId) {
    const profileCpf = await resolveMarketplaceProfileCpf(supabase, marketplaceUserId)
    if (profileCpf) {
      cleanCpf = profileCpf
      isValidCpf = true
    }
  }

  let customerId: string | null = null

  // 1. Try to find by marketplace_user_id (highest priority)
  if (marketplaceUserId) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id, name, email, phone, cpf")
      .eq("partner_id", partnerId)
      .eq("marketplace_user_id", marketplaceUserId)
      .maybeSingle()

    if (existing) {
      customerId = existing.id

      // Update non-sensitive fields if needed
      const updateData: Record<string, any> = {}
      if (name && existing.name !== name) updateData.name = name
      if (phone && !existing.phone) updateData.phone = phone
      if (email && !existing.email) updateData.email = email
      if (isValidCpf && cleanCpf && !existing.cpf) {
        try {
          const { encryptCPF } = await import("@/lib/crypto")
          const { generateCpfLookupHash } = await import("@/lib/services/cpf-hash")
          updateData.cpf = await encryptCPF(cleanCpf)
          updateData.cpf_lookup_hash = generateCpfLookupHash(cleanCpf)
          updateData.person_type = "pf"
        } catch (e) {
          console.error("Error encrypting CPF during customer update:", e)
        }
      }

      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase.from("customers").update(updateData).eq("id", customerId)
        if (updateError) {
          console.error("[ensureMarketplaceCustomer] Error updating customer by marketplace_user_id:", updateError)
        }
      }
    }
  }

  // 2. Try to find by email (only if not found by marketplace_user_id)
  if (!customerId && email) {
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id, cpf, phone")
      .eq("partner_id", partnerId)
      .eq("email", email)
      .maybeSingle()

    if (existingCustomer) {
      customerId = existingCustomer.id

      let needsUpdate = false
      const updateData: Record<string, any> = {}

      if (!existingCustomer.phone && phone) {
        updateData.phone = phone
        needsUpdate = true
      }

      if (!existingCustomer.cpf && isValidCpf && cleanCpf) {
        try {
          const { encryptCPF } = await import("@/lib/crypto")
          const { generateCpfLookupHash } = await import("@/lib/services/cpf-hash")
          const encryptedCpf = await encryptCPF(cleanCpf)
          updateData.cpf = encryptedCpf
          updateData.cpf_lookup_hash = generateCpfLookupHash(cleanCpf)
          updateData.person_type = "pf"
          needsUpdate = true
        } catch (e) {
          console.error("Error encrypting CPF during customer update:", e)
        }
      }

      if (marketplaceUserId) {
        updateData.marketplace_user_id = marketplaceUserId
        needsUpdate = true
      }

      if (needsUpdate) {
        const { error: updateError } = await supabase.from("customers").update(updateData).eq("id", customerId)
        if (updateError) {
          console.error("[ensureMarketplaceCustomer] Error updating customer by email:", updateError)
        }
      }
    }
  }

  // 3. Try to find by CPF (only if not found by marketplace_user_id or email)
  if (!customerId && isValidCpf) {
    const { decryptCPF } = await import("@/lib/crypto")
    const { generateCpfLookupHash } = await import("@/lib/services/cpf-hash")
    const lookupHash = generateCpfLookupHash(cleanCpf)

    let matchedCustomer: any = null

    if (lookupHash) {
      const { data: existingByHash } = await supabase
        .from("customers")
        .select("id, cpf, email, phone")
        .eq("partner_id", partnerId)
        .eq("cpf_lookup_hash", lookupHash)
        .is("deleted_at", null)
        .maybeSingle()

      if (existingByHash) {
        matchedCustomer = existingByHash
      }
    }

    // Fallback legado apenas se não encontrado por hash
    if (!matchedCustomer) {
      const { data: existingCpfs } = await supabase
        .from("customers")
        .select("id, cpf, email, phone")
        .eq("partner_id", partnerId)
        .is("cpf_lookup_hash", null)
        .not("cpf", "is", null)
        .is("deleted_at", null)
        .limit(50)

      if (existingCpfs) {
        for (const row of existingCpfs) {
          try {
            const decrypted = await decryptCPF(row.cpf)
            if (decrypted === cleanCpf) {
              matchedCustomer = row
              break
            }
          } catch {
            continue
          }
        }
      }
    }

    if (matchedCustomer) {
      customerId = matchedCustomer.id

      let needsUpdate = false
      const updateData: Record<string, any> = {}

      if (lookupHash && !matchedCustomer.cpf_lookup_hash) {
        updateData.cpf_lookup_hash = lookupHash
        needsUpdate = true
      }
      if (!matchedCustomer.email && email) {
        updateData.email = email
        needsUpdate = true
      }
      if (!matchedCustomer.phone && phone) {
        updateData.phone = phone
        needsUpdate = true
      }
      if (marketplaceUserId) {
        updateData.marketplace_user_id = marketplaceUserId
        needsUpdate = true
      }

      if (needsUpdate) {
        const { error: updateError } = await supabase
          .from("customers")
          .update(updateData)
          .eq("id", customerId)
        if (updateError) {
          console.error("[ensureMarketplaceCustomer] Error updating customer by CPF:", updateError)
        }
      }
    }
  }

  // 4. Create new customer
  if (!customerId) {
    let encryptedCpf: string | null = null
    let lookupHash: string | null = null
    if (isValidCpf && cleanCpf) {
      try {
        const { encryptCPF } = await import("@/lib/crypto")
        const { generateCpfLookupHash } = await import("@/lib/services/cpf-hash")
        encryptedCpf = await encryptCPF(cleanCpf)
        lookupHash = generateCpfLookupHash(cleanCpf)
      } catch (e) {
        console.error("Error encrypting CPF during customer creation:", e)
      }
    }

    const { data: newCustomer, error: custError } = await supabase
      .from("customers")
      .insert({
        partner_id: partnerId,
        name: name,
        email: email || null,
        phone: phone || null,
        cpf: encryptedCpf,
        cpf_lookup_hash: lookupHash,
        person_type: "pf",
        status: "ativo",
        user_id: marketplaceUserId,
        marketplace_user_id: marketplaceUserId,
      })
      .select("id")
      .single()

    if (custError) {
      console.error("[ensureMarketplaceCustomer] Error inserting new customer:", custError)
    }

    if (!custError && newCustomer) {
      customerId = newCustomer.id
    }
  }

  if (customerId && marketplaceUserId) {
    await syncMarketplaceUserAddress(supabase, customerId, marketplaceUserId)
  }

  return customerId
}

export {
  syncUserDefaultAddressToErpCustomers,
  syncDeliveryDriverAddress,
  syncUserDefaultAddressEverywhere,
  type SyncUserAddressToErpOptions,
  type SyncUserAddressToErpResult,
  type UserAddressData,
} from "./customer-address-sync"

