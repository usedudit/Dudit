"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser, getCurrentUser } from "@/lib/auth/authorization"
import { sanitizeInput, validateEmail, validateCPF, validatePhoneBR } from "@/lib/input-validator"
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
      address: sessionData.profile && sessionData.profile.city ? `${sessionData.profile.city} - ${sessionData.profile.state}` : null
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

  const { createAddressAction } = await import("./shared/addresses")

  const sanitizedData = {
    fullName: data.fullName ? sanitizeInput(data.fullName, 100) : undefined,
    phone: data.phone ? sanitizeInput(data.phone, 20) : undefined,
    cpf: data.cpf ? sanitizeInput(data.cpf, 20) : undefined,
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
      // Validate Brazilian phone format
      if (!validatePhoneBR(sanitizedData.phone)) {
        return { error: "Número de telefone inválido" }
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
      const { encryptCPF, decryptCPF } = await import("@/lib/crypto")

      // Check uniqueness: fetch all non-null CPFs and decrypt to compare
      // Nota de performance: Isso funciona bem para um MVP, mas se a base crescer muito,
      // o ideal é voltar a ter uma coluna cpf_hash com UNIQUE INDEX.
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

      try {
        updateData.cpf = await encryptCPF(cleanCpf)
      } catch (err) {
        console.error("Error encrypting CPF:", err)
        return { error: "Erro ao criptografar o CPF" }
      }
    } else {
      // Allow clearing CPF
      updateData.cpf = null
    }
  }

  const { error } = await supabase.from("user_profiles").update(updateData).eq("user_id", userId)

  if (error) {
    console.error("Erro ao atualizar user_profiles:", error)
    return { error: "Erro ao atualizar perfil" }
  }

  // Se houver dados de endereço, criar/atualizar através da tabela addresses
  if (sanitizedData.street || sanitizedData.city) {
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
      csrf_token: data.csrf_token,
    })

    if (addressResult.error) {
      return { error: "Erro ao atualizar endereço" }
    }
  }

  return { success: true }
}

export async function requestEmailChangeAction(newEmail: string) {
  await requireRateLimit(RateLimitCategory.AUTH_EMAIL_CHANGE)

  // SECURITY: Use server-verified user identity
  const user = await requireUser()
  const userId = user.id

  const supabase = await getSupabaseServerClient()

  if (!validateEmail(newEmail)) {
    return { error: "Email inválido" }
  }

  const sanitizedEmail = sanitizeInput(newEmail, 255)

  // SECURITY: Don't reveal whether an email is already in use (user enumeration)
  const { data: existingProfile } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("email", sanitizedEmail)
    .maybeSingle()

  // SECURITY: Use cryptographically secure random OTP
  const { randomInt } = await import("crypto")
  const otp = randomInt(100000, 999999).toString()

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { error: otpError } = await supabase.from("email_change_otps").upsert(
    {
      user_id: userId,
      new_email: sanitizedEmail,
      otp_code: otp,
      expires_at: expiresAt,
      attempts: 0,
    },
    {
      onConflict: "user_id",
    },
  )

  if (otpError) {
    return { error: "Erro ao gerar código de verificação" }
  }

  // If the email is already in use, silently succeed to prevent enumeration
  if (existingProfile) {
    return { success: true }
  }

  // TODO: Send email with OTP code using email service (Resend, SendGrid, etc)
  // In production, integrate with your email provider

  return { success: true }
}

export async function verifyEmailChangeAction(newEmail: string, otpCode: string) {
  await requireRateLimit(RateLimitCategory.AUTH_EMAIL_CHANGE)

  // SECURITY: Use server-verified user identity
  const user = await requireUser()
  const userId = user.id

  const supabase = await getSupabaseServerClient()

  const sanitizedEmail = sanitizeInput(newEmail, 255)
  const sanitizedOtp = sanitizeInput(otpCode, 10)

  const { data: otpData, error: otpFetchError } = await supabase
    .from("email_change_otps")
    .select("*")
    .eq("user_id", userId)
    .eq("new_email", sanitizedEmail)
    .single()

  if (otpFetchError || !otpData) {
    return { error: "Código de verificação não encontrado" }
  }

  if (new Date(otpData.expires_at) < new Date()) {
    await supabase.from("email_change_otps").delete().eq("user_id", userId)
    return { error: "Código expirado. Solicite um novo código" }
  }

  if (otpData.attempts >= 3) {
    await supabase.from("email_change_otps").delete().eq("user_id", userId)
    return { error: "Muitas tentativas. Solicite um novo código" }
  }

  // SECURITY: Constant-time comparison to prevent timing attacks
  const { timingSafeEqual } = await import("crypto")
  const otpMatch = otpData.otp_code.length === sanitizedOtp.length &&
    timingSafeEqual(Buffer.from(otpData.otp_code), Buffer.from(sanitizedOtp))
  if (!otpMatch) {
    await supabase
      .from("email_change_otps")
      .update({ attempts: otpData.attempts + 1 })
      .eq("user_id", userId)

    return { error: "Código inválido" }
  }

  const { error: updateError } = await supabase.auth.updateUser({
    email: sanitizedEmail,
  })

  if (updateError) {
    return { error: "Erro ao atualizar email" }
  }

  // Nota: Email não é armazenado em user_profiles por segurança
  // O email já está sincronizado em auth.users

  await supabase.from("email_change_otps").delete().eq("user_id", userId)

  return { success: true }
}
