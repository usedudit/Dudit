/**
 * Production-grade Unosend email service with retry logic and observability
 * @module unosend.service
 */

import { SecureLogger } from "@/lib/secure-logger"
import type {
  UnosendEmailRequest,
  UnosendEmailResponse,
  UnosendErrorResponse,
  EmailSendResult,
  InternalEmailRequest,
} from "@/lib/types/unosend.types"

// ============================================================================
// CONFIGURATION
// ============================================================================

const UNOSEND_API_KEY = process.env.UNOSEND_API_KEY
const UNOSEND_BASE_URL = "https://api.unosend.co/v1"
const UNOSEND_TIMEOUT_MS = 10000 // 10 seconds
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 1000 // 1 second

// ============================================================================
// ERROR CLASSES
// ============================================================================

class UnosendError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode?: number,
    public retryable: boolean = false,
  ) {
    super(message)
    this.name = "UnosendError"
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate exponential backoff with jitter
 */
function getRetryDelayMs(attempt: number): number {
  const exponentialDelay = Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt), 32000)
  const jitter = Math.random() * 0.1 * exponentialDelay // 10% jitter
  return Math.floor(exponentialDelay + jitter)
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(statusCode?: number): boolean {
  if (!statusCode) return false
  // Retry on rate limit (429) and server errors (5xx)
  return statusCode === 429 || statusCode >= 500
}

/**
 * Generate idempotency key
 */
function generateIdempotencyKey(userId?: string, emailHash?: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(7)
  const prefix = userId ? `user-${userId}` : "anon"
  return `${prefix}-${timestamp}-${random}`
}

// ============================================================================
// UNOSEND SERVICE
// ============================================================================

