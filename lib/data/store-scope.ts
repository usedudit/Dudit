/**
 * Applies a branch scope to a Supabase query. A comma-separated list means
 * "all stores the current user can access"; a single id means one branch.
 */
export function scopeQueryToStores(query: any, storeIds: string, column = "store_id") {
  const ids = storeIds.split(",").map((id) => id.trim()).filter(Boolean)
  if (ids.length === 1) return query.eq(column, ids[0])
  if (ids.length > 1) return query.in(column, ids)
  return query
}
