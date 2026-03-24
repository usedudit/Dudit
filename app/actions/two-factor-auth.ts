"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getCurrentUser } from "@/lib/auth/authorization"
import { cookies } from "next/headers"
const { authenticator } = require("otplib")
import { randomBytes, createHash } from "crypto"
import { encrypt, decrypt } from "@/lib/cryptoService"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getErrorMessage } from "@/lib/utils/error-handlers"

export async function generateTOTPSecret() {
  await requireRateLimit(RateLimitCategory.AUTH_2FA)

  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("Usuário não autenticado")

    const supabase = await getSupabaseServerClient()

    // Generate TOTP secret
    const secret = authenticator.generateSecret()

    // SECURITY: Encrypt the secret before storing in database
    const encryptedSecret = encrypt(secret, "cpf") // reuse cpf context for TOTP encryption

    // Save encrypted secret to database
    const { error } = await supabase.from("user_2fa_secrets").upsert({
      user_id: user.id,
      secret: encryptedSecret,
      is_active: false,
    })

    if (error) throw error

    // Generate QR code data
    const otpauthUrl = authenticator.keyuri(user.email || "user", "ERP", secret)

    return {
      secret,
      qrCodeUrl: otpauthUrl,
    }
  } catch (error: any) {
    throw new Error(getErrorMessage(error))
  }
}

export async function verifyTOTPAndEnable(code: string) {
  await requireRateLimit(RateLimitCategory.AUTH_2FA)

  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("Usuário não autenticado")

    const supabase = await getSupabaseServerClient()

    // Get the secret
    const { data: secretData, error: secretError } = await supabase
      .from("user_2fa_secrets")
      .select("secret")
      .eq("user_id", user.id)
      .single()

    if (secretError || !secretData) throw new Error("2FA não configurado")

    // SECURITY: Decrypt the stored secret
    const decryptedSecret = decrypt(secretData.secret, "cpf")

    // Verify the code
    const isValid = authenticator.check(code, decryptedSecret)
    if (!isValid) throw new Error("Código inválido")

    // SECURITY: Generate cryptographically secure backup codes
    const backupCodes = Array.from({ length: 10 }, () =>
      randomBytes(4).toString("hex").toUpperCase()
    )

    // SECURITY: Hash backup codes before storing (store hash, return plaintext to user)
    const hashedBackupCodes = backupCodes.map((code) =>
      createHash("sha256").update(code).digest("hex")
    )

    // Update 2FA settings and activate secret
    const { error: updateError } = await supabase
      .from("user_2fa_secrets")
      .update({ is_active: true, activated_at: new Date() })
      .eq("user_id", user.id)

    if (updateError) throw updateError

    // Insert hashed backup codes
    const { error: codesError } = await supabase.from("user_2fa_backup_codes").insert(
      hashedBackupCodes.map((hashedCode) => ({
        user_id: user.id,
        code: hashedCode,
      })),
    )

    if (codesError) throw codesError

    // Create or update 2FA settings
    const { error: settingsError } = await supabase.from("user_2fa_settings").upsert({
      user_id: user.id,
      is_enabled: true,
      method: "totp",
    })

    if (settingsError) throw settingsError

    return { success: true, backupCodes }
  } catch (error: any) {
    throw new Error(getErrorMessage(error))
  }
}

export async function verifyTOTPCode(code: string) {
  await requireRateLimit(RateLimitCategory.AUTH_2FA)

  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("Usuário não autenticado")

    const supabase = await getSupabaseServerClient()

    // Get the secret
    const { data: secretData, error: secretError } = await supabase
      .from("user_2fa_secrets")
      .select("secret")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single()

    if (secretError || !secretData) throw new Error("2FA não ativado")

    // SECURITY: Decrypt the stored secret
    const decryptedSecret = decrypt(secretData.secret, "cpf")

    // Verify the code (allow 1 time window before and after for clock skew)
    const isValid = authenticator.check(code, decryptedSecret)
    if (!isValid) throw new Error("Código inválido ou expirado")

    return { success: true }
  } catch (error: any) {
    throw new Error(getErrorMessage(error))
  }
}

export async function disable2FA() {
  await requireRateLimit(RateLimitCategory.AUTH_2FA)

  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("Usuário não autenticado")

    const supabase = await getSupabaseServerClient()

    // Delete 2FA data
    const { error: secretError } = await supabase.from("user_2fa_secrets").delete().eq("user_id", user.id)

    const { error: codesError } = await supabase.from("user_2fa_backup_codes").delete().eq("user_id", user.id)

    const { error: settingsError } = await supabase
      .from("user_2fa_settings")
      .update({ is_enabled: false })
      .eq("user_id", user.id)

    if (secretError || codesError || settingsError) throw new Error("Erro ao desabilitar 2FA")

    return { success: true }
  } catch (error: any) {
    throw new Error(getErrorMessage(error))
  }
}

export async function get2FAStatus() {
  try {
    const user = await getCurrentUser()
    if (!user) return { isEnabled: false }

    const supabase = await getSupabaseServerClient()

    const { data } = await supabase.from("user_2fa_settings").select("is_enabled").eq("user_id", user.id).single()

    return { isEnabled: data?.is_enabled || false }
  } catch (error) {
    return { isEnabled: false }
  }
}
