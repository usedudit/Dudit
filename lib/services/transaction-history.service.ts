import "server-only"

import { cache } from "react"
import { unstable_cache } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { revalidateTransactionHistory } from "@/lib/utils/revalidation"
import { TAGS } from "@/lib/utils/revalidation-tags"

export interface TransactionHistoryEntry {
  id: number
  transaction_id: string
  partner_id: string
  actor_user_id: string | null
  entry_type: string
  change_lines: string[]
  created_at: string
}

export interface TransactionHistoryEntryWithActor extends TransactionHistoryEntry {
  actor_name: string
}

interface CreateTransactionHistoryEntryInput {
  transactionId: string
  partnerId: string
  actorUserId?: string | null
  entryType: string
  changeLines: string[]
}

export async function createTransactionHistoryEntry(input: CreateTransactionHistoryEntryInput) {
  const lines = input.changeLines
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return

  const supabase = getAdminClient()

  const { error } = await supabase.from("transactions_history").insert({
    transaction_id: input.transactionId,
    partner_id: input.partnerId,
    actor_user_id: input.actorUserId || null,
    entry_type: input.entryType,
    change_lines: lines,
  })

  if (error) {
    throw new Error(error.message)
  }

  await revalidateTransactionHistory(input.transactionId)
}

async function fetchTransactionHistoryEntries(
  transactionId: string,
  partnerId: string,
  limit: number,
): Promise<TransactionHistoryEntryWithActor[]> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from("transactions_history")
    .select("id, transaction_id, partner_id, actor_user_id, entry_type, change_lines, created_at")
    .eq("transaction_id", transactionId)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit)

  if (error || !data?.length) {
    if (error) {
      console.error("[transactions_history] fetch error:", error)
    }
    return []
  }

  const actorIds = Array.from(
    new Set(
      data
        .map((entry: TransactionHistoryEntry) => entry.actor_user_id)
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
      console.error("[transactions_history] profile fetch error:", profileError)
    } else {
      namesByUserId = new Map(
        (profiles || []).map((profile: { user_id: string; full_name: string | null }) => [
          profile.user_id,
          profile.full_name?.trim() || "Usuário",
        ]),
      )
    }
  }

  return data.map((entry: TransactionHistoryEntry) => ({
    ...entry,
    actor_name: entry.actor_user_id ? (namesByUserId.get(entry.actor_user_id) || "Usuário") : "Sistema",
  }))
}

export const getTransactionHistoryEntries = cache(
  async (transactionId: string, partnerId: string, limit = 100): Promise<TransactionHistoryEntryWithActor[]> => {
    return unstable_cache(
      async () => fetchTransactionHistoryEntries(transactionId, partnerId, limit),
      [TAGS.transactionHistory(transactionId), partnerId, String(limit)],
      {
        tags: [TAGS.transactionHistory(transactionId)],
      },
    )()
  },
)
