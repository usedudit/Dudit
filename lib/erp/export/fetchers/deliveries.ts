import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveExportDateBounds, sanitizeSearchTerm } from "../filters"
import { buildKeysetOrFilter, fetchAllPages } from "../paginate"
import {
  DELIVERY_EXPORT_ALL_COLUMNS,
  DELIVERY_EXPORT_COLUMNS,
  mapDeliveryRow,
} from "../mappers"
import type { DeliveriesExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const DELIVERY_SELECT = `
  id, partner_id, delivery_person_id, status, distance_km,
  estimated_duration_minutes, started_at, delivered_at, created_at,
  delivery_orders(
    order_id, position, status,
    orders(id, order_number, customer_name, total_amount, delivery_fee, delivery_address, order_source)
  )
`

const DELIVERY_SELECT_ALL = `
  id, partner_id, delivery_person_id, status, distance_km,
  estimated_duration_minutes, started_at, delivered_at, completed_at, created_at, notes,
  delivery_orders(
    order_id, position, status, delivered_at,
    orders(id, order_number, customer_name, total_amount, delivery_fee, delivery_address, order_source)
  )
`

const TAB_STATUSES: Record<string, string[]> = {
  pendente: ["pending", "not_sent"],
  pendentes: ["pending", "not_sent"],
  preparando: ["preparing"],
  "em preparo": ["preparing"],
  enviado: ["sent"],
  enviados: ["sent"],
  "em rota": ["sent"],
  entregue: ["delivered"],
  entregues: ["delivered"],
  retirada: ["pickup_available"],
  falha: ["delivery_failed"],
  cancelado: ["cancelled"],
  cancelados: ["cancelled"],
}

async function resolveDriverNames(
  supabase: SupabaseClient,
  partnerId: string,
  partnerUserIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(partnerUserIds.filter(Boolean))]
  if (!unique.length) return map

  const { data: partnerUsers } = await supabase
    .from("partner_users")
    .select("id, user_id")
    .eq("partner_id", partnerId)
    .in("id", unique)

  const userIds = [
    ...new Set([
      ...unique,
      ...(partnerUsers || []).map((p: any) => String(p.user_id || "")).filter(Boolean),
    ]),
  ]

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, full_name")
    .in("user_id", userIds)

  const nameByUserId = new Map<string, string>()
  for (const p of profiles || []) {
    if (p.user_id) nameByUserId.set(String(p.user_id), String(p.full_name || "Entregador"))
  }

  const userIdByPartnerUserId = new Map<string, string>()
  for (const p of partnerUsers || []) {
    if (p.id && p.user_id) userIdByPartnerUserId.set(String(p.id), String(p.user_id))
  }

  for (const id of unique) {
    const userId = userIdByPartnerUserId.get(id) || id
    map.set(id, nameByUserId.get(userId) || "Entregador")
  }
  return map
}

export async function fetchDeliveriesExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: DeliveriesExportFilters,
): Promise<import("../types").ExportResult> {
  const includeAllColumns = filters.includeAllColumns === true
  const select = includeAllColumns ? DELIVERY_SELECT_ALL : DELIVERY_SELECT
  const search = sanitizeSearchTerm(filters.search).toLowerCase()
  const statuses = (filters.status || []).filter(Boolean)

  const tabKey = String(filters.activeTab || "").toLowerCase()
  const tabStatuses = filters.activeTab && filters.activeTab !== "Todos" ? TAB_STATUSES[tabKey] : null

  const { startIso, endIso } = resolveExportDateBounds(filters.datePeriod, filters.timezone)

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any)
        .from("deliveries")
        .select(select)
        .eq("partner_id", partnerId)

      if (filters.selectedIds?.length) query = query.in("id", filters.selectedIds)

      if (tabStatuses?.length) query = query.in("status", tabStatuses)
      else if (statuses.length) query = query.in("status", statuses)

      if (startIso) query = query.gte("created_at", startIso)
      if (endIso) query = query.lte("created_at", endIso)

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

  const driverNames = await resolveDriverNames(
    supabase,
    partnerId,
    rawRows.map((r) => String(r.delivery_person_id || "")),
  )

  const enriched = rawRows.map((row) => ({
    ...row,
    delivery_person_name: driverNames.get(String(row.delivery_person_id || "")) || null,
  }))

  const filtered = search
    ? enriched.filter((row) => {
        const orders = Array.isArray(row.delivery_orders) ? row.delivery_orders : []
        const haystack = [
          row.delivery_person_name,
          ...orders.flatMap((l: any) => [
            l?.orders?.order_number,
            l?.orders?.customer_name,
            l?.orders?.delivery_address,
          ]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return haystack.includes(search)
      })
    : enriched

  const rows = filtered.map((row) => mapDeliveryRow(row, includeAllColumns))
  const columns = includeAllColumns ? DELIVERY_EXPORT_ALL_COLUMNS : DELIVERY_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}
