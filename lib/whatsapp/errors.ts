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
