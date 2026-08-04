/**
 * Reusable query scope helpers for explicit soft-delete architecture.
 * These helpers modify Supabase PostgREST query builders to filter rows based on `deleted_at`.
 */

export interface SoftDeletePayload {
  deleted_at: string
  deleted_by: string
  deleted_reason: string | null
  status: string
  is_active?: boolean
}

export interface RestorePayload {
  deleted_at: null
  deleted_by: null
  deleted_reason: null
  status: string
  is_active?: boolean
}

export interface ArchivePayload {
  deleted_at: null
  deleted_by: null
  deleted_reason: null
  status: string
  is_active?: boolean
}

/**
 * Scopes a query to only return active (non-deleted) records.
 * Equivalent to appending: WHERE deleted_at IS NULL AND status != 'deleted'
 */
export function scopeActiveOnly<T extends { is: (col: string, val: null) => any; not: (col: string, op: string, val: any) => any }>(query: T): T {
  return query.is("deleted_at", null).not("status", "neq", "deleted")
}

/**
 * Scopes a query to only return archived (plan-archived or manually archived) records.
 * Equivalent to appending: WHERE deleted_at IS NULL AND status IN ('archived', 'arquivado') AND status != 'deleted'
 */
export function scopeArchivedOnly<T extends { is: (col: string, val: null) => any; in: (col: string, vals: string[]) => any; not: (col: string, op: string, val: any) => any }>(query: T): T {
  return query.is("deleted_at", null).in("status", ["archived", "arquivado"]).not("status", "neq", "deleted")
}

/**
 * Scopes a query to include all non-deleted records, including archived ones.
 */
export function scopeWithArchived<T extends { is: (col: string, val: null) => any; not: (col: string, op: string, val: any) => any }>(query: T): T {
  return query.is("deleted_at", null).not("status", "neq", "deleted")
}

/**
 * Helper to build a standardized soft delete payload.
 */
export function buildSoftDeletePayload(userId: string, reason?: string | null): SoftDeletePayload {
  return {
    deleted_at: new Date().toISOString(),
    deleted_by: userId,
    deleted_reason: reason || null,
    status: "deleted",
  }
}

/**
 * Helper to build a standardized restore payload.
 */
export function buildRestorePayload(status: "ativo" | "active" = "ativo"): RestorePayload {
  return {
    deleted_at: null,
    deleted_by: null,
    deleted_reason: null,
    status,
  }
}

/**
 * Helper to build a standardized archive payload (plan limits or manual archive).
 */
export function buildArchivePayload(status: "arquivado" | "archived" = "arquivado"): ArchivePayload {
  return {
    deleted_at: null,
    deleted_by: null,
    deleted_reason: null,
    status,
  }
}
