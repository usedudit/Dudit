import "server-only"

import { cache } from "react"
import { unstable_cache } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { revalidateOrderHistory } from "@/lib/utils/revalidation"
import { TAGS } from "@/lib/utils/revalidation-tags"

const MAX_MERGED_ENTRIES = 50

export interface OrderHistoryEntry {
  id: number | string
  order_id: string
  partner_id: string
  actor_user_id: string | null
  entry_type: string
  change_lines: string[]
  metadata?: Record<string, any> | null
  created_at: string
}

export interface OrderHistoryEntryWithActor extends OrderHistoryEntry {
  actor_name: string
}



async function fetchOrderHistoryEntries(orderId: string, partnerId: string, limit: number): Promise<OrderHistoryEntryWithActor[]> {
  const supabase = getAdminClient()
  const cappedLimit = Math.min(Math.max(1, limit), MAX_MERGED_ENTRIES)

  // TODO: LEGACY MODE
  // This merge exists for backward compatibility.
  // Future step: migrate all legacy history into audit_logs and remove old tables.
  const [legacyResult, timelineResult] = await Promise.all([
    supabase
      .from("orders_history")
      .select("id, order_id, partner_id, actor_user_id, entry_type, change_lines, created_at")
      .eq("order_id", orderId)
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(cappedLimit),
    supabase
      .from("audit_logs")
      .select("id, partner_id, actor_user_id, action_type, change_lines, created_at, entity_id, metadata")
      .eq("partner_id", partnerId)
      .eq("entity_type", "order")
      .eq("entity_id", orderId)
      .order("created_at", { ascending: false })
      .limit(cappedLimit),
  ])

  if (legacyResult.error) {
    console.error("[orders_history] legacy fetch error:", legacyResult.error)
  }
  if (timelineResult.error) {
    console.error("[orders_history] timeline fetch error:", timelineResult.error)
  }

  // Normalize legacy entries
  const legacyEntries: OrderHistoryEntry[] = (legacyResult.data || []).map((entry: any) => ({
    id: entry.id,
    order_id: entry.order_id,
    partner_id: entry.partner_id,
    actor_user_id: entry.actor_user_id,
    entry_type: entry.entry_type,
    change_lines: entry.change_lines,
    created_at: entry.created_at,
  }))

  // Normalize timeline entries (from audit_logs)
  const timelineEntries: OrderHistoryEntry[] = (timelineResult.data || []).map((entry: any) => ({
    id: `tl-${entry.id}`,
    order_id: entry.entity_id,
    partner_id: entry.partner_id,
    actor_user_id: entry.actor_user_id,
    entry_type: entry.action_type,
    change_lines: entry.change_lines || [],
    metadata: entry.metadata,
    created_at: entry.created_at,
  }))

  // Merge, sort by created_at DESC in memory, cap at limit
  const merged = [...legacyEntries, ...timelineEntries]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, cappedLimit)

  if (merged.length === 0) return []

  // Resolve actor names
  const actorIds = Array.from(
    new Set(
      merged
        .map((entry) => entry.actor_user_id)
        .filter((value): value is string => Boolean(value)),
    ),
  )

  let namesByUserId = new Map<string, string>()

  if (actorIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", actorIds)

    if (profileError) {
      console.error("[orders_history] profile fetch error:", profileError)
    } else {
      namesByUserId = new Map(
        (profiles || []).map((profile: { user_id: string; full_name: string | null }) => [
          profile.user_id,
          profile.full_name?.trim() || "Usuário",
        ]),
      )
    }
  }

  return merged.map((entry) => ({
    ...entry,
    actor_name: entry.actor_user_id ? (namesByUserId.get(entry.actor_user_id) || "Usuário") : "Sistema",
  }))
}

export const getOrderHistoryEntries = cache(async (orderId: string, partnerId: string, limit = MAX_MERGED_ENTRIES): Promise<OrderHistoryEntryWithActor[]> => {
  return unstable_cache(
    async () => fetchOrderHistoryEntries(orderId, partnerId, limit),
    [TAGS.orderHistory(orderId), partnerId, String(limit)],
    {
      tags: [TAGS.orderHistory(orderId)],
    }
  )()
})
