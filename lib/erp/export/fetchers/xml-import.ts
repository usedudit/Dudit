import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm } from "../filters"
import { fetchAllPages } from "../paginate"
import { mapXmlImportRow, XML_IMPORT_EXPORT_COLUMNS } from "../mappers"
import type { XmlImportExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const XML_IMPORT_SELECT = `
  id, invoice_number, invoice_series, supplier_name, total_value,
  items_count, status, created_at, access_key
`

export async function fetchXmlImportExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: XmlImportExportFilters,
): Promise<import("../types").ExportResult> {
  const search = sanitizeSearchTerm(filters.search)
  const selectedIds = (filters.selectedIds || []).filter(Boolean)

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query = supabase
        .from("xml_imports")
        .select(XML_IMPORT_SELECT)
        .eq("partner_id", partnerId)

      if (filters.storeId) {
        query = query.eq("store_id", filters.storeId)
      }

      if (selectedIds.length > 0) {
        query = query.in("id", selectedIds)
      }

      const statuses = (filters.status || []).filter(Boolean)
      if (statuses.length > 0) query = query.in("status", statuses)

      if (filters.activeTab && filters.activeTab !== "all") {
        const tabMap: Record<string, string[]> = {
          pending: ["preview"],
          completed: ["completed"],
          failed: ["failed"],
        }
        const tabStatuses = tabMap[filters.activeTab]
        if (tabStatuses?.length) query = query.in("status", tabStatuses)
      }

      if (search) {
        query = query.or(
          `invoice_number.ilike.%${search}%,supplier_name.ilike.%${search}%,access_key.ilike.%${search}%`,
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

  const rows = rawRows.map(mapXmlImportRow)
  return { columns: XML_IMPORT_EXPORT_COLUMNS, rows, rowCount: rows.length }
}
