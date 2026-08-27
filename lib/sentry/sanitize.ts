import type {
  Breadcrumb,
  BreadcrumbHint,
  ErrorEvent,
  Event,
  EventHint,
  SpanJSON,
  TransactionEvent,
} from "@sentry/core"

export const SENTRY_REDACTED_VALUE = "[Filtered]"

const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|set[-_ ]?cookie|csrf|xsrf|token|secret|password|passwd|api[-_ ]?key|access[-_ ]?key|private[-_ ]?key|session|jwt|cpf|cnpj|tax|document|email|phone|mobile|address|street|zipcode|postal|name|customer|client|user|payment|card|cvv|cvc|mercado\s*pago|mercadopago|webhook|payload|request[-_ ]?body|response[-_ ]?body|form[-_ ]?data|input|output|iban|pix|bank|account|payer|identification/i

const SENSITIVE_BREADCRUMB_PATTERN =
  /auth|cookie|token|payment|mercado\s*pago|mercadopago|webhook|form|input|output|request|response/i

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
const JWT_PATTERN = /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g
const BEARER_PATTERN = /\bBearer\s+[a-zA-Z0-9._~+/=-]+/gi
const CPF_PATTERN = /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g
const CNPJ_PATTERN = /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/.\s]?\d{4}[-\s]?\d{2}\b/g
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE_PATTERN = /(?<!\d)(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}(?!\d)/g
const CARD_PATTERN = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g
const API_KEY_PATTERN = /\b(?:sk|pk|rk|ghp|xox[baprs]|AKIA)[-_a-zA-Z0-9]+\b/g

function isSensitiveKey(key: string | undefined): boolean {
  return Boolean(key && SENSITIVE_KEY_PATTERN.test(key))
}

function sanitizeString(value: string): string {
  return value
    .replace(BEARER_PATTERN, `Bearer ${SENTRY_REDACTED_VALUE}`)
    .replace(JWT_PATTERN, SENTRY_REDACTED_VALUE)
    .replace(API_KEY_PATTERN, SENTRY_REDACTED_VALUE)
    .replace(CPF_PATTERN, SENTRY_REDACTED_VALUE)
    .replace(CNPJ_PATTERN, SENTRY_REDACTED_VALUE)
    .replace(EMAIL_PATTERN, SENTRY_REDACTED_VALUE)
    .replace(PHONE_PATTERN, SENTRY_REDACTED_VALUE)
    .replace(CARD_PATTERN, SENTRY_REDACTED_VALUE)
}

function sanitizeRoute(value: string): string {
  try {
    const url = new URL(value, "http://sentry.invalid")
    const path = url.pathname
      .replace(UUID_PATTERN, SENTRY_REDACTED_VALUE)
      .replace(CPF_PATTERN, SENTRY_REDACTED_VALUE)
      .replace(CNPJ_PATTERN, SENTRY_REDACTED_VALUE)
      .replace(/\/\d+(?=\/|$)/g, `/${SENTRY_REDACTED_VALUE}`)

    return `${url.origin === "http://sentry.invalid" ? "" : url.origin}${sanitizeString(path)}`
  } catch {
    return sanitizeString(value.split(/[?#]/, 1)[0] ?? value)
  }
}

function sanitizeUnknown(value: unknown, key?: string, depth = 0): unknown {
  if (isSensitiveKey(key)) {
    return SENTRY_REDACTED_VALUE
  }
  if (depth > 8) {
    return SENTRY_REDACTED_VALUE
  }
  if (typeof value === "string") {
    if (key && /url|uri|href|path|route/i.test(key)) {
      return sanitizeRoute(value)
    }
    return sanitizeString(value)
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item, key, depth + 1))
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = isSensitiveKey(childKey)
        ? SENTRY_REDACTED_VALUE
        : sanitizeUnknown(childValue, childKey, depth + 1)
    }
    return result
  }
  return SENTRY_REDACTED_VALUE
}

/**
 * Sanitizes arbitrary metadata before it is attached to a monitoring event.
 * This is intentionally exported so application code never needs to duplicate
 * Sentry's PII rules when adding context or breadcrumbs.
 */
export function sanitizeMonitoringData(value: unknown): unknown {
  return sanitizeUnknown(value)
}

function sanitizeRecord(value: unknown): Record<string, unknown> | undefined {
  const sanitized = sanitizeUnknown(value)
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : undefined
}

