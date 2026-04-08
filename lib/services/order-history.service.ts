import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"

export interface OrderHistoryEntry {
  id: number
  order_id: string
  partner_id: string
  actor_user_id: string | null
  entry_type: string
  change_lines: string[]
  created_at: string
}

export interface OrderHistoryEntryWithActor extends OrderHistoryEntry {
  actor_name: string
}

interface CreateOrderHistoryEntryInput {
  orderId: string
  partnerId: string
  actorUserId?: string | null
  entryType: string
  changeLines: string[]
}

export async function createOrderHistoryEntry(input: CreateOrderHistoryEntryInput) {
  const lines = input.changeLines
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return

  const supabase = getAdminClient()

  const { error } = await supabase.from("orders_history").insert({
    order_id: input.orderId,
    partner_id: input.partnerId,
    actor_user_id: input.actorUserId || null,
    entry_type: input.entryType,
    change_lines: lines,
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function getOrderHistoryEntries(orderId: string, partnerId: string, limit = 100): Promise<OrderHistoryEntryWithActor[]> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from("orders_history")
    .select("id, order_id, partner_id, actor_user_id, entry_type, change_lines, created_at")
    .eq("order_id", orderId)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit)

  if (error || !data?.length) {
    if (error) {
      console.error("[orders_history] fetch error:", error)
    }
    return []
  }

  const actorIds = Array.from(
    new Set(
      data
        .map((entry: OrderHistoryEntry) => entry.actor_user_id)
        .filter((value: string | null): value is string => Boolean(value))
    )
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
        ])
      )
    }
  }

  return data.map((entry: OrderHistoryEntry) => ({
    ...entry,
    actor_name: entry.actor_user_id ? (namesByUserId.get(entry.actor_user_id) || "Usuário") : "Sistema",
  }))
}
