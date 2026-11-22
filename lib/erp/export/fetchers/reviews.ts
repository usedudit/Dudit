import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm } from "../filters"
import { buildKeysetOrFilter, fetchAllPages } from "../paginate"
import {
  mapReviewRow,
  REVIEW_EXPORT_ALL_COLUMNS,
  REVIEW_EXPORT_COLUMNS,
} from "../mappers"
import type { ReviewsExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const REVIEW_SELECT = `
  id, rating, comment, created_at, user_id, product_id, service_id, order_id,
  products(name),
  services(name),
  orders(order_number)
`

async function resolveCustomerScope(
  supabase: SupabaseClient,
  partnerId: string,
  customerId: string,
): Promise<{ userIds: string[]; orderIds: string[] } | null> {
  const { data: customer } = await supabase
    .from("customers")
    .select("id, user_id, marketplace_user_id")
    .eq("id", customerId)
    .eq("partner_id", partnerId)
    .maybeSingle()

  if (!customer) return null

  const candidateIds = [
    customer.id,
    (customer as any).user_id,
    (customer as any).marketplace_user_id,
  ].filter(Boolean) as string[]

  if (!candidateIds.length) return null

  const orParts = candidateIds.flatMap((id) => [`customer_id.eq.${id}`, `buyer_id.eq.${id}`])

  const { data: orders } = await supabase
    .from("orders")
    .select("id, buyer_id")
    .eq("partner_id", partnerId)
    .or(orParts.join(","))

  const orderIds = (orders || []).map((o: any) => String(o.id)).filter(Boolean)
  const buyerIds = (orders || []).map((o: any) => String(o.buyer_id || "")).filter(Boolean)

  const userIds = [...new Set([
    (customer as any).user_id,
    (customer as any).marketplace_user_id,
    ...buyerIds,
  ].filter(Boolean) as string[])]

  return { userIds, orderIds }
}

async function resolveUserNames(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(userIds.filter(Boolean))]
  if (!unique.length) return map

  const { data } = await supabase
    .from("user_profiles")
    .select("user_id, full_name")
    .in("user_id", unique)

  for (const row of data || []) {
    if (row.user_id) map.set(String(row.user_id), String(row.full_name || "Usuário"))
  }
  return map
}

export async function fetchReviewsExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: ReviewsExportFilters,
): Promise<import("../types").ExportResult> {
  const includeAllColumns = filters.includeAllColumns === true
  const search = sanitizeSearchTerm(filters.search)
  const ratings = (filters.rating || []).map((r) => Number(r)).filter((r) => Number.isFinite(r))

  let scope: { userIds: string[]; orderIds: string[] } | null = null
  if (filters.customerId) {
    scope = await resolveCustomerScope(supabase, partnerId, filters.customerId)
    if (!scope || (scope.orderIds.length === 0 && scope.userIds.length === 0)) {
      const columns = includeAllColumns ? REVIEW_EXPORT_ALL_COLUMNS : REVIEW_EXPORT_COLUMNS
      return { columns, rows: [], rowCount: 0 }
    }
  }

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any)
        .from("reviews")
        .select(REVIEW_SELECT)
        .eq("partner_id", partnerId)
        .is("deleted_at", null)

      if (filters.selectedIds?.length) query = query.in("id", filters.selectedIds)

      if (scope) {
        const orParts: string[] = []
        if (scope.userIds.length) orParts.push(`user_id.in.(${scope.userIds.join(",")})`)
        if (scope.orderIds.length) orParts.push(`order_id.in.(${scope.orderIds.join(",")})`)
        query = query.or(orParts.join(","))
      }

      if (filters.productId) query = query.eq("product_id", filters.productId)
      if (ratings.length === 1) query = query.eq("rating", ratings[0])
      else if (ratings.length > 1) query = query.in("rating", ratings)
      if (search) query = query.ilike("comment", `%${search}%`)

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

  const userNames = await resolveUserNames(
    supabase,
    rawRows.map((r) => String(r.user_id || "")),
  )

  const enriched = rawRows.map((row) => ({
    ...row,
    profiles: { full_name: userNames.get(String(row.user_id || "")) || "Usuário" },
  }))

  const rows = enriched.map((row) => mapReviewRow(row, includeAllColumns))
  const columns = includeAllColumns ? REVIEW_EXPORT_ALL_COLUMNS : REVIEW_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}
