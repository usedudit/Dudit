import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm } from "../filters"
import { buildKeysetOrFilter, fetchAllPages } from "../paginate"
import {
  COUPON_EXPORT_ALL_COLUMNS,
  COUPON_EXPORT_COLUMNS,
  mapCouponRow,
} from "../mappers"
import type { CouponsExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const COUPON_SELECT = `
  id, code, discount_type, discount_value, apply_scope, is_automatic, is_active,
  min_cart_value, usage_limit, starts_at, ends_at, created_at,
  coupon_usages(count)
`

const COUPON_SELECT_ALL = `
  id, code, discount_type, discount_value, apply_scope, is_automatic, is_active,
  allow_combination, min_cart_value, max_discount_value, usage_limit,
  usage_per_customer, first_purchase_only, customer_scope, starts_at, ends_at,
  created_at,
  coupon_usages(count)
`

export async function fetchCouponsExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: CouponsExportFilters,
): Promise<import("../types").ExportResult> {
  const includeAllColumns = filters.includeAllColumns === true
  const select = includeAllColumns ? COUPON_SELECT_ALL : COUPON_SELECT
  const search = sanitizeSearchTerm(filters.search)
  const statuses = (filters.status || []).filter(Boolean)
  const discountTypes = (filters.discountType || []).filter(Boolean)
  const applyScopes = (filters.applyScope || []).filter(Boolean)

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any)
        .from("coupons")
        .select(select)
        .eq("partner_id", partnerId)

      if (filters.storeId) query = query.or(`store_id.is.null,store_id.eq.${filters.storeId}`)
      if (filters.selectedIds?.length) query = query.in("id", filters.selectedIds)

      if (filters.activeTab === "Ativos") query = query.eq("is_active", true)
      else if (filters.activeTab === "Inativos") query = query.eq("is_active", false)
      else if (filters.activeTab === "Automaticos") query = query.eq("is_automatic", true)

      if (statuses.length === 1) query = query.eq("is_active", statuses[0] === "Ativo")
      else if (statuses.length > 1) query = query.in("is_active", statuses.map((s) => s === "Ativo"))

      if (discountTypes.length) query = query.in("discount_type", discountTypes)
      if (applyScopes.length) query = query.in("apply_scope", applyScopes)
      if (search) query = query.ilike("code", `%${search}%`)

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

  const rows = rawRows.map((row) => mapCouponRow(row, includeAllColumns))
  const columns = includeAllColumns ? COUPON_EXPORT_ALL_COLUMNS : COUPON_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}
