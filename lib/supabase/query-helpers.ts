/**
 * Reusable query scope helpers for explicit soft-delete architecture.
 * These helpers modify Supabase PostgREST query builders to filter rows based on `deleted_at`.
 */

export interface SoftDeletePayload {
  deleted_at: string
  deleted_by: string
  deleted_reason: string | null
  status: string
}

export interface RestorePayload {
  deleted_at: null
  deleted_by: null
  deleted_reason: null
  status: string
}

/**
 * Scopes a query to only return active (non-deleted) records.
 * Equivalent to appending: WHERE deleted_at IS NULL
 */
export function scopeActiveOnly<T extends { is: (col: string, val: null) => any }>(query: T): T {
  return query.is("deleted_at", null)
}

/**
 * Scopes a query to only return archived (deleted) records.
 * Equivalent to appending: WHERE deleted_at IS NOT NULL
 */
export function scopeArchivedOnly<T extends { not: (col: string, operator: string, val: null) => any }>(query: T): T {
  return query.not("deleted_at", "is", null)
}

/**
 * Scopes a query to include all records, including archived (deleted) ones.
 * Used explicitly for readability.
 */
export function scopeWithArchived<T>(query: T): T {
  return query
}

/**
 * Helper to build a standardized soft delete payload.
 */
export function buildSoftDeletePayload(userId: string, reason?: string | null): SoftDeletePayload {
  return {
    deleted_at: new Date().toISOString(),
    deleted_by: userId,
    deleted_reason: reason || null,
    status: "archived",
  }
}

/**
 * Helper to build a standardized restore payload.
 */
export function buildRestorePayload(): RestorePayload {
  return {
    deleted_at: null,
    deleted_by: null,
    deleted_reason: null,
    status: "active",
  }
}
