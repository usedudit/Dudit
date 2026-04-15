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

export interface TimelineEntry {
  id: string
  partner_id: string
  actor_user_id: string | null
  entity_type: string
  entity_id: string | null
  action_type: ActionType | string
  change_lines: string[]
  metadata: Record<string, unknown> | null
  source: "user" | "system" | "webhook" | "manual"
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

const DEFAULT_ACTION_MESSAGES: Record<string, string> = {
  created: "criou o registro.",
  updated: "atualizou informações.",
  paid: "marcou como pago.",
  received: "marcou como recebido.",
  cancelled: "cancelou.",
  refunded: "realizou reembolso.",
  settled: "quitou valores pendentes.",
  opened: "abriu.",
  closed: "fechou.",
  movement: "registrou movimentação.",
  default: "realizou uma ação."
}

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
  source?: "system" | "webhook" | "manual"
}

function sanitizeChangeLines(lines: string[]): string[] {
  return lines
    .map(l => String(l).trim())
    .filter(Boolean)
    .slice(0, 10) // Limit to 10 lines
}

/**
 * Write a structured timeline event to `audit_logs`.
 *
 * Fire-and-forget safe: never throws. Errors are logged to console.
 */
export async function logAuditEvent(input: LogAuditEventInput): Promise<void> {
  try {
    const supabase = getAdminClient()

    // Normalize actionType to snake_case (never allow dots)
    const actionType = String(input.actionType || "unknown")
      .toLowerCase()
      .replace(/\./g, "_")
      .replace(/[^a-z0-9_]/g, "")

    const changeLines = sanitizeChangeLines(input.changeLines || [])

    // Empty or spam guards
    if (changeLines.length === 0) return
    if (changeLines.every(l => l === "nenhuma alteração relevante.")) return

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

    const { error } = await supabase.from("audit_logs").insert({
      partner_id: input.partnerId || null,
      actor_user_id: input.actorUserId || null,
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
      action_type: actionType,
      change_lines: changeLines,
      metadata: safeMetadata,
      source: input.source || "system",
      // Also write to legacy user_id column for backward compat
      user_id: input.actorUserId || null,
    })

    if (error) {
      console.error("[timeline] Failed to write audit event:", {
        actionType,
        entityType: input.entityType,
        error: error.message,
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

export function formatTimelineEntry(entry: UserTimelineEntry | AdminTimelineEntry) {
  const formattedLines = entry.change_lines.map(line => {
    let fmt = String(line).trim()
    fmt = replaceTechnicalTerms(fmt)
    fmt = capitalizeFirst(fmt)
    if (!fmt.endsWith(".") && !fmt.endsWith("!") && !fmt.endsWith("?")) {
      fmt += "."
    }
    return fmt
  })

  // Format date correctly in pt-BR
  let formattedDate = entry.created_at
  try {
    formattedDate = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(entry.created_at))
  } catch (e) {}

  return {
    ...entry,
    change_lines: formattedLines,
    formatted_date: formattedDate,
  }
}
