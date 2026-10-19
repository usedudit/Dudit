import type { SupabaseClient } from "@supabase/supabase-js"
import {
  mapCustomerStatusToDb,
  resolveExportDateBounds,
  sanitizeSearchTerm,
} from "../filters"
import { buildKeysetOrFilter, fetchAllPages } from "../paginate"
import {
  applyCustomerStatusFilter,
  CUSTOMER_EXPORT_ALL_COLUMNS,
  CUSTOMER_EXPORT_COLUMNS,
  mapCustomerRow,
} from "../mappers"
import type { CustomersExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const CUSTOMER_SELECT =
  "id, name, email, phone, status, person_type, cpf, cnpj, created_at, addresses!customer_id(city, state)"

const CUSTOMER_SELECT_ALL =
  "id, name, email, phone, phone_fixed, birth_date, status, person_type, cpf, cnpj, inscricao_estadual, notes, created_at, addresses!customer_id(zip_code, street, number, complement, neighborhood, city, state)"

export async function fetchCustomersExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: CustomersExportFilters,
): Promise<import("../types").ExportResult> {
  const includeAllColumns = filters.includeAllColumns === true
  const select = includeAllColumns ? CUSTOMER_SELECT_ALL : CUSTOMER_SELECT
  const statusLabels = [...(filters.status || [])]
  if (filters.activeTab && filters.activeTab !== "Todos") {
    statusLabels.push(filters.activeTab)
  }

  const search = sanitizeSearchTerm(filters.search)
  const { startIso, endIso } = resolveExportDateBounds(filters.datePeriod, filters.timezone)

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any).from("customers").select(select).eq("partner_id", partnerId)

      const dbStatuses = [...new Set(statusLabels.map(mapCustomerStatusToDb))]
      if (dbStatuses.length === 1) query = query.eq("status", dbStatuses[0])
      else if (dbStatuses.length > 1) query = query.in("status", dbStatuses)

      if (startIso) query = query.gte("created_at", startIso)
      if (endIso) query = query.lte("created_at", endIso)

      if (search) {
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
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

  const { decryptCPF } = await import("@/lib/crypto")
  const filtered = rawRows.filter((row) => applyCustomerStatusFilter(row, statusLabels))
  for (const row of filtered) {
    if (row.cpf && String(row.cpf).startsWith("v")) {
      try { row.cpf = await decryptCPF(row.cpf) } catch { /* keep encrypted */ }
    }
  }
  const rows = filtered.map((r) => mapCustomerRow(r, includeAllColumns))
  const columns = includeAllColumns ? CUSTOMER_EXPORT_ALL_COLUMNS : CUSTOMER_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}