export class UnosendService {
  /**
   * Send email via Unosend API with retry logic
   */
  static async sendEmail(request: InternalEmailRequest): Promise<EmailSendResult> {
    if (!UNOSEND_API_KEY) {
      SecureLogger.error("[Unosend] API key not configured", {
        context: "UNOSEND_API_KEY missing",
      })
      return {
        success: false,
        error: {
          code: "CONFIG_ERROR",
          message: "Unosend API key não configurado",
          retryable: false,
        },
        timestamp: new Date(),
        attempts: 0,
      }
    }

    let lastError: UnosendError | null = null
    let attempt = 0

    // Retry loop
    for (attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delayMs = getRetryDelayMs(attempt - 1)
          SecureLogger.info(`[Unosend] Retry attempt ${attempt}, waiting ${delayMs}ms`, {
            userId: request.userId,
            attempt,
          })
          await sleep(delayMs)
        }

        const result = await this.sendEmailOnce(request, attempt)
        return result
      } catch (error) {
        lastError = error as UnosendError

        if (!lastError.retryable) {
          SecureLogger.warn(`[Unosend] Non-retryable error on attempt ${attempt + 1}`, {
            code: lastError.code,
            message: lastError.message,
            userId: request.userId,
            statusCode: lastError.statusCode,
          })
          break
        }

        SecureLogger.warn(`[Unosend] Retryable error on attempt ${attempt + 1}`, {
          code: lastError.code,
          message: lastError.message,
          userId: request.userId,
          statusCode: lastError.statusCode,
        })
      }
    }

    // All retries failed
    SecureLogger.error(`[Unosend] Failed to send email after ${MAX_RETRIES} attempts`, {
      code: lastError?.code,
      message: lastError?.message,
      userId: request.userId,
      statusCode: lastError?.statusCode,
    })

    return {
      success: false,
      error: {
        code: lastError?.code || "UNKNOWN_ERROR",
        message: lastError?.message || "Falha ao enviar email",
        retryable: lastError?.retryable || false,
      },
      timestamp: new Date(),
      attempts: attempt,
    }
  }

  /**
   * Perform a single email send attempt
   */
  private static async sendEmailOnce(
    request: InternalEmailRequest & { template_id?: string; variables?: Record<string, any> },
    attemptNumber: number,
  ): Promise<EmailSendResult> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), UNOSEND_TIMEOUT_MS)

    try {
      // Build Unosend request
      const unosendRequest: any = {
        from: request.from || this.getDefaultFromEmail(),
        to: request.to.map((r) => (typeof r === "string" ? { email: r } : r)),
        subject: request.subject,
        idempotencyKey: generateIdempotencyKey(request.userId),
      }

      // Lógica de conteúdo
      if (request.template_id) {
        unosendRequest.template_id = request.template_id
        unosendRequest.variables = request.variables
      } else {
        unosendRequest.html = request.html
        unosendRequest.text = request.text
      }

      // Valide o objeto já montado (unosendRequest) para garantir que o template_id seja considerado
      this.validateEmailRequest(unosendRequest)

      const response = await fetch(`${UNOSEND_BASE_URL}/emails`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${UNOSEND_API_KEY}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": unosendRequest.idempotencyKey || "",
        },
        body: JSON.stringify(unosendRequest),
        signal: controller.signal,
      })

      const responseData = (await response.json()) as UnosendEmailResponse | UnosendErrorResponse

      // Handle rate limit headers
      const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining")
      const rateLimitReset = response.headers.get("X-RateLimit-Reset")

      if (rateLimitRemaining && parseInt(rateLimitRemaining) < 10) {
        SecureLogger.warn("[Unosend] Approaching rate limit", {
          remaining: rateLimitRemaining,
          reset: rateLimitReset,
          userId: request.userId,
        })
      }

      // Success response
      if (response.ok && "id" in responseData) {
        SecureLogger.info("[Unosend] Email sent successfully", {
          messageId: responseData.id,
          userId: request.userId,
          attempt: attemptNumber + 1,
        })

        return {
          success: true,
          messageId: responseData.id,
          timestamp: new Date(),
          attempts: attemptNumber + 1,
        }
      }

      // Error response
      const errorResponse = responseData as UnosendErrorResponse
      const retryable = isRetryableError(response.status)

      throw new UnosendError(
        errorResponse.code || "API_ERROR",
        errorResponse.message || `Unosend API error: ${response.status}`,
        response.status,
        retryable,
      )
    } catch (error) {
      // Handle fetch/network errors
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new UnosendError("TIMEOUT", "Requisição ao Unosend expirou", 408, true)
        }

        if (error.message.includes("fetch")) {
          throw new UnosendError("NETWORK_ERROR", "Erro de conexão com Unosend", undefined, true)
        }

        if (error instanceof UnosendError) {
          throw error
        }
      }

      throw new UnosendError("UNKNOWN_ERROR", "Erro desconhecido ao enviar email", undefined, true)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Validate email request before sending
   */
  private static validateEmailRequest(request: UnosendEmailRequest): void {
    if (!request.from || !request.from.includes("@")) {
      throw new UnosendError("INVALID_FROM", "Endereço 'from' inválido", 400, false)
    }

    if (!request.to || request.to.length === 0) {
      throw new UnosendError("INVALID_TO", "Nenhum destinatário fornecido", 400, false)
    }

    if (!request.subject || request.subject.trim().length === 0) {
      throw new UnosendError("INVALID_SUBJECT", "Assunto do email é obrigatório", 400, false)
    }

    if (!request.html && !request.text && !(request as any).template_id) {
      throw new UnosendError("INVALID_BODY", "É necessário informar o HTML, Texto ou um Template ID", 400, false)
    }

    // Validate recipients
    for (const recipient of request.to) {
      const email = typeof recipient === "string" ? recipient : recipient.email
      if (!email.includes("@")) {
        throw new UnosendError("INVALID_RECIPIENT", `Destinatário inválido: ${email}`, 400, false)
      }
    }
  }

  /**
   * Get default from email
   */
  private static getDefaultFromEmail(): string {
    return process.env.UNOSEND_FROM_EMAIL || "noreply@yourdomain.com"
  }
}
