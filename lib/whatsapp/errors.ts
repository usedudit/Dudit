export class WhatsappError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly raw?: unknown,
  ) {
    super(message)
    this.name = "WhatsappError"
  }
}

const PERMANENT_CODES = new Set([
  "INVALID_PHONE",
  "RECIPIENT_BLOCKED",
  "TEMPLATE_NOT_FOUND",
  "PERMISSION_DENIED",
  "ACCOUNT_DISABLED",
  "131026",
  "131047",
  "131051",
])

const RETRYABLE_CODES = new Set([
  "RATE_LIMIT",
  "NETWORK_ERROR",
  "TIMEOUT",
  "SERVICE_UNAVAILABLE",
  "130429",
  "131000",
])

export function isRetryableWhatsappError(error: unknown): boolean {
  if (error instanceof WhatsappError) return error.retryable
  const msg = String((error as Error)?.message || "").toLowerCase()
  if (msg.includes("rate limit") || msg.includes("timeout") || msg.includes("econnreset")) return true
  if (msg.includes("invalid") && msg.includes("phone")) return false
  if (msg.includes("blocked")) return false
  return false
}

export function classifyMetaError(code: string | number, message: string): WhatsappError {
  const codeStr = String(code)
  if (PERMANENT_CODES.has(codeStr) || message.toLowerCase().includes("invalid phone")) {
    return new WhatsappError(message, codeStr, false)
  }
  if (RETRYABLE_CODES.has(codeStr) || codeStr === "130429") {
    return new WhatsappError(message, codeStr, true)
  }
  return new WhatsappError(message, codeStr, true)
}

export function classifyEvolutionError(statusCode: number, message: string): WhatsappError {
  const codeStr = String(statusCode)

  // Permanent (non-retryable) errors
  if (statusCode === 400) {
    const lc = message.toLowerCase()
    if (lc.includes("invalid") && lc.includes("phone")) {
      return new WhatsappError(message, "INVALID_PHONE", false)
    }
    if (lc.includes("not found") || lc.includes("instance")) {
      return new WhatsappError(message, "INSTANCE_NOT_FOUND", false)
    }
    return new WhatsappError(message, codeStr, false)
  }
  if (statusCode === 401 || statusCode === 403) {
    return new WhatsappError(message, "AUTH_FAILED", false)
  }
  if (statusCode === 404) {
    return new WhatsappError(message, "NOT_FOUND", false)
  }

  // Retryable errors
  if (statusCode === 429) {
    return new WhatsappError(message, "RATE_LIMIT", true)
  }
  if (statusCode >= 500) {
    return new WhatsappError(message, "SERVICE_UNAVAILABLE", true)
  }
  if (statusCode === 408) {
    return new WhatsappError(message, "TIMEOUT", true)
  }

  return new WhatsappError(message, codeStr, statusCode >= 500)
}

