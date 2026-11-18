import * as Sentry from "@sentry/nextjs"
import { sanitizeMonitoringData } from "@/lib/sentry/sanitize"

export type MonitoringContext = {
  module: string
  action?: string
  provider?: string
  route?: string
  userId?: string | null
  partnerId?: string | null
  storeId?: string | null
  entityId?: string | null
  errorCode?: string | null
  metadata?: Record<string, unknown> | null
}

type BreadcrumbContext = {
  domain: "checkout" | "payment" | "stock" | "returns" | "orders" | "integrations"
  message: string
  metadata?: Record<string, unknown> | null
}

const MAX_TAG_LENGTH = 80

function safeTag(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const normalized = String(value).trim()
  if (!normalized || normalized.length > MAX_TAG_LENGTH) return undefined
  return normalized
}

/**
 * Keeps correlation useful without sending a complete identifier. UUIDs and
 * opaque IDs are reduced to a short non-sensitive reference; arbitrary text
 * is rejected so a customer name or email cannot become a tag by accident.
 */
function safeReference(value: unknown): string | undefined {
  const normalized = safeTag(value)
  if (!normalized || !/^[a-zA-Z0-9_-]+$/.test(normalized)) return undefined
  return normalized.length <= 12
    ? normalized
    : `${normalized.slice(0, 8)}…${normalized.slice(-3)}`
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error
  if (typeof error === "string") return new Error(error)
  return new Error("Non-Error exception captured by application monitoring")
}

function applyContext(scope: Sentry.Scope, context: MonitoringContext) {
  const module = safeTag(context.module)
  const action = safeTag(context.action)
  const provider = safeTag(context.provider)
  const route = safeTag(context.route)
  const errorCode = safeTag(context.errorCode)

  if (module) scope.setTag("monitoring.module", module)
  if (action) scope.setTag("monitoring.action", action)
  if (provider) scope.setTag("monitoring.provider", provider)
  if (route) scope.setTag("monitoring.route", route)
  if (errorCode) scope.setTag("monitoring.error_code", errorCode)

  const monitoringContext = sanitizeMonitoringData({
    ...context.metadata,
    // Use opaque references instead of raw PII-bearing identifiers.
    actor_ref: safeReference(context.userId),
    partner_ref: safeReference(context.partnerId),
    store_ref: safeReference(context.storeId),
    entity_ref: safeReference(context.entityId),
  })

  if (monitoringContext && typeof monitoringContext === "object") {
    scope.setContext("monitoring", monitoringContext as Record<string, unknown>)
  }
}

/** Captures an unexpected or important handled exception in one place. */
export function captureError(error: unknown, context: MonitoringContext): string | undefined {
  const normalizedError = normalizeError(error)
  let eventId: string | undefined

  Sentry.withScope((scope) => {
    applyContext(scope, context)
    eventId = Sentry.captureException(normalizedError)
  })

  return eventId
}

/** Adds a safe breadcrumb for a critical business flow. */
export function addMonitoringBreadcrumb({ domain, message, metadata }: BreadcrumbContext): void {
  Sentry.addBreadcrumb({
    category: "dudit.flow",
    message: `${domain}.${message}`.slice(0, 160),
    level: "info",
    data: sanitizeMonitoringData(metadata || {}) as Record<string, unknown>,
  })
}

export async function flushMonitoring(timeout = 2000): Promise<boolean> {
  return Sentry.flush(timeout)
}
