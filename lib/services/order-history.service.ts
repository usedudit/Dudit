import "server-only"

import { cache } from "react"
import { unstable_cache } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { revalidateOrderHistory } from "@/lib/utils/revalidation"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { formatCurrency } from "@/lib/utils/formatters"

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

  // Busca a timeline e as devoluções do pedido em paralelo: são independentes
  // e antes eram dois roundtrips sequenciais na abertura da aba Histórico.
  const [timelineRes, returnRequestsRes] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("id, partner_id, actor_user_id, action_type, change_lines, created_at, entity_id, metadata")
      .eq("partner_id", partnerId)
      .eq("entity_type", "order")
      .eq("entity_id", orderId)
      .order("created_at", { ascending: false })
      .limit(cappedLimit),
    supabase
      .from("return_requests")
      .select("id, seller_notes")
      .eq("partner_id", partnerId)
      .eq("order_id", orderId)
      .is("deleted_at", null),
  ])

  const timelineResult = timelineRes.data
  if (timelineRes.error) {
    console.error("[orders_history] timeline fetch error:", timelineRes.error)
  }

  const returnRequests = returnRequestsRes.data || []
  // A presença de observações do lojista é usada para complementar as linhas
  // de devolução, sem precisar de outra consulta.
  const hasSellerNotes = returnRequests.some(
    (rr: any) => rr.seller_notes && String(rr.seller_notes).trim().length > 0,
  )

  const returnRequestIdsList = returnRequests.map((rr: any) => rr.id)
  let returnTimelineResult: any[] = []
  if (returnRequestIdsList.length > 0) {
    const { data: rtData, error: rtError } = await supabase
      .from("audit_logs")
      .select("id, partner_id, actor_user_id, action_type, change_lines, created_at, entity_id, metadata")
      .eq("partner_id", partnerId)
      .eq("entity_type", "return_request")
      .in("entity_id", returnRequestIdsList)
      .order("created_at", { ascending: false })
      .limit(cappedLimit)
    if (rtError) {
      console.error("[orders_history] return timeline fetch error:", rtError)
    }
    returnTimelineResult = rtData || []
  }

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

  const returnTimelineEntries: OrderHistoryEntry[] = returnTimelineResult.map((entry: any) => ({
    id: `ret-${entry.id}`,
    order_id: entry.entity_id,
    partner_id: entry.partner_id,
    actor_user_id: entry.actor_user_id,
    entry_type: `return_${entry.action_type}`,
    change_lines: entry.change_lines || [],
    metadata: entry.metadata,
    created_at: entry.created_at,
  }))

  const merged = [...timelineEntries, ...returnTimelineEntries]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, cappedLimit)

  if (merged.length === 0) return []

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

  return merged.map((entry) => {
    let actorName = entry.actor_user_id ? (namesByUserId.get(entry.actor_user_id) || "Usuário") : "Sistema"
    let changeLines = [...entry.change_lines]

    const isDuditAction = Boolean(
      entry.metadata?.dudit_action ||
      (entry.metadata as any)?.is_admin_action ||
      (entry as any).actor_name === "Equipe Dudit"
    )

    if (isDuditAction) {
      actorName = "Equipe Dudit"
    }

    // Rewrite return created events for ERP view
    if (entry.entry_type === "return_created") {
      actorName = "Solicitação de devolução"
      changeLines = changeLines.map(line => 
        line === "Solicitação criada" ? "Solicitação de devolução criada pelo cliente" : line
      )
    }

    // Format deposit events for human readability in ERP & Marketplace
    if (entry.entry_type === "deposit_cancelled") {
      actorName = "Sinal cancelado"
      changeLines = changeLines.map(line =>
        line.startsWith("cancelou") ? "O sinal do pedido foi cancelado pelo vendedor." : line
      )
    } else if (entry.entry_type === "deposit_created") {
      actorName = "Cobrança de sinal gerada"
      changeLines = changeLines.map(line =>
        line.startsWith("gerou") ? "Nova cobrança de sinal gerada via Mercado Pago." : line
      )
    } else if (entry.entry_type === "deposit_paid") {
      actorName = "Sinal pago"
      changeLines = changeLines.map(line =>
        line.startsWith("confirmou") ? "Recebimento do sinal confirmado." : line
      )
    } else if (entry.entry_type === "deposit_expired") {
      actorName = "Sinal expirado"
      changeLines = changeLines.map(line =>
        line.startsWith("expirou") ? "O prazo para pagamento do sinal expirou." : line
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

    // Enrich return events with financial details from metadata
    if (entry.entry_type && entry.entry_type.startsWith("return_") && entry.metadata) {
      const md = entry.metadata
      if (Number(md.refund_amount || 0) > 0) {
        changeLines.push(`Valor do reembolso: ${formatCurrency(Number(md.refund_amount))}`)
      }
      if (Number(md.store_credit_amount || 0) > 0) {
        changeLines.push(`Vale-compra gerado: ${formatCurrency(Number(md.store_credit_amount))}`)
      }
      if (md.refund_payment_method) {
        changeLines.push(`Método de reembolso: ${md.refund_payment_method}`)
      }
      if (md.exchange_order_id) {
        changeLines.push(`Pedido de troca criado: #${String(md.exchange_order_id).slice(0, 8).toUpperCase()}`)
      }
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
