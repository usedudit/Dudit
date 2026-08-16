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

  const { data: timelineResult, error: timelineError } = await supabase
    .from("audit_logs")
    .select("id, partner_id, actor_user_id, action_type, change_lines, created_at, entity_id, metadata")
    .eq("partner_id", partnerId)
    .eq("entity_type", "order")
    .eq("entity_id", orderId)
    .order("created_at", { ascending: false })
    .limit(cappedLimit)

  if (timelineError) {
    console.error("[orders_history] timeline fetch error:", timelineError)
  }

  // Normalize timeline entries (from audit_logs)
  const timelineEntries: OrderHistoryEntry[] = (timelineResult || []).map((entry: any) => ({
    id: `tl-${entry.id}`,
    order_id: entry.entity_id,
    partner_id: entry.partner_id,
    actor_user_id: entry.actor_user_id,
    entry_type: entry.action_type,
    change_lines: entry.change_lines || [],
    metadata: entry.metadata,
    created_at: entry.created_at,
  }))

  // Sort by created_at DESC in memory, cap at limit
  const merged = [...timelineEntries]
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

  // Fetch return requests seller notes to detect if seller notes exist for this order
  let hasSellerNotes = false
  try {
    const { data: returnRequests } = await supabase
      .from("return_requests")
      .select("seller_notes")
      .eq("order_id", orderId)
      .is("deleted_at", null)
    hasSellerNotes = (returnRequests || []).some((rr: any) => rr.seller_notes && rr.seller_notes.trim().length > 0)
  } catch (err) {
    console.error("[orders_history] return requests notes fetch error:", err)
  }

  return merged.map((entry) => {
    let actorName = entry.actor_user_id ? (namesByUserId.get(entry.actor_user_id) || "Usuário") : "Sistema"
    let changeLines = [...entry.change_lines]

    // Rewrite return created events for ERP view
    if (entry.entry_type === "return_created") {
      actorName = "Solicitação de devolução"
      changeLines = changeLines.map(line => 
        line === "Solicitação criada" ? "Solicitação de devolução criada pelo cliente" : line
      )
    }

    // Rewrite return status changes for ERP view
    if (entry.entry_type && entry.entry_type.startsWith("return_") && entry.entry_type !== "return_created") {
      changeLines = changeLines.map(line => {
        if (line.startsWith("Solicitação atualizada:")) {
          let newLine = line.replace("Solicitação atualizada:", "Solicitação de devolução atualizada:")
          if (hasSellerNotes) {
            newLine = newLine.trim().replace(/\.$/, "") + ". Observações adicionadas."
          }
          return newLine
        }
        return line
      })
    }

    return {
      ...entry,
      actor_name: actorName,
      change_lines: changeLines,
    }
  })
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
