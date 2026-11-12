import "server-only"

import { cache } from "react"
import { unstable_cache } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { TAGS } from "@/lib/utils/revalidation-tags"

// ─── Types ──────────────────────────────────────────────────────────────────

export type ActionType =
  | "created" | "updated" | "deleted" | "paid" | "received" | "cancelled"
  | "refunded" | "installment_paid" | "settled" | "recurring_created"
  | "recurring_updated" | "recurring_cancelled" | "cash_opened"
  | "cash_closed" | "cash_movement" | "sale_created"
  | "withdrawal_created" | "deposit_created" | "movement_reversed"
  | "signed" | "approved"

export interface TimelineEntry {
  id: string
  partner_id: string
  actor_user_id: string | null
  entity_type: string
  entity_id: string | null
  action_type: ActionType | string
  change_lines: string[]
  metadata: Record<string, unknown> | null
  source: "user" | "system" | "webhook" | "manual" | "marketplace"
  created_at: string
}

export interface AdminTimelineEntry extends TimelineEntry {
  actor_name: string
}

export interface UserTimelineEntry {
  entity_type: string
  action_type: ActionType | string
  change_lines: string[]
  created_at: string
  actor_name: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TIMELINE_LIMIT = 30
const MAX_TIMELINE_LIMIT = 100

// ─── Write ──────────────────────────────────────────────────────────────────

interface LogAuditEventInput {
  partnerId: string
  actorUserId: string | null
  entityType: string
  entityId: string | null
  actionType: ActionType | string
  changeLines: string[]
  metadata?: Record<string, unknown> | null
  source?: "system" | "webhook" | "manual" | "marketplace" | "erp" | "user"
  storeId?: string | null
  storeName?: string | null
  actorName?: string | null
  actorEmail?: string | null
}

function sanitizeChangeLines(lines: string[]): string[] {
  return lines
    .map(l => String(l).trim())
    .filter(Boolean)
    .slice(0, 10) // Limit to 10 lines
}

function resolveStatusTransitionLine(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata) return null
  const oldStatus =
    metadata.oldStatus ??
    metadata.old_status ??
    metadata.previousStatus ??
    metadata.previous_status
  const newStatus =
    metadata.newStatus ??
    metadata.new_status ??
    metadata.nextStatus ??
    metadata.next_status

  const oldLabel = String(oldStatus || "").trim()
  const newLabel = String(newStatus || "").trim()
  if (!oldLabel || !newLabel) return null
  if (oldLabel === newLabel) return null
  return `alterou status: ${oldLabel} -> ${newLabel}`
}

function resolveDefaultLine(actionType: string): string {
  const normalized = String(actionType || "").toLowerCase().trim()
  if (normalized.includes("created")) return "criou registro."
  if (normalized.includes("updated")) return "atualizou informações."
  if (normalized.includes("deleted")) return "removeu registro."
  if (normalized.includes("cancel")) return "cancelou registro."
  if (normalized.includes("paid")) return "marcou como pago."
  if (normalized.includes("received")) return "marcou como recebido."
  return "ação registrada."
}

/**
 * Write a structured timeline event to `audit_logs`.
 *
 * Fire-and-forget safe: never throws. Errors are logged to console.
 */
