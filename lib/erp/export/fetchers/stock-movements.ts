import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm } from "../filters"
import { fetchAllPages } from "../paginate"
import {
  mapStockMovementRow,
  STOCK_MOVEMENT_EXPORT_ALL_COLUMNS,
  STOCK_MOVEMENT_EXPORT_COLUMNS,
} from "../mappers"
import type { StockMovementsExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const STOCK_MOVEMENT_SELECT = `
  id, created_at, movement_type, reason, reference_name,
  created_by,
  stock_movement_items(quantity, products(name, sku)),
  orders(order_number)
`

const STOCK_MOVEMENT_SELECT_ALL = `
  id, created_at, movement_type, reason, reference_name, reference_type,
  notes, created_by,
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
  const includeAllColumns = filters.includeAllColumns === true
  const select = includeAllColumns ? STOCK_MOVEMENT_SELECT_ALL : STOCK_MOVEMENT_SELECT

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any)
        .from("stock_movements")
        .select(select)
        .eq("partner_id", partnerId)

      if (filters.storeId) {
        query = query.eq("store_id", filters.storeId)
      }

      if (selectedIds.length > 0) {
        query = query.in("id", selectedIds)
      }

      const types = (filters.movementType || []).filter(Boolean)
      if (types.length > 0) query = query.in("movement_type", types)

      if (filters.activeTab && filters.activeTab !== "all") {
        if (filters.activeTab === "in") query = query.in("movement_type", ["in", "purchase"])
        else if (filters.activeTab === "out") query = query.in("movement_type", ["out", "sale", "damage", "loss", "return"])
        else if (filters.activeTab === "adjustment") query = query.eq("movement_type", "adjustment")
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

  const rows = rawRows.map((r) => mapStockMovementRow(r, includeAllColumns))
  const columns = includeAllColumns ? STOCK_MOVEMENT_EXPORT_ALL_COLUMNS : STOCK_MOVEMENT_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}
