/**
 * API endpoint for sending emails via Unosend
 * POST /api/emails/send
 *
 * Security:
 * - Requires authentication
 * - Rate limited per user
 * - Input validation
 * - No API key exposure
 */

import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getCurrentUser, requirePartnerAccess } from "@/lib/auth/authorization"
import { can } from "@/lib/permissions/can"
import { SecureLogger } from "@/lib/secure-logger"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { UnosendService } from "@/lib/services/unosend.service"
import { getErrorMessage } from "@/lib/utils/error-handlers"
import type { InternalEmailRequest } from "@/lib/types/unosend.types"

// ============================================================================
// REQUEST TYPE
// ============================================================================

interface EmailSendRequest {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  toName?: string
  cc?: string[]
  bcc?: string[]
  partnerId?: string
  attachments?: Array<{
    filename: string
    content: string
    contentType: string
  }>
}

// ============================================================================
// HANDLER
// ============================================================================

async function handler(request: NextRequest) {
  try {
    // ====================================================================
    // SECURITY: Authenticate user
    // ====================================================================
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const supabase = await getSupabaseServerClient()
    const userId = user.id

    // ====================================================================
    // SECURITY: Apply rate limit
    // ====================================================================
    try {
      await requireRateLimit(RateLimitCategory.UNOSEND_EMAIL)
    } catch (error) {
      SecureLogger.warn("[Email API] Rate limit exceeded", {
        userId,
        error: error instanceof Error ? error.message : "Unknown",
      })
      return NextResponse.json(
        { error: "Muitas requisições. Tente novamente em breve." },
        { status: 429 },
      )
    }

    // ====================================================================
    // PARSE & VALIDATE INPUT
    // ====================================================================
    let body: EmailSendRequest

    try {
      body = await request.json()
    } catch (error) {
      return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 })
    }

    // Validate required fields
    if (!body.to || (Array.isArray(body.to) && body.to.length === 0)) {
      return NextResponse.json({ error: "Destinatário é obrigatório" }, { status: 400 })
    }

    if (!body.subject || body.subject.trim().length === 0) {
      return NextResponse.json({ error: "Assunto é obrigatório" }, { status: 400 })
    }

    if (!body.html && !body.text) {
      return NextResponse.json({ error: "Corpo do email (HTML ou texto) é obrigatório" }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const recipients = Array.isArray(body.to) ? body.to : [body.to]

    for (const email of recipients) {
      if (!emailRegex.test(email)) {
        return NextResponse.json({ error: `Endereço de email inválido: ${email}` }, { status: 400 })
      }
    }

    // Max file size check: 40MB per Unosend limits
    const totalSize = (body.html?.length || 0) + (body.text?.length || 0) + (body.attachments || []).reduce((sum, att) => sum + att.content.length, 0)

    if (totalSize > 40 * 1024 * 1024) {
      return NextResponse.json({ error: "Email muito grande (máximo 40MB)" }, { status: 400 })
    }

    // ====================================================================
    // SECURITY: Verify partner access + permission if provided
    // ====================================================================
    if (body.partnerId) {
      const access = await requirePartnerAccess(body.partnerId)
      if (!can({ role_id: access.roleId, permissions: access.permissions }, "settings.settings_messages")) {
        SecureLogger.warn("[Email API] Unauthorized partner access", {
          userId,
          partnerId: body.partnerId,
        })
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
      }
    }

    // ====================================================================
    // DEDUPLICATION: Check if email was already sent in last 5 minutes
    // ====================================================================
    const recipientEmail = recipients[0]
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

    const { data: recentEmail } = await supabase
      .from("email_send_log")
      .select("id, message_id")
      .eq("user_id", userId)
      .eq("recipient_email", recipientEmail)
      .eq("subject", body.subject)
      .gt("created_at", fiveMinutesAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (recentEmail) {
      SecureLogger.info("[Email API] Duplicate email request prevented", {
        userId,
        recipientEmail,
        subject: body.subject,
        previousMessageId: recentEmail.message_id,
      })
      return NextResponse.json(
        {
          success: true,
          messageId: recentEmail.message_id || "duplicate",
          warning: "Este email foi enviado recentemente. Requisição duplicada foi bloqueada.",
        },
        { status: 200 },
      )
    }

    // ====================================================================
    // PREPARE & SEND
    // ====================================================================
    const internalRequest: InternalEmailRequest = {
      to: recipients.map((email) => ({
        email,
        name: body.toName,
      })),
      subject: body.subject,
      html: body.html || "",
      text: body.text,
      attachments: body.attachments,
      userId,
      partnerId: body.partnerId,
    }

    const result = await UnosendService.sendEmail(internalRequest)

    // ====================================================================
    // RESPONSE
    // ====================================================================
    if (!result.success) {
      SecureLogger.warn("[Email API] Failed to send email", {
        userId,
        error: result.error?.code,
        attempts: result.attempts,
      })

      const statusCode = result.error?.code === "CONFIG_ERROR" ? 500 : 400

      return NextResponse.json(
        {
          error: result.error?.message || "Falha ao enviar email",
          code: result.error?.code,
        },
        { status: statusCode },
      )
    }

    SecureLogger.info("[Email API] Email sent successfully", {
      userId,
      messageId: result.messageId,
      recipientCount: recipients.length,
    })

    // ====================================================================
    // LOG EMAIL FOR DEDUPLICATION
    // ====================================================================
    for (const recipient of recipients) {
      try {
        await supabase.from("email_send_log").insert({
          user_id: userId,
          recipient_email: recipient,
          subject: body.subject,
          message_id: result.messageId,
          status: "sent",
          partner_id: body.partnerId,
        })
      } catch (logError) {
        // Log but don't fail if dedup logging fails
        SecureLogger.warn("[Email API] Failed to log email send", {
          userId,
          recipient,
          error: logError instanceof Error ? logError.message : "Unknown",
        })
      }
    }

    return NextResponse.json(
      {
        success: true,
        messageId: result.messageId,
      },
      { status: 200 },
    )
  } catch (error) {
    SecureLogger.error("[Email API] Unexpected error", {
      error: error instanceof Error ? error.message : "Unknown error",
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    })

    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    )
  }
}

// Apply CSRF protection middleware
export const POST = withCSRFProtection(handler)
