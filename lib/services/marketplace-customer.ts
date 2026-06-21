import { getAdminClient } from "@/lib/supabase/admin"
import { validateCPF } from "@/lib/input-validator"

export interface ExistingCustomerMatch {
  customer: { id: string; name: string; email: string | null }
  matchBy: "email" | "cpf"
}

/**
 * Pure lookup — never creates or alters records.
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
      const { encryptCPF, decryptCPF } = await import("@/lib/crypto")

      const { data: existingCpfs } = await supabase
        .from("customers")
        .select("id, name, email, cpf")
        .eq("partner_id", partnerId)
        .not("cpf", "is", null)

      if (existingCpfs) {
        for (const row of existingCpfs) {
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

export async function ensureMarketplaceCustomer({
  partnerId,
  name,
  email,
  phone,
  cpf,
  userId,
}: CustomerParams): Promise<string | null> {
  const supabase = getAdminClient()

  const cleanCpf = cpf ? cpf.replace(/\D/g, "") : null
  const isValidCpf = cleanCpf && validateCPF(cleanCpf)
  const marketplaceUserId = userId || null

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
      if (isValidCpf && !existing.cpf) {
        try {
          const { encryptCPF } = await import("@/lib/crypto")
          updateData.cpf = await encryptCPF(cleanCpf)
          updateData.person_type = "pf"
        } catch (e) {
          console.error("Error encrypting CPF during customer update:", e)
        }
      }

      if (Object.keys(updateData).length > 0) {
        await supabase.from("customers").update(updateData).eq("id", customerId)
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

      if (!existingCustomer.cpf && isValidCpf) {
        try {
          const { encryptCPF } = await import("@/lib/crypto")
          const encryptedCpf = await encryptCPF(cleanCpf)
          updateData.cpf = encryptedCpf
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
        await supabase.from("customers").update(updateData).eq("id", customerId)
      }
    }
  }

  // 3. Try to find by CPF (only if not found by marketplace_user_id or email)
  if (!customerId && isValidCpf) {
    const { encryptCPF, decryptCPF } = await import("@/lib/crypto")

    const { data: existingCpfs, error: fetchError } = await supabase
      .from("customers")
      .select("id, cpf, email, phone")
      .eq("partner_id", partnerId)
      .not("cpf", "is", null)

    if (!fetchError && existingCpfs) {
      for (const row of existingCpfs) {
        try {
          const decrypted = await decryptCPF(row.cpf)
          if (decrypted === cleanCpf) {
            customerId = row.id

            let needsUpdate = false
            const updateData: Record<string, any> = {}

            if (!row.email && email) {
              updateData.email = email
              needsUpdate = true
            }
            if (!row.phone && phone) {
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
            break
          }
        } catch (e) {
          console.error("[ensureMarketplaceCustomer] Decryption error:", e)
        }
      }
    }
  }

  // 4. Create new customer
  if (!customerId) {
    let encryptedCpf: string | null = null
    if (isValidCpf) {
      try {
        const { encryptCPF } = await import("@/lib/crypto")
        encryptedCpf = await encryptCPF(cleanCpf)
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

  return customerId
}
