import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm } from "../filters"
import { buildKeysetOrFilter, fetchAllPages } from "../paginate"
import {
  mapServiceRow,
  SERVICE_EXPORT_ALL_COLUMNS,
  SERVICE_EXPORT_COLUMNS,
} from "../mappers"
import type { ServicesExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const SERVICE_SELECT =
  "id, name, category_id, price, is_active, sku, duration_minutes, created_at, service_categories!category_id(name)"

const SERVICE_SELECT_ALL = `
  id, name, description, category_id, subcategory_id, price, cost_price, is_active, sku,
  duration_minutes, service_type, unit, price_type, billing_unit,
  brand, buffer_minutes, notes, created_at,
  service_categories!category_id(name),
  subcategory:service_categories!subcategory_id(name)
`

export async function fetchServicesExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: ServicesExportFilters,
): Promise<import("../types").ExportResult> {
  const categoryNames = (filters.categories || []).filter(Boolean)
  let categoryIds: string[] = []

  if (categoryNames.length) {
    const { data: cats } = await supabase
      .from("service_categories")
      .select("id, name")
      .eq("partner_id", partnerId)
      .in("name", categoryNames)
    categoryIds = (cats || []).map((c) => c.id)
    if (!categoryIds.length) {
      return { columns: SERVICE_EXPORT_COLUMNS, rows: [], rowCount: 0 }
    }
  }

  const statusLabels = filters.status || []
  const search = sanitizeSearchTerm(filters.search)
  const includeAllColumns = filters.includeAllColumns === true
  const select = includeAllColumns ? SERVICE_SELECT_ALL : SERVICE_SELECT

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any).from("services").select(select).eq("partner_id", partnerId)

      if (filters.storeId) query = query.eq("store_id", filters.storeId)
      if (filters.selectedIds?.length) query = query.in("id", filters.selectedIds)

      if (filters.activeTab === "active") query = query.eq("status", "ativo")
      else if (filters.activeTab === "inactive") query = query.eq("status", "inativo")
      else if (statusLabels.length === 1) {
        query = query.eq("status", statusLabels[0] === "Ativo" ? "ativo" : "inativo")
      }

      if (categoryIds.length) query = query.in("category_id", categoryIds)

      if (search) {
        query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
      }

      const orFilter = buildKeysetOrFilter(cursor)
      if (orFilter) query = query.or(orFilter)

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

  const rows = rawRows.map((r) => mapServiceRow(r, includeAllColumns))
  const columns = includeAllColumns ? SERVICE_EXPORT_ALL_COLUMNS : SERVICE_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}
