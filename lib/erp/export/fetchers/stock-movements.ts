import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm } from "../filters"
import { fetchAllPages } from "../paginate"
import { mapStockMovementRow, STOCK_MOVEMENT_EXPORT_COLUMNS } from "../mappers"
import type { StockMovementsExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const STOCK_MOVEMENT_SELECT = `
  id, created_at, movement_type, reason, reference_name,
  created_by,
  stock_movement_items(quantity, products(name, sku)),
  orders(order_number)
`

export async function fetchStockMovementsExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: StockMovementsExportFilters,
): Promise<import("../types").ExportResult> {
  const search = sanitizeSearchTerm(filters.search)
  const selectedIds = (filters.selectedIds || []).filter(Boolean)

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query = supabase
        .from("stock_movements")
        .select(STOCK_MOVEMENT_SELECT)
        .eq("partner_id", partnerId)

      if (selectedIds.length > 0) {
        query = query.in("id", selectedIds)
      }

      const types = (filters.movementType || []).filter(Boolean)
      if (types.length > 0) query = query.in("movement_type", types)

      if (filters.activeTab && filters.activeTab !== "all") {
        if (filters.activeTab === "in") query = query.eq("movement_type", "purchase")
        else if (filters.activeTab === "out") query = query.in("movement_type", ["sale", "damage", "loss", "return"])
      }

      if (search) {
        query = query.or(
          `reference_name.ilike.%${search}%,reason.ilike.%${search}%`,
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

  const rows = rawRows.map(mapStockMovementRow)
  return { columns: STOCK_MOVEMENT_EXPORT_COLUMNS, rows, rowCount: rows.length }
}
