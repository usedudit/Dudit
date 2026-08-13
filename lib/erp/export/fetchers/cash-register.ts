import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm, resolveExportDateBounds } from "../filters"
import { fetchAllPages } from "../paginate"
import {
  CASH_REGISTER_EXPORT_ALL_COLUMNS,
  CASH_REGISTER_EXPORT_COLUMNS,
  mapCashRegisterRow,
} from "../mappers"
import type { CashRegisterExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const CASH_REGISTER_SELECT = `
  id, opened_at, closed_at, status, initial_amount, closing_amount,
  difference_amount, notes, opened_by_user_id
`

const CASH_REGISTER_SELECT_ALL = `
  id, opened_at, closed_at, status, initial_amount, closing_amount,
  calculated_amount, difference_amount, notes, opened_by_user_id, closed_by_user_id
`

async function resolveUserNames(supabase: SupabaseClient, userIds: string[]) {
  const map = new Map<string, string>()
  const unique = [...new Set(userIds.filter(Boolean))]
  if (!unique.length) return map

  const { data } = await supabase
    .from("user_profiles")
    .select("user_id, full_name")
    .in("user_id", unique)

  for (const row of data || []) {
    if (row.user_id) map.set(String(row.user_id), row.full_name || "-")
  }
  return map
}

export async function fetchCashRegisterExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: CashRegisterExportFilters,
): Promise<import("../types").ExportResult> {
  const search = sanitizeSearchTerm(filters.search)
  const includeAllColumns = filters.includeAllColumns === true
  const select = includeAllColumns ? CASH_REGISTER_SELECT_ALL : CASH_REGISTER_SELECT

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any)
        .from("cash_sessions")
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

  const openerIds = rawRows.map((r) => String(r.opened_by_user_id || ""))
  const closerIds = rawRows.map((r) => String(r.closed_by_user_id || ""))
  const [openerNames, closerNames] = await Promise.all([
    resolveUserNames(supabase, openerIds),
    resolveUserNames(supabase, closerIds),
  ])

  const rows = rawRows.map((r) =>
    mapCashRegisterRow(
      {
        ...r,
        opener: { full_name: openerNames.get(String(r.opened_by_user_id || "")) || null },
        closer: { full_name: closerNames.get(String(r.closed_by_user_id || "")) || null },
      },
      includeAllColumns,
    ),
  )
  const columns = includeAllColumns ? CASH_REGISTER_EXPORT_ALL_COLUMNS : CASH_REGISTER_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}
