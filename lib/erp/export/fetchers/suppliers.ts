import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm } from "../filters"
import { fetchAllPages } from "../paginate"
import {
  mapSupplierRow,
  SUPPLIER_EXPORT_ALL_COLUMNS,
  SUPPLIER_EXPORT_COLUMNS,
} from "../mappers"
import type { SuppliersExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const SUPPLIER_SELECT = `
  id, name, email, phone, cpf, cnpj, status, created_at
`

const SUPPLIER_SELECT_ALL = `
  id, name, email, phone, cpf, cnpj, status, supplier_code, person_type,
  nome_fantasia, inscricao_estadual, crt, country, zip_code,
  street, number, complement, neighborhood, city, state, notes, address, created_at
`

export async function fetchSuppliersExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: SuppliersExportFilters,
): Promise<import("../types").ExportResult> {
  const search = sanitizeSearchTerm(filters.search)
  const selectedIds = (filters.selectedIds || []).filter(Boolean)
  const includeAllColumns = filters.includeAllColumns === true
  const select = includeAllColumns ? SUPPLIER_SELECT_ALL : SUPPLIER_SELECT

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any)
        .from("suppliers")
        .select(select)
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

  const rows = rawRows.map((r) => mapSupplierRow(r, includeAllColumns))
  const columns = includeAllColumns ? SUPPLIER_EXPORT_ALL_COLUMNS : SUPPLIER_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}
