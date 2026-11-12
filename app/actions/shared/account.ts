"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { cookies, headers } from "next/headers"
import { AccountDeletionService } from "@/lib/services/account-deletion.service"
import { getTrustedClientCountry, getTrustedClientIP } from "@/lib/security/client-ip"
import { getAdminClient } from "@/lib/supabase/admin"
import { SMTP2GOService } from "@/lib/services/smtp2go.service"
import { SMTP2GO_TEMPLATE_IDS } from "@/lib/services/smtp2go-templates"
import {
  getAccountDeletionEmailHtml,
  getAccountDeletionEmailText,
} from "@/lib/services/email-templates/account-deletion-code.template"
import { SecureLogger } from "@/lib/secure-logger"
import { auditLog } from "@/lib/security/audit-logger"
import crypto from "crypto"

function maskEmail(email: string): string {
  const parts = email.split("@")
  if (parts.length !== 2) return "seu e-mail"
  const [name, domain] = parts
  const maskedName = name.length > 2
    ? `${name[0]}***${name[name.length - 1]}`
    : `${name[0]}***`
  return `${maskedName}@${domain}`
}

/**
 * Step 1 of Account Deletion Flow:
 * Generates a 6-digit numeric verification code, saves its SHA-256 hash
 * into account_deletion_requests, and sends it via SMTP2GO.
 */
