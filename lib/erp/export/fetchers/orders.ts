import type { SupabaseClient } from "@supabase/supabase-js"
import {
  resolveExportDateBounds,
  resolveOrderSituations,
  sanitizeSearchTerm,
} from "../filters"
import { buildKeysetOrFilter, fetchAllPages } from "../paginate"
import {
  mapOrderRow,
  ORDER_EXPORT_ALL_COLUMNS,
  ORDER_EXPORT_COLUMNS,
} from "../mappers"
import { canonicalDeliveryStatus } from "@/lib/orders/status"
import { normalizeOrderSource, resolveOrderPaymentMethodLabel } from "@/lib/orders/order-utils"
import type { ExportResult, OrdersExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const ORDER_SELECT = `
  id, order_number, customer_name, buyer_id, created_by, created_at,
  situation, payment_method, payment_breakdown, delivery_status, delivery_type,
  order_source, discount_value, discount_amount, payment_method_discount_amount,
  delivery_fee, additional_costs, total_amount,
  order_items(product_name, quantity, product_price, subtotal),
  customers:customers(name, email)
`

const ORDER_SELECT_ALL = `
  id, order_number, customer_name, buyer_id, created_by, created_at,
  situation, payment_method, payment_breakdown, delivery_status, order_source,
  discount_value, discount_amount, payment_method_discount_amount,
  payment_method_extra_amount, delivery_fee, additional_costs, total_amount,
  paid_amount, delivery_type, delivery_address, notes,
  order_items(product_name, quantity, product_price, subtotal),
  customers:customers(name, email)
`

const SALE_SELECT = `
  id, sale_number, customer_id, created_at, finalized_by_user_id,
  payment_status, status, total_amount, final_amount, discount_amount,
  delivery_fee, paid_amount,
  sale_items(product_name, quantity, unit_price, subtotal),
  customers:customer_id(name)
`

const SALE_SELECT_ALL = `
  id, sale_number, customer_id, created_at, finalized_by_user_id,
  payment_status, status, total_amount, final_amount, discount_amount,
  delivery_fee, paid_amount, notes, delivery_type, delivery_address,
  sale_items(product_name, quantity, unit_price, subtotal),
  customers:customer_id(name)
`

async function resolveSellerNames(supabase: SupabaseClient, partnerId: string, userIds: string[]) {
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

function applyOrderFilters(query: any, filters: OrdersExportFilters, partnerId: string) {
  query = query.eq("partner_id", partnerId)

  if (filters.storeId) query = query.eq("store_id", filters.storeId)
  if (filters.selectedIds?.length) query = query.in("id", filters.selectedIds)

  const situations = resolveOrderSituations(filters)
  if (situations?.length) query = query.in("situation", situations)

  const { startIso, endIso } = resolveExportDateBounds(filters.datePeriod)
  if (startIso) query = query.gte("created_at", startIso)
  if (endIso) query = query.lte("created_at", endIso)

  if (filters.customerId) query = query.eq("buyer_id", filters.customerId)

  const search = sanitizeSearchTerm(filters.search)
  if (search) {
    query = query.or(`order_number.ilike.%${search}%,customer_name.ilike.%${search}%`)
  }

  return query
}

/**
 * Row-level filters shared with the orders list screen. Applied after fetching
 * so label-based filters (origem, método de pagamento, status de entrega) match
 * exactly what the user sees on the page.
 */
function applyOrderRowFilters(rows: any[], filters: OrdersExportFilters): any[] {
  const channels = (filters.channels || []).map((c) => normalizeOrderSource(c)).filter(Boolean)
  const deliveryStatuses = (filters.deliveryStatus || []).map((s) => canonicalDeliveryStatus(s)).filter(Boolean)
  const deliveryTypes = (filters.deliveryType || []).filter(Boolean)
  const paymentMethods = (filters.paymentMethods || []).map((m) => m.trim()).filter(Boolean)
  const minTotal = filters.totalMin ? Number.parseFloat(filters.totalMin) : 0
  const maxTotal = filters.totalMax ? Number.parseFloat(filters.totalMax) : Number.POSITIVE_INFINITY

  const hasFilters =
    channels.length > 0 ||
    deliveryStatuses.length > 0 ||
    deliveryTypes.length > 0 ||
    paymentMethods.length > 0 ||
    minTotal > 0 ||
    Number.isFinite(maxTotal)

  if (!hasFilters) return rows

  return rows.filter((row) => {
    if (channels.length && !channels.includes(normalizeOrderSource(row.order_source))) return false
    if (deliveryStatuses.length && !deliveryStatuses.includes(canonicalDeliveryStatus(row.delivery_status))) return false
    if (deliveryTypes.length && !deliveryTypes.includes(row.delivery_type || "delivery")) return false
    if (paymentMethods.length && !paymentMethods.includes(resolveOrderPaymentMethodLabel(row))) return false

    const total = Number(row.total_amount || 0)
    if (Number.isNaN(total) || total < minTotal || total > maxTotal) return false

    return true
  })
}

function applySaleFilters(query: any, filters: OrdersExportFilters, partnerId: string) {
  query = query.eq("partner_id", partnerId)

  if (filters.storeId) query = query.eq("store_id", filters.storeId)
  if (filters.selectedIds?.length) query = query.in("id", filters.selectedIds)

  const situations = resolveOrderSituations(filters)
  if (situations?.length) {
    const paymentStatuses = situations.filter((s) =>
      ["paid", "pending", "partially_paid", "cancelled"].includes(s),
    )
    if (paymentStatuses.length > 0) query = query.in("payment_status", paymentStatuses)
  }

  const { startIso, endIso } = resolveExportDateBounds(filters.datePeriod)
  if (startIso) query = query.gte("created_at", startIso)
  if (endIso) query = query.lte("created_at", endIso)

  if (filters.customerId) query = query.eq("customer_id", filters.customerId)

  const search = sanitizeSearchTerm(filters.search)
  if (search) {
    query = query.or(`sale_number.ilike.%${search}%`)
  }

  return query
}

export async function fetchOrdersExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: OrdersExportFilters,
  includeSales = true,
): Promise<ExportResult> {
  const includeAllColumns = filters.includeAllColumns === true
  const orderSelect = includeAllColumns ? ORDER_SELECT_ALL : ORDER_SELECT
  const saleSelect = includeAllColumns ? SALE_SELECT_ALL : SALE_SELECT

  const orderRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any).from("orders").select(orderSelect)
      query = applyOrderFilters(query, filters, partnerId)
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

  let saleRows: any[] = []
  if (includeSales) {
    saleRows = await fetchAllPages<any>({
      chunkSize: EXPORT_CHUNK_SIZE,
      fetchPage: async (cursor) => {
        let query: any = (supabase as any).from("sales").select(saleSelect)
        query = applySaleFilters(query, filters, partnerId)
        const orFilter = buildKeysetOrFilter(cursor)
        if (orFilter) query = query.or(orFilter)
        const { data, error } = await query
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(EXPORT_CHUNK_SIZE)
        if (error) throw error
        const rows = (data || []).map((s: any) => ({
          ...s,
          order_number: s.sale_number,
          customer_name: s.customers?.name || "Consumidor final",
          order_source: "Presencial",
          situation:
            s.payment_status === "paid"
              ? "paid"
              : s.payment_status === "partially_paid"
                ? "partially_paid"
                : "pending",
          delivery_status: "delivered",
          order_items: s.sale_items,
        }))
        const last = rows[rows.length - 1]
        return {
          rows,
          nextCursor: last ? { createdAt: String(last.created_at), id: String(last.id) } : null,
        }
      },
    })
  }

  const merged = applyOrderRowFilters(
    [...orderRows, ...saleRows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
    filters,
  )

  const sellerIds = merged.map((r) => String(r.created_by || r.finalized_by_user_id || ""))
  const sellerNames = await resolveSellerNames(supabase, partnerId, sellerIds)

  const rows = merged.map((r) => mapOrderRow(r, sellerNames, includeAllColumns))
  const columns = includeAllColumns ? ORDER_EXPORT_ALL_COLUMNS : ORDER_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}

export async function fetchSalesExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: OrdersExportFilters,
): Promise<ExportResult> {
  const includeAllColumns = filters.includeAllColumns === true
  const saleSelect = includeAllColumns ? SALE_SELECT_ALL : SALE_SELECT

  const saleRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any).from("sales").select(saleSelect)
      query = applySaleFilters(query, filters, partnerId)
      const orFilter = buildKeysetOrFilter(cursor)
      if (orFilter) query = query.or(orFilter)
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(EXPORT_CHUNK_SIZE)
      if (error) throw error
      const rows = (data || []).map((s: any) => ({
        ...s,
        order_number: s.sale_number,
        customer_name: s.customers?.name || "Consumidor final",
        order_source: "Presencial",
        situation:
          s.payment_status === "paid"
            ? "paid"
            : s.payment_status === "partially_paid"
              ? "partially_paid"
              : "pending",
        delivery_status: "delivered",
        order_items: s.sale_items,
      }))
      const last = rows[rows.length - 1]
      return {
        rows,
        nextCursor: last ? { createdAt: String(last.created_at), id: String(last.id) } : null,
      }
    },
  })

  const sellerIds = saleRows.map((r) => String(r.finalized_by_user_id || ""))
  const sellerNames = await resolveSellerNames(supabase, partnerId, sellerIds)
  const filteredRows = applyOrderRowFilters(saleRows, filters)
  const rows = filteredRows.map((r) => mapOrderRow(r, sellerNames, includeAllColumns))
  const columns = includeAllColumns ? ORDER_EXPORT_ALL_COLUMNS : ORDER_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}
