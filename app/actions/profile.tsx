"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser, getCurrentUser } from "@/lib/auth/authorization"
import { sanitizeInput, validateCPF, validateBrazilMobile } from "@/lib/input-validator"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import { normalizePhoneToE164 } from "@/lib/utils/phone-utils"
import { getUserSessionData } from "@/lib/data/user"

export async function getUserProfileAction() {
  try {
    const user = await getCurrentUser()
    if (!user) return null

    const sessionData = await getUserSessionData(user.id)

    return {
      full_name: sessionData.profile?.full_name || null,
      address: sessionData.profile && sessionData.profile.city ? `${sessionData.profile.city} - ${sessionData.profile.state}` : null,
      avatar_url: sessionData.profile?.avatar_url || null
    }
  } catch {
    return null
  }
}

/**
 * Consolidated action to fetch initial marketplace state in one roundtrip.
 * Prevents multiple waterfall requests from MarketplaceHeader.
 */
export async function getInitialSessionData() {
  try {
    const user = await getCurrentUser()
    if (!user) return null
    return await getUserSessionData(user.id)
  } catch {
    return null
  }
}

export async function updateProfileAction(data: {
  fullName?: string
  phone?: string
  cpf?: string
  zipCode?: string
  street?: string
  number?: string
  complement?: string
  neighborhood?: string
  city?: string
  state?: string
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

  // SECURITY: Use server-verified user identity instead of client-provided userId
  const user = await requireUser()
  const userId = user.id

  const supabase = await getSupabaseServerClient()
  const supabaseAdmin = getAdminClient()



  const sanitizedData = {
    fullName: data.fullName ? sanitizeInput(data.fullName, 100) : undefined,
    phone: data.phone !== undefined ? (data.phone ? sanitizeInput(data.phone, 20) : "") : undefined,
    cpf: data.cpf !== undefined ? (data.cpf ? sanitizeInput(data.cpf, 20) : "") : undefined,
    zipCode: data.zipCode ? sanitizeInput(data.zipCode, 20) : undefined,
    street: data.street ? sanitizeInput(data.street, 200) : undefined,
    number: data.number ? sanitizeInput(data.number, 20) : undefined,
    complement: data.complement ? sanitizeInput(data.complement, 200) : undefined,
    neighborhood: data.neighborhood ? sanitizeInput(data.neighborhood, 100) : undefined,
    city: data.city ? sanitizeInput(data.city, 100) : undefined,
    state: data.state ? sanitizeInput(data.state, 2) : undefined,
  }

  // Atualizar perfil do usuário
  const updateData: any = {
    updated_at: new Date().toISOString(),
  }

  if (sanitizedData.fullName !== undefined) {
    updateData.full_name = sanitizedData.fullName
  }

  // ── Phone: normalize to E.164 + uniqueness check ──────────────────────────
  if (sanitizedData.phone !== undefined) {
    if (sanitizedData.phone) {
      // Validate Brazilian mobile format
      if (!validateBrazilMobile(sanitizedData.phone)) {
        return { error: "Número de celular inválido. Use o formato (00) 90000-0000" }
      }

      // Normalize to E.164 format (+5511998765432)
      const normalizedPhone = normalizePhoneToE164(sanitizedData.phone)

      // Check uniqueness across all users (admin client bypasses RLS)
      const { data: existingPhone } = await supabaseAdmin
        .from("user_profiles")
        .select("user_id")
        .eq("phone", normalizedPhone)
        .neq("user_id", userId)
        .maybeSingle()

      if (existingPhone) {
        return { error: "Este telefone já está cadastrado" }
      }

      updateData.phone = normalizedPhone
    } else {
      // Allow clearing the phone
      updateData.phone = null
    }
  }

  // ── CPF: validate, encrypt + uniqueness check ─────────────────────────────
  if (sanitizedData.cpf !== undefined) {
    if (sanitizedData.cpf) {
      // Validate CPF digits
      if (!validateCPF(sanitizedData.cpf)) {
        return { error: "CPF inválido" }
      }

      const cleanCpf = sanitizedData.cpf.replace(/\D/g, "")

      // Encrypt CPF for storage
      const { encryptCPF } = await import("@/lib/crypto")
      const { createHash } = await import("crypto")

      // SECURITY FIX (MED-02): Compute deterministic SHA-256 hash for O(1) uniqueness check.
      // This eliminates the timing oracle from the old approach (decrypting ALL CPFs in memory)
      // which leaked database size information via response time.
      const cpfHash = createHash("sha256").update(cleanCpf).digest("hex")

      // Try hash-based uniqueness check first (requires cpf_hash column in DB)
      let uniquenessVerified = false
      try {
        const { data: existingHash, error: hashError } = await supabaseAdmin
          .from("user_profiles")
          .select("user_id")
          .eq("cpf_hash", cpfHash)
          .neq("user_id", userId)
          .maybeSingle()

        if (!hashError) {
          uniquenessVerified = true
          if (existingHash) {
            return { error: "Esse CPF não pôde ser usado. Verifique se está correto ou tente outro." }
          }
        } else {
          // Column doesn't exist yet - fall back to old method
          console.warn("[SECURITY] cpf_hash column not found. Run DB migration to add it. Falling back to decrypt-all method.")
        }
      } catch {
        // Column doesn't exist - fall back
      }

      // Fallback: decrypt-all method (only if hash check wasn't possible)
      if (!uniquenessVerified) {
        const { decryptCPF } = await import("@/lib/crypto")
        const { data: existingCpfs, error: fetchError } = await supabaseAdmin
          .from("user_profiles")
          .select("user_id, cpf")
          .not("cpf", "is", null)
          .neq("user_id", userId)

        if (fetchError) {
          console.error("Erro ao buscar CPFs para verificar unicidade:", fetchError)
        } else if (existingCpfs && existingCpfs.length > 0) {
          for (const row of existingCpfs) {
            try {
              const decrypted = await decryptCPF(row.cpf)
              if (decrypted === cleanCpf) {
                return { error: "Esse CPF não pôde ser usado. Verifique se está correto ou tente outro." }
              }
            } catch (err) {
              // Ignora se não conseguir descriptografar (ex: lixo no banco)
              continue
            }
          }
        }
      }

      try {
        updateData.cpf = await encryptCPF(cleanCpf)
        // Always store the hash for future O(1) lookups (safe even if column doesn't exist yet - Supabase ignores unknown fields)
        updateData.cpf_hash = cpfHash
      } catch (err) {
        console.error("Error encrypting CPF:", err)
        return { error: "Erro ao criptografar o CPF" }
      }
    } else {
      // Allow clearing CPF
      updateData.cpf = null
      updateData.cpf_hash = null
    }
  }

  const { error } = await supabase.from("user_profiles").update(updateData).eq("user_id", userId)

  if (error) {
    console.error("Erro ao atualizar user_profiles:", error)
    return { error: "Erro ao atualizar perfil" }
  }

  // Se houver dados de endereço, criar/atualizar através da tabela addresses
  if (sanitizedData.street || sanitizedData.city) {
    const { createAddressAction, updateAddressAction, getAddressesAction } = await import("./shared/addresses")

    // Check if user already has a default address → update it instead of duplicating
    const existingAddresses = await getAddressesAction(userId, "user")
    const defaultAddress = existingAddresses?.addresses?.find((a: any) => a.is_default) || existingAddresses?.addresses?.[0]

    if (defaultAddress) {
      const addressResult = await updateAddressAction({
        addressId: defaultAddress.id,
        entityId: userId,
        entityType: "user",
        zipCode: sanitizedData.zipCode || "",
        street: sanitizedData.street || "",
        number: sanitizedData.number || "",
        complement: sanitizedData.complement,
        neighborhood: sanitizedData.neighborhood || "",
        city: sanitizedData.city || "",
        state: sanitizedData.state || "",
        isDefault: true,
        csrf_token: data.csrf_token,
      })
      if (addressResult.error) return { error: "Erro ao atualizar endereço" }
    } else {
      const addressResult = await createAddressAction({
        entityId: userId,
        entityType: "user",
        zipCode: sanitizedData.zipCode || "",
        street: sanitizedData.street || "",
        number: sanitizedData.number || "",
        complement: sanitizedData.complement,
        neighborhood: sanitizedData.neighborhood || "",
        city: sanitizedData.city || "",
        state: sanitizedData.state || "",
        isDefault: true,
        addressType: "casa",
        csrf_token: data.csrf_token,
      })
      if (addressResult.error) return { error: "Erro ao atualizar endereço" }
    }
  }

  return { success: true }
}


