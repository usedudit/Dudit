import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm } from "../filters"
import { fetchAllPages } from "../paginate"
import {
  mapServiceOrderRow,
  SERVICE_ORDER_EXPORT_ALL_COLUMNS,
  SERVICE_ORDER_EXPORT_COLUMNS,
} from "../mappers"
import type { ServiceOrdersExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const SERVICE_ORDER_SELECT = `
  id, order_number, title, status, customer_snapshot, assigned_user_id,
  expected_completion_date, total_amount, created_at
`

const SERVICE_ORDER_SELECT_ALL = `
  id, order_number, title, status, description, internal_notes,
  customer_snapshot, assigned_user_id, expected_completion_date, completed_at,
  total_amount, total_service_amount, total_product_amount, created_at
`

async function resolveAssignedUserNames(supabase: SupabaseClient, userIds: string[]) {
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

export async function fetchServiceOrdersExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: ServiceOrdersExportFilters,
): Promise<import("../types").ExportResult> {
  const search = sanitizeSearchTerm(filters.search)
  const selectedIds = (filters.selectedIds || []).filter(Boolean)
  const includeAllColumns = filters.includeAllColumns === true
  const select = includeAllColumns ? SERVICE_ORDER_SELECT_ALL : SERVICE_ORDER_SELECT

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any)
        .from("service_orders")
        .select(select)
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
          aberta: ["aberta"],
          em_andamento: ["em_andamento", "aguardando_aprovacao", "aguardando_peca"],
          concluida: ["concluida", "entregue"],
          cancelada: ["cancelada"],
        }
        const tabStatuses = tabMap[filters.activeTab]
        if (tabStatuses?.length) query = query.in("status", tabStatuses)
      }

      if (search) {
        query = query.or(
          `order_number.ilike.%${search}%,title.ilike.%${search}%`,
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

  const assignedIds = rawRows.map((r) => String(r.assigned_user_id || ""))
  const assignedNames = await resolveAssignedUserNames(supabase, assignedIds)

  const rows = rawRows.map((r) => {
    const assignedName = assignedNames.get(String(r.assigned_user_id || "")) || "-"
    return mapServiceOrderRow({ ...r, user_profiles: { full_name: assignedName } }, includeAllColumns)
  })

  const columns = includeAllColumns ? SERVICE_ORDER_EXPORT_ALL_COLUMNS : SERVICE_ORDER_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}
