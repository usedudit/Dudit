import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm, resolveExportDateBounds } from "../filters"
import { fetchAllPages } from "../paginate"
import { mapTransactionRow, TRANSACTION_EXPORT_COLUMNS } from "../mappers"
import type { TransactionsExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const TRANSACTION_SELECT = `
  id, description, category, amount, status, due_date, payment_date,
  payment_type, transaction_type, created_at,
  financial_categories!category_id(name),
  financial_accounts(name),
  payment_methods(name)
`

export async function fetchTransactionsExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: TransactionsExportFilters,
): Promise<import("../types").ExportResult> {
  const search = sanitizeSearchTerm(filters.search)
  const selectedIds = (filters.selectedIds || []).filter(Boolean)

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query = supabase
        .from("transactions")
        .select(TRANSACTION_SELECT)
        .eq("partner_id", partnerId)

      if (filters.storeId) {
        query = query.eq("store_id", filters.storeId)
      }

      if (selectedIds.length > 0) {
        query = query.in("id", selectedIds)
      }

      if (filters.activeTab && filters.activeTab !== "Transações") {
        const typeMap: Record<string, string[]> = {
          "A pagar": ["expense", "transfer"],
          "A receber": ["income"],
        }
        const types = typeMap[filters.activeTab]
        if (types?.length) query = query.in("transaction_type", types)
      }

      const statuses = (filters.status || []).filter(Boolean)
      if (statuses.length > 0) query = query.in("status", statuses)

      const categories = (filters.category || []).filter(Boolean)
      if (categories.length > 0) query = query.in("category", categories)

      const paymentTypes = (filters.paymentType || []).filter(Boolean)
      if (paymentTypes.length > 0) query = query.in("payment_type", paymentTypes)

      const { startIso, endIso } = resolveExportDateBounds(filters.datePeriod)
      if (startIso) query = query.gte("created_at", startIso)
      if (endIso) query = query.lte("created_at", endIso)

      if (search) {
        query = query.or(
          `description.ilike.%${search}%,category.ilike.%${search}%`,
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

  const rows = rawRows.map(mapTransactionRow)
  return { columns: TRANSACTION_EXPORT_COLUMNS, rows, rowCount: rows.length }
}