export async function logAuditEvent(input: LogAuditEventInput): Promise<void> {
  try {
    // Normalize actionType to snake_case (never allow dots)
    const actionType = String(input.actionType || "unknown")
      .toLowerCase()
      .replace(/\./g, "_")
      .replace(/[^a-z0-9_]/g, "")

    const isCriticalPlatformAction =
      actionType.includes("subscription_") ||
      actionType.includes("billing_") ||
      actionType.includes("plan_") ||
      actionType.includes("upgrade") ||
      actionType.includes("downgrade") ||
      ["billing", "subscription", "admin"].includes(String(input.entityType || "").toLowerCase()) ||
      Boolean(input.metadata?.is_admin_action || input.metadata?.dudit_action || input.actorName?.includes("Dudit"))

    // Skip routine audit logging for partners on the Free plan
    if (input.partnerId && !isCriticalPlatformAction) {
      try {
        const { getPartnerPlan } = await import("@/lib/services/subscription.service")
        const { hasMinimumPlan } = await import("@/lib/subscription/plan-tier")
        const plan = await getPartnerPlan(input.partnerId)
        if (!hasMinimumPlan(plan?.slug || "free", "crescer")) {
          return // Free plan partners do not store routine activity logs
        }
      } catch (planErr) {
        console.warn("[timeline] Failed to resolve partner plan for audit log, proceeding:", planErr)
      }
    }

    // ─── Filter routine CRUD events (keep only important events) ───────────
    // Financial, security, billing, recurring events are always kept
    const entityType = String(input.entityType || "").toLowerCase()
    const isRoutineCrudEvent = isRoutineCrud(actionType, entityType, input.metadata || null)
    const isFinancialEvent = isFinancial(actionType)
    const isSecurityEvent = entityType === "security" || actionType.includes("invite_") || actionType.includes("auth_") || actionType.includes("role_") || actionType.includes("member_") || actionType.includes("partner_") || actionType.includes("document_") || actionType.includes("account_")
    const isBillingEvent = entityType === "billing" || actionType.includes("billing_")
    const isRecurringEvent = actionType.includes("recurring_")
    const isSubscriptionEvent = actionType.includes("subscription_")
    const isConversionEvent = actionType === "converted_to_order" || actionType === "quote_conversion"

    // Skip routine CRUD events (but keep important events)
    if (isRoutineCrudEvent && !isFinancialEvent && !isSecurityEvent && !isBillingEvent && !isRecurringEvent && !isSubscriptionEvent && !isConversionEvent) {
      return // Routine CRUD events are not stored to reduce DB bloat
    }

    const supabase = getAdminClient()

    let changeLines = sanitizeChangeLines(input.changeLines || [])
    if (changeLines.every((l) => l.toLowerCase() === "nenhuma alteração relevante.")) {
      changeLines = []
    }
    const statusTransitionLine = resolveStatusTransitionLine(input.metadata || null)
    if (statusTransitionLine && !changeLines.some((line) => line.toLowerCase().includes("status"))) {
      changeLines.unshift(statusTransitionLine)
    }
    if (changeLines.length === 0) {
      changeLines = [resolveDefaultLine(actionType)]
    }

    // Ensure metadata is flat and small
    let safeMetadata = input.metadata || null
    if (safeMetadata) {
      const keys = Object.keys(safeMetadata)
      if (keys.length > 15) {
        safeMetadata = null
      } else {
        const str = JSON.stringify(safeMetadata)
        if (str.length > 2048) {
          safeMetadata = null
        } else {
          // Check depth 2 max
          let depthValid = true
          for (const key of keys) {
            const val = safeMetadata[key]
            if (val && typeof val === 'object' && !Array.isArray(val)) {
              for (const innerKey of Object.keys(val as Record<string, unknown>)) {
                const innerVal = (val as Record<string, unknown>)[innerKey]
                if (innerVal && typeof innerVal === 'object') {
                  depthValid = false
                  break
                }
              }
            }
            if (!depthValid) break
          }
          if (!depthValid) safeMetadata = null
        }
      }
    }

    const legacyAction = actionType.toUpperCase()
    const nowIso = new Date().toISOString()

    const fullPayload: Record<string, unknown> = {
      action: legacyAction,
      old_values: null,
      new_values: {
        entity_type: input.entityType || null,
        entity_id: input.entityId || null,
        action_type: actionType,
        change_lines: changeLines,
        metadata: safeMetadata,
        source: input.source || "system",
        actor_user_id: input.actorUserId || null,
        created_at: nowIso,
      },
      user_id: input.actorUserId || null,
      partner_id: input.partnerId || null,
      actor_user_id: input.actorUserId || null,
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
      action_type: actionType,
      change_lines: changeLines,
      metadata: safeMetadata,
      source: input.source || "system",
      store_id: input.storeId || null,
      store_name: input.storeName || null,
      actor_name: input.actorName || null,
      actor_email: input.actorEmail || null,
    }

    let insertResult = await supabase.from("audit_logs").insert(fullPayload)

    // Backward/forward schema compatibility:
    // if some columns don't exist in this environment, retry after removing them.
    if (insertResult.error && /column .* does not exist/i.test(insertResult.error.message || "")) {
      const reducedPayload: Record<string, unknown> = { ...fullPayload }
      const columnMissingRegex = /column "([^"]+)" does not exist/i
      let message = String(insertResult.error.message || "")

      while (columnMissingRegex.test(message)) {
        const match = message.match(columnMissingRegex)
        const missingColumn = match?.[1]
        if (!missingColumn || !(missingColumn in reducedPayload)) break
        delete reducedPayload[missingColumn]
        insertResult = await supabase.from("audit_logs").insert(reducedPayload)
        if (!insertResult.error) break
        message = String(insertResult.error.message || "")
      }
    }

    if (insertResult.error) {
      console.error("[timeline] Failed to write audit event:", {
        actionType,
        entityType: input.entityType,
        error: insertResult.error.message,
      })
    }
  } catch (error) {
    // Timeline logging must NEVER break the primary action.
    console.error("[timeline] logAuditEvent error:", {
      actionType: input.actionType,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// ─── Read ───────────────────────────────────────────────────────────────────

async function fetchRawTimeline(
  entityType: string,
  entityId: string,
  partnerId: string,
  limit: number,
): Promise<AdminTimelineEntry[]> {
  const supabase = getAdminClient()
  const cappedLimit = Math.min(Math.max(1, limit), MAX_TIMELINE_LIMIT)

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, partner_id, actor_user_id, entity_type, entity_id, action_type, change_lines, metadata, source, created_at")
    .eq("partner_id", partnerId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(cappedLimit)

  if (error || !data?.length) {
    if (error) {
      console.error("[timeline] fetch error:", error)
    }
    return []
  }

  // Resolve actor names
  const actorIds = Array.from(
    new Set(
      data
        .map((entry: TimelineEntry) => entry.actor_user_id)
        .filter((value: string | null): value is string => Boolean(value)),
    ),
  )

  let namesByUserId = new Map<string, string>()

  if (actorIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", actorIds)

    if (profileError) {
      console.error("[timeline] profile fetch error:", profileError)
    } else {
      namesByUserId = new Map(
        (profiles || []).map((profile: { user_id: string; full_name: string | null }) => [
          profile.user_id,
          profile.full_name?.trim() || "Usuário",
        ]),
      )
    }
  }

  return data.map((entry: TimelineEntry) => ({
    ...entry,
    actor_name: entry.actor_user_id
      ? (namesByUserId.get(entry.actor_user_id) || "Usuário")
      : "Sistema",
  }))
}

export const getAdminTimeline = cache(
  async (
    entityType: string,
    entityId: string,
    partnerId: string,
    limit = DEFAULT_TIMELINE_LIMIT,
  ): Promise<AdminTimelineEntry[]> => {
    return unstable_cache(
      async () => fetchRawTimeline(entityType, entityId, partnerId, limit),
      [TAGS.entityTimeline(entityType, entityId), partnerId, String(limit), "admin"],
      {
        tags: [TAGS.entityTimeline(entityType, entityId)],
      },
    )()
  },
)

export const getUserTimeline = cache(
  async (
    entityType: string,
    entityId: string,
    partnerId: string,
    limit = DEFAULT_TIMELINE_LIMIT,
  ): Promise<UserTimelineEntry[]> => {
    return unstable_cache(
      async () => {
        const adminEntries = await fetchRawTimeline(entityType, entityId, partnerId, limit)
        return adminEntries.map(entry => ({
          entity_type: entry.entity_type,
          action_type: entry.action_type,
          change_lines: entry.change_lines,
          created_at: entry.created_at,
          actor_name: entry.actor_name,
        }))
      },
      [TAGS.entityTimeline(entityType, entityId), partnerId, String(limit), "user"],
      {
        tags: [TAGS.entityTimeline(entityType, entityId)],
      },
    )()
  },
)

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Check if an event is a routine CRUD operation that can be safely skipped.
 * These events generate noise without significant audit value.
 */
function isRoutineCrud(actionType: string, entityType: string, metadata?: Record<string, unknown> | null): boolean {
  // Admin interventions are never considered routine CRUD
  if (metadata?.is_admin_action || metadata?.dudit_action) {
    return false
  }

  // Entity types where routine CRUD is skipped
  const routineEntityTypes = new Set([
    "product", "service", "customer", "appointment",
    "order", "quote", "transaction", "service_order",
  ])

  // Action types that are always routine
  const routineActions = new Set([
    "created", "deleted", "restored", "duplicated",
    "attachment_created", "attachment_deleted",
    "services_added", "products_added", "assigned",
    "notification_sent",
    "whatsapp_message_sent", "whatsapp_appointment_confirmed", "whatsapp_appointment_cancelled",
  ])

  // If entity type is not in routine list, it's not routine
  if (!routineEntityTypes.has(entityType)) {
    return false
  }

  // Check if action type is routine
  if (routineActions.has(actionType)) {
    return true
  }

  // For 'updated' action, only keep financial/status-critical entities
  if (actionType === "updated") {
    const keepUpdatedEntities = new Set(["order", "quote", "transaction", "service_order", "appointment"])
    return !keepUpdatedEntities.has(entityType)
  }

  // For 'status_changed', keep only financial/status-critical entities
  if (actionType === "status_changed") {
    const keepStatusEntities = new Set(["order", "quote", "transaction", "service_order", "return_request", "appointment"])
    return !keepStatusEntities.has(entityType)
  }

  // For 'cancelled', keep financial cancellations
  if (actionType === "cancelled") {
    const keepCancelledEntities = new Set(["order", "quote", "transaction", "return_request", "service_order"])
    return !keepCancelledEntities.has(entityType)
  }

  return false
}

/**
 * Check if an event is a financial event that should always be kept.
 */
function isFinancial(actionType: string): boolean {
  const financialActions = new Set([
    "paid", "received", "refunded",
    "cash_opened", "cash_closed", "cash_movement", "movement_reversed",
    "installment_paid", "settled",
    "sale_created", "withdrawal_created", "deposit_created",
  ])
  return financialActions.has(actionType)
}

export function buildChangeLines(changes: {
  amount?: boolean
  category?: boolean
  paymentMethod?: boolean
  account?: boolean
  description?: boolean
}): string[] {
  const details = []

  if (changes.amount) details.push("valor")
  if (changes.category) details.push("categoria")
  if (changes.paymentMethod) details.push("meio de pagamento")
  if (changes.account) details.push("conta financeira")
  if (changes.description) details.push("descrição")

  if (details.length === 0) return []

  if (details.length === 1) {
    return [`alterou ${details[0]}.`]
  }

  const last = details.pop()
  return [`alterou ${details.join(", ")} e ${last}.`]
}

function capitalizeFirst(text: string) {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function replaceTechnicalTerms(text: string) {
  return text
    .replace(/\btransaction\b/g, "transação")
    .replace(/\border\b/g, "pedido")
}

export function formatTimelineEntry(entry: UserTimelineEntry | AdminTimelineEntry, tz?: string) {
  const formattedLines = entry.change_lines.map(line => {
    let fmt = String(line).trim()
    fmt = replaceTechnicalTerms(fmt)
    fmt = capitalizeFirst(fmt)
    if (!fmt.endsWith(".") && !fmt.endsWith("!") && !fmt.endsWith("?")) {
      fmt += "."
    }
    return fmt
  })

  // Format date correctly in pt-BR using the provided timezone
  let formattedDate = entry.created_at
  try {
    formattedDate = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: tz || "America/Sao_Paulo",
    }).format(new Date(entry.created_at))
  } catch (e) { }

  return {
    ...entry,
    change_lines: formattedLines,
    formatted_date: formattedDate,
  }
}
