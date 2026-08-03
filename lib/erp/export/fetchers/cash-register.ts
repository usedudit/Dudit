import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm, resolveExportDateBounds } from "../filters"
import { fetchAllPages } from "../paginate"
import { mapCashRegisterRow, CASH_REGISTER_EXPORT_COLUMNS } from "../mappers"
import type { CashRegisterExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const CASH_REGISTER_SELECT = `
  id, opened_at, closed_at, status, initial_amount, closing_amount,
  difference_amount, notes, opened_by_user_id
`

export async function fetchCashRegisterExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: CashRegisterExportFilters,
): Promise<import("../types").ExportResult> {
  const search = sanitizeSearchTerm(filters.search)

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query = supabase
        .from("cash_sessions")
        .select(CASH_REGISTER_SELECT)
        .eq("partner_id", partnerId)

      if (filters.storeId) {
        query = query.eq("store_id", filters.storeId)
      }

      if (filters.selectedIds?.length) {
        query = query.in("id", filters.selectedIds)
      }

      const statuses = (filters.status || []).filter(Boolean)
      if (statuses.length > 0) query = query.in("status", statuses)

      const { startIso, endIso } = resolveExportDateBounds(filters.datePeriod)
      if (startIso) query = query.gte("opened_at", startIso)
      if (endIso) query = query.lte("opened_at", endIso)

      if (search) {
        query = query.or(
          `notes.ilike.%${search}%`,
        )
      }

      if (cursor?.createdAt && cursor?.id) {
        query = query.or(`opened_at.lt.${cursor.createdAt},and(opened_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
      }

      const { data, error } = await query
        .order("opened_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(EXPORT_CHUNK_SIZE)

      if (error) throw error
      const rows = data || []
      const last = rows[rows.length - 1]
      return {
        rows,
        nextCursor: last ? { createdAt: String(last.opened_at), id: String(last.id) } : null,
      }
    },
  })

  const rows = rawRows.map(mapCashRegisterRow)
  return { columns: CASH_REGISTER_EXPORT_COLUMNS, rows, rowCount: rows.length }
}
