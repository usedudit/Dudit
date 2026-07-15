import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm } from "../filters"
import { fetchAllPages } from "../paginate"
import { mapSupplierRow, SUPPLIER_EXPORT_COLUMNS } from "../mappers"
import type { SuppliersExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const SUPPLIER_SELECT = `
  id, name, email, phone, cpf, cnpj, status, created_at
`

export async function fetchSuppliersExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: SuppliersExportFilters,
): Promise<import("../types").ExportResult> {
  const search = sanitizeSearchTerm(filters.search)
  const selectedIds = (filters.selectedIds || []).filter(Boolean)

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query = supabase
        .from("suppliers")
        .select(SUPPLIER_SELECT)
        .eq("partner_id", partnerId)

      if (selectedIds.length > 0) {
        query = query.in("id", selectedIds)
      }

      const statuses = (filters.status || []).filter(Boolean)
      if (statuses.length > 0) query = query.in("status", statuses)

      if (filters.activeTab && filters.activeTab !== "Todos") {
        const tabStatus = filters.activeTab === "Ativo" ? "ativo" : "inativo"
        query = query.eq("status", tabStatus)
      }

      if (search) {
        query = query.or(
          `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`,
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

  const rows = rawRows.map(mapSupplierRow)
  return { columns: SUPPLIER_EXPORT_COLUMNS, rows, rowCount: rows.length }
}
