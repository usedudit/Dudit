import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm } from "../filters"
import { fetchAllPages } from "../paginate"
import {
  mapSubscriptionRow,
  SUBSCRIPTION_EXPORT_ALL_COLUMNS,
  SUBSCRIPTION_EXPORT_COLUMNS,
} from "../mappers"
import type { SubscriptionsExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const SUBSCRIPTION_SELECT = `
  id, partner_id, customer_id, recurring_plan_id, status,
  next_execution_at, started_at, delivery_type, notes, created_at,
  recurring_plans(id, name),
  customers:customer_id(id, name, email)
`

const SUBSCRIPTION_SELECT_ALL = `
  id, partner_id, customer_id, recurring_plan_id, status,
  next_execution_at, last_execution_at, started_at, paused_at, cancelled_at,
  delivery_type, delivery_address, notes, created_at,
  recurring_plans(id, name),
  customers:customer_id(id, name, email)
`

export async function fetchSubscriptionsExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: SubscriptionsExportFilters,
): Promise<import("../types").ExportResult> {
  const search = sanitizeSearchTerm(filters.search)
  const includeAllColumns = filters.includeAllColumns === true
  const select = includeAllColumns ? SUBSCRIPTION_SELECT_ALL : SUBSCRIPTION_SELECT

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any)
        .from("recurring_subscriptions")
        .select(select)
        .eq("partner_id", partnerId)

      if (filters.storeId) {
        query = query.eq("store_id", filters.storeId)
      }

      if (filters.selectedIds?.length) {
        query = query.in("id", filters.selectedIds)
      }

      if (filters.status && filters.status !== "all") {
        query = query.eq("status", filters.status)
      }

      if (search) {
        query = query.or(`notes.ilike.%${search}%`)
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

  const rows = rawRows.map((r) => mapSubscriptionRow(r, includeAllColumns))
  const columns = includeAllColumns ? SUBSCRIPTION_EXPORT_ALL_COLUMNS : SUBSCRIPTION_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}