export async function requestAccountDeletionCodeAction(
  reason?: string | null,
  csrf_token?: string
): Promise<{
  success?: boolean
  error?: string
  maskedEmail?: string
  cooldownSeconds?: number
}> {
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")

  try {
    const [, csrfValidation, user, reqHeaders] = await Promise.all([
      requireRateLimit(RateLimitCategory.ACCOUNT_DELETE_REQUEST),
      requireCSRF(csrf_token),
      requireUser(),
      headers(),
    ])

    if (!csrfValidation.valid) {
      return { error: csrfValidation.error || "Token CSRF inválido" }
    }

    const rawEmail = user.email?.trim().toLowerCase()
    if (!rawEmail) {
      return { error: "Usuário não possui um e-mail válido vinculado à conta." }
    }

    const admin = getAdminClient()
    const nowMs = Date.now()
    const twentyFourHoursAgo = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()

    // 1. Parallel lookup: partner, active deletion, and recent requests (60s cooldown + 24h quota)
    const [
      { data: partner },
      { data: existingDeletion },
      { data: recentRequests },
    ] = await Promise.all([
      admin
        .from("partners")
        .select("id, user_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("account_deletions")
        .select("id, status")
        .eq("user_id", user.id)
        .not("status", "eq", "completed")
        .not("status", "eq", "failed")
        .maybeSingle(),
      admin
        .from("account_deletion_requests")
        .select("created_at")
        .eq("user_id", user.id)
        .gt("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: false })
        .limit(5),
    ])

    if (partner) {
      if (partner.user_id !== user.id) {
        return { error: "Somente o proprietário principal (OWNER) da conta pode solicitar a exclusão." }
      }

      const { countActiveRecurringSubscriptions } = await import("@/lib/services/recurring/limits")
      const [{ data: activeSub }, activeRecurringCount] = await Promise.all([
        admin
          .from("subscriptions")
          .select("id, status, cancel_at_period_end")
          .eq("partner_id", partner.id)
          .in("status", ["active", "trialing", "past_due"])
          .maybeSingle(),
        countActiveRecurringSubscriptions(partner.id),
      ])

      // A subscription already scheduled to cancel at period end is leaving;
      // it shouldn't block account deletion.
      if (activeSub && !activeSub.cancel_at_period_end) {
        return { error: "active_subscription" }
      }

      if (activeRecurringCount > 0) {
        return {
          error: `Você possui ${activeRecurringCount} assinatura(s) recorrente(s) ativa(s) no ERP. Cancele todas antes de solicitar a exclusão da conta.`,
        }
      }
    }

    if (existingDeletion) {
      return { error: "Uma exclusão de conta já está em andamento para este usuário." }
    }

    const latestRequest = recentRequests?.[0]
    if (latestRequest) {
      const elapsedMs = nowMs - new Date(latestRequest.created_at).getTime()
      if (elapsedMs < 60 * 1000) {
        const remainingSec = Math.max(1, Math.ceil((60 * 1000 - elapsedMs) / 1000))
        return {
          error: `Aguarde ${remainingSec} segundos antes de solicitar um novo código.`,
          cooldownSeconds: remainingSec,
        }
      }
    }

    if ((recentRequests?.length || 0) >= 5) {
      return { error: "Você atingiu o limite de solicitações de código por hoje. Tente novamente mais tarde." }
    }

    // 2. Generate 6-digit numeric OTP and SHA-256 hash
    const nowIso = new Date(nowMs).toISOString()
    const rawCode = crypto.randomInt(100000, 1000000).toString()
    const codeHash = crypto.createHash("sha256").update(rawCode).digest("hex")
    const expiresAt = new Date(nowMs + 15 * 60 * 1000) // 15 minutes

    const userAgent = reqHeaders.get("user-agent")
    const ip = getTrustedClientIP(reqHeaders)
    const country = getTrustedClientCountry(reqHeaders) || "unknown"
    const templateId = SMTP2GO_TEMPLATE_IDS.accountDeletionCode || undefined

    // 3. Invalidate prior unverified requests, insert new request, and dispatch email in parallel
    const [, { data: requestRow, error: insertError }, emailResult] = await Promise.all([
      admin
        .from("account_deletion_requests")
        .update({ expires_at: nowIso })
        .eq("user_id", user.id)
        .is("verified_at", null)
        .lt("created_at", nowIso),
      admin
        .from("account_deletion_requests")
        .insert({
          user_id: user.id,
          email: rawEmail,
          code_hash: codeHash,
          expires_at: expiresAt.toISOString(),
          attempts: 0,
          max_attempts: 5,
          request_ip: ip,
          user_agent: userAgent,
          metadata: {
            reason: reason || null,
            country,
          },
        })
        .select("id")
        .single(),
      SMTP2GOService.sendEmail({
        to: [{ email: rawEmail, name: user.user_metadata?.full_name || undefined }],
        subject: "Confirme a exclusão da sua conta Dudit",
        template_id: templateId,
        variables: {
          code: rawCode,
          codigo: rawCode,
          expirationMinutes: "15",
          expiration_minutes: "15",
          validade: "15",
          validade_minutos: "15",
          full_name: user.user_metadata?.full_name || "",
          nome: user.user_metadata?.full_name || "",
        },
        html: templateId ? undefined : getAccountDeletionEmailHtml(rawCode, 15),
        text: templateId ? undefined : getAccountDeletionEmailText(rawCode, 15),
        userId: user.id,
        partnerId: partner?.id || undefined,
      }),
    ])

    if (insertError || !requestRow) {
      SecureLogger.error("Failed to insert account_deletion_requests record", {
        userId: user.id,
        error: insertError?.message,
      })
      return { error: "Erro ao gerar código de confirmação." }
    }

    if (!emailResult.success) {
      SecureLogger.error("Failed to send account deletion verification email", {
        userId: user.id,
        error: emailResult.error,
      })
      return { error: "Não foi possível enviar o e-mail com o código. Verifique sua conexão e tente novamente." }
    }

    // 4. Fire-and-forget audit log so the UI receives the response immediately
    void auditLog({
      action: "account.deletion_code_requested",
      actorUserId: user.id,
      partnerId: partner?.id || null,
      metadata: {
        requestId: requestRow.id,
        maskedEmail: maskEmail(rawEmail),
      },
    }).catch(() => {})

    return {
      success: true,
      maskedEmail: maskEmail(rawEmail),
      cooldownSeconds: 60,
    }
  } catch (error: any) {
    SecureLogger.error("Unexpected error in requestAccountDeletionCodeAction", { error: error?.message })
    return { error: "Ocorreu um erro inesperado ao solicitar o código." }
  }
}

/**
 * Step 2 of Account Deletion Flow:
 * Verifies the 6-digit code against the active request hash with constant-time comparison,
 * tracks failed attempts (locks out after 5 failures), and on success initiates the
 * deletion pipeline via AccountDeletionService.
 */
export async function confirmAccountDeletionAction(input: {
  code: string
  reason?: string | null
  csrf_token?: string
}): Promise<{
  success?: boolean
  error?: string
  remainingAttempts?: number
  isLocked?: boolean
}> {
  await requireRateLimit(RateLimitCategory.ACCOUNT_DELETE_VERIFY)

  // Validate CSRF token
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(input.csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  try {
    const user = await requireUser()
    const cleanCode = (input.code || "").trim()

    if (!/^\d{6}$/.test(cleanCode)) {
      return { error: "O código de confirmação deve ter exatamente 6 dígitos numéricos." }
    }

    const admin = getAdminClient()

    // 1. Fetch latest unverified request for this user
    const { data: requestRow, error: reqError } = await admin
      .from("account_deletion_requests")
      .select("*")
      .eq("user_id", user.id)
      .is("verified_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (reqError || !requestRow) {
      return { error: "Nenhuma solicitação de código pendente encontrada. Solicite um novo código." }
    }

    // 2. Check if locked due to maximum failed attempts
    if (requestRow.attempts >= requestRow.max_attempts) {
      return {
        error: "Número máximo de tentativas incorretas excedido. Solicite um novo código.",
        isLocked: true,
        remainingAttempts: 0,
      }
    }

    // 3. Check expiration
    if (new Date(requestRow.expires_at).getTime() < Date.now()) {
      return { error: "O código de confirmação expirou. Solicite um novo código." }
    }

    // 4. Secure constant-time hash comparison
    const inputHash = crypto.createHash("sha256").update(cleanCode).digest("hex")
    const storedHash = requestRow.code_hash
    const isMatch =
      storedHash.length === inputHash.length &&
      crypto.timingSafeEqual(Buffer.from(storedHash, "utf8"), Buffer.from(inputHash, "utf8"))

    if (!isMatch) {
      const newAttempts = requestRow.attempts + 1
      await admin
        .from("account_deletion_requests")
        .update({
          attempts: newAttempts,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestRow.id)

      await auditLog({
        action: "account.deletion_code_failed",
        actorUserId: user.id,
        metadata: {
          requestId: requestRow.id,
          attempt: newAttempts,
        },
      })

      const remaining = Math.max(0, requestRow.max_attempts - newAttempts)
      if (remaining === 0) {
        return {
          error: "Código incorreto. Limite de 5 tentativas atingido. Esta solicitação foi bloqueada.",
          isLocked: true,
          remainingAttempts: 0,
        }
      }

      return {
        error: `Código incorreto. Você ainda tem ${remaining} tentativa(s).`,
        remainingAttempts: remaining,
      }
    }

    // 5. Code is valid: mark request verified
    await admin
      .from("account_deletion_requests")
      .update({
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestRow.id)

    // 6. Gather request metadata headers
    const reqHeaders = await headers()
    const userAgent = reqHeaders.get("user-agent")
    const ip = getTrustedClientIP(reqHeaders)
    const country = getTrustedClientCountry(reqHeaders) || "unknown"
    const finalReason = input.reason || requestRow.metadata?.reason || null

    // 7. Delegate execution to AccountDeletionService (creates account_deletions record & starts pipeline)
    const result = await AccountDeletionService.requestDeletion(
      user.id,
      finalReason,
      ip,
      userAgent,
      country
    )

    if (!result.success) {
      return { error: result.error || "Erro ao registrar solicitação de exclusão." }
    }

    // 8. Audit log confirmation before auth user is deleted
    await auditLog({
      action: "account.deletion_confirmed",
      actorUserId: user.id,
      metadata: {
        requestId: requestRow.id,
      },
    })

    // 9. Execute complete account deletion synchronously so the account is immediately purged
    if (result.deletionId) {
      await AccountDeletionService.executeDeletionWorkflow(
        result.deletionId,
        user.id,
        result.partnerId ?? null
      )
    }

    // 10. Invalidate session cookies immediately
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    for (const c of allCookies) {
      if (c.name.startsWith("sb-")) {
        cookieStore.delete(c.name)
      }
    }
    cookieStore.delete("active_partner_id")
    cookieStore.delete("active_store_id")
    cookieStore.delete("x-account-deleting")

    // Webhook Discord: notificar exclusão de conta confirmada (fail-open)
    const { sendAccountDeleted } = await import("@/lib/services/discord-general-webhook.service")
    sendAccountDeleted({
      userId: user.id,
      userEmail: user.email,
      userName: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0],
      reason: finalReason || undefined,
      requestedAt: new Date().toISOString(),
    }).catch(err => console.warn("[ACCOUNT_DELETE] Discord webhook failed (non-blocking):", err))

    revalidatePath("/erp/configuracoes/assinatura")
    return { success: true }
  } catch (error: any) {
    SecureLogger.error("Unexpected error in confirmAccountDeletionAction", { error: error?.message })
    return { error: "Ocorreu um erro inesperado ao confirmar a exclusão." }
  }
}

/**
 * Cancela em lote todas as assinaturas recorrentes ativas do parceiro no ERP
 * antes da exclusão da conta (no banco e no Mercado Pago).
 */
export async function cancelAllActiveRecurringSubscriptionsAction(
  csrf_token?: string
): Promise<{
  success?: boolean
  cancelled?: number
  failed?: number
  error?: string
}> {
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  try {
    const user = await requireUser()
    const admin = getAdminClient()

    const { data: partner, error: partnerError } = await admin
      .from("partners")
      .select("id, user_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (partnerError || !partner) {
      return { error: "Parceiro não encontrado para esta conta." }
    }

    if (partner.user_id !== user.id) {
      return { error: "Somente o proprietário principal (OWNER) da conta pode cancelar as assinaturas." }
    }

    const { cancelAllMarketplaceSubscriptions } = await import("@/lib/services/recurring/limits")
    const { cancelled, failed } = await cancelAllMarketplaceSubscriptions(partner.id)

    revalidatePath("/erp/assinaturas")
    revalidatePath("/assinaturas")
    revalidateTag(`partner_recurring_plans_${partner.id}`, { expire: 0 })

    return { success: true, cancelled, failed }
  } catch (error: any) {
    SecureLogger.error("Error in cancelAllActiveRecurringSubscriptionsAction", { error: error?.message })
    return { error: "Não foi possível cancelar as assinaturas recorrentes agora." }
  }
}

/**
 * Legacy deletion action: blocks direct execution and requires the 2-step OTP flow.
 */
export async function deleteAccountAction(
  userId: string,
  reason: string | null,
  csrf_token?: string
) {
  return {
    error: "A exclusão direta foi descontinuada. É necessário confirmar o código de 6 dígitos enviado por e-mail.",
  }
}

/**
 * Volumetry simulation (dry-run) before requesting deletion.
 */
export async function getAccountDeletionDryRunAction(csrf_token?: string) {
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  try {
    const user = await requireUser()
    const result = await AccountDeletionService.executeDryRun(user.id)
    if (!result.success) {
      return { error: result.error || "Erro ao gerar simulação." }
    }
    return { success: true, report: result.report }
  } catch (error: any) {
    SecureLogger.error("General error in getAccountDeletionDryRunAction", { error: error?.message })
    return { error: "Ocorreu um erro inesperado." }
  }
}

/**
 * Check if a user ID is currently in the account deletion pipeline.
 */
export async function checkUserDeletionStatusAction(userId: string): Promise<{ isDeleting: boolean }> {
  try {
    const admin = getAdminClient()
    const { data: deletion } = await admin
      .from("account_deletions")
      .select("id, status")
      .eq("user_id", userId)
      .not("status", "eq", "completed")
      .not("status", "eq", "failed")
      .maybeSingle()

    return { isDeleting: !!deletion }
  } catch {
    return { isDeleting: false }
  }
}