function sanitizeStacktrace(stacktrace: unknown): unknown {
  if (!stacktrace || typeof stacktrace !== "object") {
    return undefined
  }
  const sanitized = { ...(stacktrace as Record<string, unknown>) }
  if (Array.isArray(sanitized.frames)) {
    sanitized.frames = sanitized.frames.map((frame) => {
      if (!frame || typeof frame !== "object") {
        return frame
      }
      const safeFrame = { ...(frame as Record<string, unknown>) }
      delete safeFrame.vars
      delete safeFrame.pre_context
      delete safeFrame.post_context
      delete safeFrame.context_line
      if (typeof safeFrame.filename === "string") {
        safeFrame.filename = sanitizeString(safeFrame.filename)
      }
      if (typeof safeFrame.abs_path === "string") {
        safeFrame.abs_path = sanitizeString(safeFrame.abs_path)
      }
      return safeFrame
    })
  }
  return sanitized
}

function sanitizeRequest(request: unknown): Event["request"] | undefined {
  if (!request || typeof request !== "object") {
    return undefined
  }
  const source = request as Record<string, unknown>
  const safeRequest: NonNullable<Event["request"]> = {}
  if (typeof source.method === "string") {
    safeRequest.method = source.method.toUpperCase().slice(0, 12)
  }
  if (typeof source.url === "string") {
    safeRequest.url = sanitizeRoute(source.url)
  }
  return safeRequest
}

export function sanitizeBreadcrumb(
  breadcrumb: Breadcrumb,
  _hint?: BreadcrumbHint,
): Breadcrumb | null {
  if (SENSITIVE_BREADCRUMB_PATTERN.test(breadcrumb.category ?? "")) {
    return null
  }
  const sanitized: Breadcrumb = { ...breadcrumb }
  if (typeof sanitized.message === "string") {
    sanitized.message = sanitizeString(sanitized.message)
  }
  if (sanitized.data) {
    sanitized.data = sanitizeRecord(sanitized.data)
  }
  return sanitized
}

function sanitizeSpan(span: SpanJSON): SpanJSON {
  const safeSpan = { ...span }
  if (typeof safeSpan.description === "string") {
    safeSpan.description = sanitizeString(safeSpan.description)
  }
  if (safeSpan.data) {
    safeSpan.data = sanitizeRecord(safeSpan.data) as SpanJSON["data"]
  }
  if (safeSpan.links) {
    safeSpan.links = safeSpan.links.map((link) => ({
      ...link,
      attributes: link.attributes
        ? (sanitizeRecord(link.attributes) as typeof link.attributes)
        : link.attributes,
    }))
  }
  return safeSpan
}

export function sanitizeEvent(event: Event): Event {
  const sanitized: Event = {
    ...event,
    user: undefined,
    request: sanitizeRequest(event.request),
    breadcrumbs: event.breadcrumbs
      ?.map((breadcrumb) => sanitizeBreadcrumb(breadcrumb))
      .filter((breadcrumb): breadcrumb is Breadcrumb => Boolean(breadcrumb)),
    tags: sanitizeRecord(event.tags) as Event["tags"],
    extra: sanitizeRecord(event.extra),
    contexts: sanitizeRecord(event.contexts) as Event["contexts"],
    spans: event.spans?.map(sanitizeSpan),
    transaction:
      typeof event.transaction === "string"
        ? sanitizeRoute(event.transaction)
        : event.transaction,
  }

  delete sanitized.logentry
  if (typeof sanitized.message === "string") {
    sanitized.message = sanitizeString(sanitized.message)
  }
  if (sanitized.exception?.values) {
    sanitized.exception = {
      ...sanitized.exception,
      values: sanitized.exception.values.map((exception) => ({
        ...exception,
        value:
          typeof exception.value === "string"
            ? sanitizeString(exception.value)
            : exception.value,
        stacktrace: sanitizeStacktrace(exception.stacktrace) as typeof exception.stacktrace,
      })),
    }
  }
  return sanitized
}

export function beforeSend(event: ErrorEvent, hint?: EventHint): ErrorEvent | null {
  const error: any = hint?.originalException
  const message = (typeof error === "string" ? error : error?.message) || event?.message || ""
  const code = error?.code || ""
  const name = error?.name || ""

  if (
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "ECANCELED" ||
    code === "ERR_STREAM_PREMATURE_CLOSE" ||
    code === "UND_ERR_ABORTED" ||
    message === "aborted" ||
    message.includes("aborted") ||
    message.includes("ECONNRESET") ||
    message.includes("socket hang up") ||
    message.includes("The user aborted a request") ||
    message.includes("Connection closed") ||
    name === "AbortError"
  ) {
    return null
  }

  return sanitizeEvent(event) as ErrorEvent
}

export function beforeSendTransaction(
  event: TransactionEvent,
  _hint: EventHint,
): TransactionEvent | null {
  return sanitizeEvent(event) as TransactionEvent
}

export function beforeSendSpan(span: SpanJSON): SpanJSON {
  return sanitizeSpan(span)
}
