import "server-only"

import { SecureLogger } from "@/lib/secure-logger"
import type { EmailRecipient, EmailSendResult, InternalEmailRequest } from "@/lib/types/unosend.types"

const SMTP2GO_BASE_URL = "https://api.smtp2go.com/v3/email/send"
const SMTP2GO_TIMEOUT_MS = 10_000
const MAX_RETRIES = 3

type SMTP2GOResponse = {
  request_id?: string
  data?: {
    succeeded?: number
    failed?: number
    failures?: Array<{ email?: string; error?: string }>
    email_id?: string
    error_code?: string
    error?: string
  }
}

class SMTP2GOError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode?: number,
    public retryable = false,
  ) {
    super(message)
    this.name = "SMTP2GOError"
  }
}

function defaultSender() {
  return process.env.SMTP2GO_FROM_EMAIL
    || process.env.SMTP_FROM_EMAIL
    || process.env.EMAIL_FROM
    || process.env.UNOSEND_FROM_EMAIL
    || "contato@dudit.com.br"
}

function formatRecipient(recipient: EmailRecipient | string) {
  if (typeof recipient === "string") return recipient
  return recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email
}

function isRetryableStatus(status?: number) {
  return status === 429 || !!status && status >= 500
}

function validateRequest(request: InternalEmailRequest) {
  const sender = request.from || defaultSender()
  if (!sender.includes("@")) throw new SMTP2GOError("INVALID_FROM", "Endereço 'from' inválido", 400)
  if (!request.to?.length) throw new SMTP2GOError("INVALID_TO", "Nenhum destinatário fornecido", 400)
  if (!request.subject?.trim()) throw new SMTP2GOError("INVALID_SUBJECT", "Assunto do email é obrigatório", 400)
  if (!request.html && !request.text && !request.template_id) {
    throw new SMTP2GOError("INVALID_BODY", "É necessário informar HTML, texto ou um template", 400)
  }
  for (const recipient of request.to) {
    const email = typeof recipient === "string" ? recipient : recipient.email
    if (!email?.includes("@")) throw new SMTP2GOError("INVALID_RECIPIENT", `Destinatário inválido: ${email}`, 400)
  }
}

export class SMTP2GOService {
  static async sendEmail(request: InternalEmailRequest): Promise<EmailSendResult> {
    const apiKey = process.env.SMTP2GO_API?.trim()
    if (!apiKey) {
      return {
        success: false,
        error: { code: "CONFIG_ERROR", message: "SMTP2GO_API não configurada", retryable: false },
        timestamp: new Date(),
        attempts: 0,
      }
    }

    try {
      validateRequest(request)
    } catch (error) {
      const typed = error instanceof SMTP2GOError ? error : new SMTP2GOError("INVALID_REQUEST", "Email inválido", 400)
      return {
        success: false,
        error: { code: typed.code, message: typed.message, retryable: typed.retryable },
        timestamp: new Date(),
        attempts: 0,
      }
    }

    let lastError: SMTP2GOError | null = null
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)))
        return await this.sendOnce(request, apiKey, attempt)
      } catch (error) {
        lastError = error instanceof SMTP2GOError
          ? error
          : new SMTP2GOError("NETWORK_ERROR", "Erro de conexão com SMTP2GO", undefined, true)
        if (!lastError.retryable || attempt === MAX_RETRIES - 1) break
      }
    }

    SecureLogger.error("[SMTP2GO] Failed to send email", {
      code: lastError?.code,
      statusCode: lastError?.statusCode,
      userId: request.userId,
    })
    return {
      success: false,
      error: {
        code: lastError?.code || "UNKNOWN_ERROR",
        message: lastError?.message || "Falha ao enviar email",
        retryable: lastError?.retryable || false,
      },
      timestamp: new Date(),
      attempts: MAX_RETRIES,
    }
  }

  private static async sendOnce(request: InternalEmailRequest, apiKey: string, attempt: number): Promise<EmailSendResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SMTP2GO_TIMEOUT_MS)
    const body: Record<string, unknown> = {
      sender: request.from || defaultSender(),
      to: request.to.map(formatRecipient),
      subject: request.subject,
      html_body: request.html || undefined,
      text_body: request.text || undefined,
      template_id: request.template_id || undefined,
      template_data: request.variables || undefined,
      fastaccept: true,
      attachments: request.attachments?.map((attachment) => ({
        filename: attachment.filename,
        fileblob: attachment.content,
        mimetype: attachment.contentType,
      })),
    }

    try {
      const response = await fetch(SMTP2GO_BASE_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "X-Smtp2go-Api-Key": apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      let payload: SMTP2GOResponse = {}
      try {
        payload = await response.json() as SMTP2GOResponse
      } catch {
        payload = {}
      }

      const data = payload.data || {}
      const emailId = data.email_id || payload.request_id || "accepted"
      const hasExplicitFailure = (Number(data.failed || 0) > 0 || (Array.isArray(data.failures) && data.failures.length > 0)) && Number(data.succeeded || 0) === 0
      const isSuccess = response.ok && !data.error && !data.error_code && !hasExplicitFailure

      if (isSuccess) {
        SecureLogger.info("[SMTP2GO] Email accepted", { messageId: emailId, userId: request.userId, attempt: attempt + 1 })
        return { success: true, messageId: emailId, timestamp: new Date(), attempts: attempt + 1 }
      }

      throw new SMTP2GOError(
        data.error_code || (data.failures?.[0]?.error ? "DELIVERY_ERROR" : "API_ERROR"),
        data.error || data.failures?.[0]?.error || `SMTP2GO API error: ${response.status}`,
        response.status,
        isRetryableStatus(response.status),
      )
    } catch (error) {
      if (error instanceof SMTP2GOError) throw error
      if (error instanceof Error && error.name === "AbortError") {
        throw new SMTP2GOError("TIMEOUT", "Requisição ao SMTP2GO expirou", 408, true)
      }
      throw new SMTP2GOError("NETWORK_ERROR", "Erro de conexão com SMTP2GO", undefined, true)
    } finally {
      clearTimeout(timeout)
    }
  }
}
