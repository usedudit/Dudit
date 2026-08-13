import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm } from "../filters"
import { fetchAllPages } from "../paginate"
import {
  mapReturnRow,
  RETURN_EXPORT_ALL_COLUMNS,
  RETURN_EXPORT_COLUMNS,
} from "../mappers"
import type { ReturnsExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const RETURN_SELECT = `
  id, created_at, customer_name_snapshot, order_number_snapshot,
  request_type, desired_resolution, status, refund_amount, store_credit_amount,
  customer_reason, reason
`

const RETURN_SELECT_ALL = `
  id, created_at, customer_name_snapshot, customer_email_snapshot,
  seller_name_snapshot, order_number_snapshot, order_total_snapshot,
  request_type, desired_resolution, status, refund_amount, store_credit_amount,
  exchange_shortfall_amount, customer_reason, reason, customer_message,
  seller_notes, internal_notes, resolved_at, rejected_at, expires_at
`

export async function fetchReturnsExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: ReturnsExportFilters,
): Promise<import("../types").ExportResult> {
  const search = sanitizeSearchTerm(filters.search)
  const includeAllColumns = filters.includeAllColumns === true
  const select = includeAllColumns ? RETURN_SELECT_ALL : RETURN_SELECT

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any)
        .from("return_requests")
        .select(select)
        .eq("partner_id", partnerId)

      if (filters.storeId) {
        query = query.eq("store_id", filters.storeId)
      }

      if (filters.selectedIds?.length) {
        query = query.in("id", filters.selectedIds)
      }

      const statuses = (filters.status || []).filter(Boolean)
      if (statuses.length > 0) query = query.in("status", statuses)

      if (filters.activeTab && filters.activeTab !== "Todos") {
        const tabMap: Record<string, string[]> = {
          Pendentes: ["PENDING_REVIEW"],
          Analise: ["UNDER_ANALYSIS"],
          Aprovados: ["APPROVED"],
          Finalizados: ["RESOLVED"],
        }
        const tabStatuses = tabMap[filters.activeTab]
        if (tabStatuses?.length) query = query.in("status", tabStatuses)
      }

      if (search) {
        query = query.or(
          `customer_name_snapshot.ilike.%${search}%,order_number_snapshot.ilike.%${search}%`,
        )
      }

      if (cursor?.createdAt && cursor?.id) {
        query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(EXPORT_CHUNK_SIZE)

      if (error) throw error
      const rows = data || []
      const last = rows[rows.length - 1]
      return {
        rows,
        nextCursor: last ? { createdAt: String(last.created_at), id: String(last.id) } : null,
      }
    },
  })

  const rows = rawRows.map((r) => mapReturnRow(r, includeAllColumns))
  const columns = includeAllColumns ? RETURN_EXPORT_ALL_COLUMNS : RETURN_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}
