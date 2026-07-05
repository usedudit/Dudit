import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm, resolveExportDateBounds } from "../filters"
import { buildKeysetOrFilter, fetchAllPages } from "../paginate"
import { mapQuoteRow, QUOTE_EXPORT_COLUMNS } from "../mappers"
import type { QuotesExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const QUOTE_SELECT = `
  id,
  quote_number,
  status,
  issue_date,
  expiration_date,
  subtotal,
  discount_value,
  shipping_cost,
  additional_costs,
  total,
  customer_id,
  user_id,
  created_by_user_id,
  created_at,
  customers (id, name, email),
  items_count:quote_items(count)
`

const STATUS_LABEL_TO_DB: Record<string, string> = {
  "Rascunho": "draft",
  "Enviado": "sent",
  "Pendente do Cliente": "pending_client",
  "Visualizado": "viewed",
  "Aprovado": "approved",
  "Rejeitado": "rejected",
  "Expirado": "expired",
  "Cancelado": "cancelled",
  "Convertido em Pedido": "converted_to_order",
}

export async function fetchQuotesExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: QuotesExportFilters,
): Promise<import("../types").ExportResult> {
  const search = sanitizeSearchTerm(filters.search).toLowerCase()
  const { startIso, endIso } = resolveExportDateBounds(filters.datePeriod)

  const dbStatuses = (filters.status || [])
    .map(label => STATUS_LABEL_TO_DB[label])
    .filter(Boolean)

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query = supabase
        .from("quotes")
        .select(QUOTE_SELECT)
        .eq("partner_id", partnerId)

      if (dbStatuses.length > 0) {
        query = query.in("status", dbStatuses)
      }

      if (filters.activeTab && filters.activeTab !== "Todos") {
        const tabMap: Record<string, string[]> = {
          Enviados: ["sent", "pending_client", "viewed"],
          Aprovados: ["approved"],
          Rejeitados: ["rejected"],
          Expirados: ["expired"],
        }
        const tabStatuses = tabMap[filters.activeTab]
        if (tabStatuses?.length) {
          query = query.in("status", tabStatuses)
        }
      }

      if (startIso) query = query.gte("created_at", startIso)
      if (endIso) query = query.lte("created_at", endIso)

      const orFilter = buildKeysetOrFilter(cursor)
      if (orFilter) query = query.or(orFilter)

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(EXPORT_CHUNK_SIZE)

      if (error) throw error

      const rows = data || []
      const creatorIds = Array.from(
        new Set(rows.map((row: any) => row.user_id || row.created_by_user_id).filter(Boolean))
      ) as string[]
      
      const creatorNameById = new Map<string, string>()
      if (creatorIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("user_profiles")
          .select("user_id, full_name")
          .in("user_id", creatorIds)

        for (const p of profileRows || []) {
          creatorNameById.set(String((p as any).user_id), String((p as any).full_name || "Sistema"))
        }
      }

      const rowsWithCreator = rows.map((row: any) => ({
        ...row,
        user_profiles: (row.user_id || row.created_by_user_id)
          ? { full_name: creatorNameById.get(String(row.user_id || row.created_by_user_id)) || "Sistema" }
          : null,
        items_count: Number(row.items_count?.[0]?.count ?? row.items_count ?? 0)
      }))

      const last = rowsWithCreator[rowsWithCreator.length - 1]
      return {
        rows: rowsWithCreator,
        nextCursor: last ? { createdAt: String(last.created_at), id: String(last.id) } : null,
      }
    },
  })

  // Filter in-memory by search term
  const filteredRows = rawRows.filter((row: any) => {
    if (!search) return true
    
    const displayId = String(row.quote_number || "").toLowerCase()
    const customerName = String(row.customers?.name || "").toLowerCase()
    const customerId = String(row.customer_id || "").toLowerCase()

    return displayId.includes(search) || customerName.includes(search) || customerId.includes(search)
  })

  const rows = filteredRows.map(mapQuoteRow)
  return { columns: QUOTE_EXPORT_COLUMNS, rows, rowCount: rows.length }
}
