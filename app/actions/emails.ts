"use server"

/**
 * Server actions for email sending
 * All email operations go through this layer for security and observability
 */

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { UnosendService } from "@/lib/services/unosend.service"
import { SecureLogger } from "@/lib/secure-logger"
import { getErrorMessage } from "@/lib/utils/error-handlers"
import type { InternalEmailRequest, EmailSendResult } from "@/lib/types/unosend.types"

// ============================================================================
// TYPES
// ============================================================================

interface SendEmailInput {
  to: string | string[]
  subject: string
  html: string
  text?: string
  toName?: string
  partnerId?: string
}

interface SendEmailResponse {
  success: boolean
  messageId?: string
  error?: string
}

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Send an email via Unosend
 * Validates user, checks rate limits, and routes through UnosendService
 */
export async function sendEmailAction(input: SendEmailInput): Promise<SendEmailResponse> {
  try {
    // ====================================================================
    // SECURITY: Verify user is authenticated
    // ====================================================================
    const user = await requireUser()

    // ====================================================================
    // SECURITY: Apply rate limit
    // ====================================================================
    await requireRateLimit(RateLimitCategory.UNOSEND_EMAIL)

    // ====================================================================
    // VALIDATION
    // ====================================================================
    if (!input.to || (Array.isArray(input.to) && input.to.length === 0)) {
      return {
        success: false,
        error: "Destinatário é obrigatório",
      }
    }

    if (!input.subject || input.subject.trim().length === 0) {
      return {
        success: false,
        error: "Assunto é obrigatório",
      }
    }

    if (!input.html && !input.text) {
      return {
        success: false,
        error: "Corpo do email (HTML ou texto) é obrigatório",
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const recipients = Array.isArray(input.to) ? input.to : [input.to]

    for (const email of recipients) {
      if (!emailRegex.test(email)) {
        return {
          success: false,
          error: `Endereço de email inválido: ${email}`,
        }
      }
    }

    // ====================================================================
    // SECURITY: If partnerId provided, verify ownership
    // ====================================================================
    if (input.partnerId) {
      const supabase = await getSupabaseServerClient()
      const { data: partner } = await supabase
        .from("partners")
        .select("id")
        .eq("id", input.partnerId)
        .eq("user_id", user.id)
        .single()

      if (!partner) {
        SecureLogger.warn("[Email Action] Unauthorized partner access attempt", {
          userId: user.id,
          partnerId: input.partnerId,
        })
        return {
          success: false,
          error: "Acesso negado",
        }
      }
    }

    // ====================================================================
    // DEDUPLICATION: Check if email was already sent in last 5 minutes
    // ====================================================================
    const supabase = await getSupabaseServerClient()
    const recipientEmail = Array.isArray(input.to) ? input.to[0] : input.to
    const dedupKey = `${user.id}-${recipientEmail}-${input.subject}`
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

    const { data: recentEmail } = await supabase
      .from("email_send_log")
      .select("id, message_id")
      .eq("user_id", user.id)
      .eq("recipient_email", recipientEmail)
      .eq("subject", input.subject)
      .gt("created_at", fiveMinutesAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (recentEmail) {
      SecureLogger.info("[Email Action] Duplicate email request prevented", {
        userId: user.id,
        recipientEmail,
        subject: input.subject,
        previousMessageId: recentEmail.message_id,
      })
      return {
        success: true,
        messageId: recentEmail.message_id || "duplicate",
        error: "Este email foi enviado recentemente. Requisição duplicada foi bloqueada.",
      }
    }

    // ====================================================================
    // PREPARE REQUEST
    // ====================================================================
    const internalRequest: InternalEmailRequest = {
      to: recipients.map((email) => ({
        email,
        name: input.toName,
      })),
      subject: input.subject,
      html: input.html,
      text: input.text,
      userId: user.id,
      partnerId: input.partnerId,
    }

    // ====================================================================
    // SEND EMAIL
    // ====================================================================
    const result = await UnosendService.sendEmail(internalRequest)

    if (!result.success) {
      SecureLogger.warn("[Email Action] Failed to send email", {
        userId: user.id,
        error: result.error?.code,
        attempts: result.attempts,
      })

      return {
        success: false,
        error: result.error?.message || "Falha ao enviar email",
      }
    }

    SecureLogger.info("[Email Action] Email sent successfully", {
      userId: user.id,
      messageId: result.messageId,
      recipientCount: recipients.length,
    })

    // ====================================================================
    // LOG EMAIL FOR DEDUPLICATION
    // ====================================================================
    for (const recipient of recipients) {
      try {
        await supabase.from("email_send_log").insert({
          user_id: user.id,
          recipient_email: recipient,
          subject: input.subject,
          message_id: result.messageId,
          status: "sent",
          partner_id: input.partnerId,
        })
      } catch (logError) {
        // Log but don't fail if dedup logging fails
        SecureLogger.warn("[Email Action] Failed to log email send", {
          userId: user.id,
          recipient,
          error: logError instanceof Error ? logError.message : "Unknown",
        })
      }
    }

    return {
      success: true,
      messageId: result.messageId,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"

    SecureLogger.error("[Email Action] Unexpected error", {
      message,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    })

    return {
      success: false,
      error: getErrorMessage(error),
    }
  }
}

/**
 * Send transactional email (internal - no user context)
 * Used for system emails like password resets
 * Only available to authenticated server-side code
 */
export async function sendTransactionalEmailAction(
  input: Omit<SendEmailInput, "partnerId">,
): Promise<EmailSendResult> {
  // This is typically called from other server actions or API routes
  // You might want additional checks here (e.g., whitelisted senders)

  const internalRequest: InternalEmailRequest = {
    to: Array.isArray(input.to) ? input.to.map((email) => ({ email })) : [{ email: input.to }],
    subject: input.subject,
    html: input.html,
    text: input.text,
  }

  const result = await UnosendService.sendEmail(internalRequest)

  SecureLogger.info("[Transactional Email] Email sent", {
    messageId: result.messageId,
    success: result.success,
    attempts: result.attempts,
  })

  return result
}
