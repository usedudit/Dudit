import type { SupabaseClient } from "@supabase/supabase-js"
import {
  mapCustomerStatusToDb,
  resolveExportDateBounds,
  sanitizeSearchTerm,
} from "../filters"
import { buildKeysetOrFilter, fetchAllPages } from "../paginate"
import {
  applyCustomerStatusFilter,
  mapCustomerRow,
  CUSTOMER_EXPORT_COLUMNS,
} from "../mappers"
import type { CustomersExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const CUSTOMER_SELECT = "id, name, email, phone, status, created_at"

async function loadCustomerStats(supabase: SupabaseClient, partnerId: string, customerIds: string[]) {
  const stats = new Map<string, { orders: number; ltv: number }>()
  if (!customerIds.length) return stats

  const chunkSize = 200
  for (let i = 0; i < customerIds.length; i += chunkSize) {
    const chunk = customerIds.slice(i, i + chunkSize)

    const [ordersRes, salesRes] = await Promise.all([
      supabase
        .from("orders")
        .select("buyer_id, total_amount")
        .eq("partner_id", partnerId)
        .in("buyer_id", chunk)
        .neq("situation", "cancelled"),
      supabase
        .from("sales")
        .select("customer_id, final_amount")
        .eq("partner_id", partnerId)
        .in("customer_id", chunk),
    ])

    for (const o of ordersRes.data || []) {
      if (!o.buyer_id) continue
      const id = String(o.buyer_id)
      const cur = stats.get(id) || { orders: 0, ltv: 0 }
      cur.orders += 1
      cur.ltv += Number(o.total_amount || 0)
      stats.set(id, cur)
    }

    for (const s of salesRes.data || []) {
      if (!s.customer_id) continue
      const id = String(s.customer_id)
      const cur = stats.get(id) || { orders: 0, ltv: 0 }
      cur.orders += 1
      cur.ltv += Number(s.final_amount || 0)
      stats.set(id, cur)
    }
  }

  return stats
}

export async function fetchCustomersExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: CustomersExportFilters,
): Promise<import("../types").ExportResult> {
  const statusLabels = [...(filters.status || [])]
  if (filters.activeTab && filters.activeTab !== "Todos") {
    statusLabels.push(filters.activeTab)
  }

  const search = sanitizeSearchTerm(filters.search)
  const { startIso, endIso } = resolveExportDateBounds(filters.datePeriod)

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query = supabase.from("customers").select(CUSTOMER_SELECT).eq("partner_id", partnerId)

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

  const filtered = rawRows.filter((row) => applyCustomerStatusFilter(row, statusLabels))
  const stats = await loadCustomerStats(
    supabase,
    partnerId,
    filtered.map((r) => String(r.id)),
  )

  const rows = filtered.map((r) => mapCustomerRow(r, stats.get(String(r.id))))
  return { columns: CUSTOMER_EXPORT_COLUMNS, rows, rowCount: rows.length }
}
