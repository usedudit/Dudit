import { getAdminClient } from "@/lib/supabase/admin"
import { validateCPF } from "@/lib/input-validator"

interface CustomerParams {
  partnerId: string
  name: string
  email?: string | null
  phone?: string | null
  cpf?: string | null
}

export async function ensureMarketplaceCustomer({
  partnerId,
  name,
  email,
  phone,
  cpf
}: CustomerParams): Promise<string | null> {
  const supabase = getAdminClient()

  // Clean CPF if provided
  const cleanCpf = cpf ? cpf.replace(/\D/g, "") : null
  const isValidCpf = cleanCpf && validateCPF(cleanCpf)

  let customerId: string | null = null

  // 1. Try to find by email
  if (email) {
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id, cpf, phone")
      .eq("partner_id", partnerId)
      .eq("email", email)
      .eq("status", "ativo")
      .maybeSingle()

    if (existingCustomer) {
      customerId = existingCustomer.id
      
      // Update phone or CPF if they were missing
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

      if (needsUpdate) {
        await supabase
          .from("customers")
          .update(updateData)
          .eq("id", customerId)
      }
    }
  }

  // 2. If not found by email, try to find by CPF
  if (!customerId && isValidCpf) {
    const { encryptCPF, decryptCPF } = await import("@/lib/crypto")
    
    // Fetch all customers of this partner who have non-null CPFs
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

            // Update email, phone if missing
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

            if (needsUpdate) {
              await supabase
                .from("customers")
                .update(updateData)
                .eq("id", customerId)
            }
            break
          }
        } catch {
          continue
        }
      }
    }
  }

  // 3. If still not found, create new customer
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
        person_type: encryptedCpf ? "pf" : "pf", // default to 'pf'
        status: "ativo",
        source: "marketplace",
      })
      .select("id")
      .single()

    if (!custError && newCustomer) {
      customerId = newCustomer.id
    }
  }

  return customerId;
}
