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

export interface CatalogSoftDeletePayload extends SoftDeletePayload {
  show_in_marketplace: boolean
}

export interface RestorePayload {
  deleted_at: null
  deleted_by: null
  deleted_reason: null
  status: string
}

export interface ArchivePayload {
  deleted_at: null
  deleted_by: null
  deleted_reason: null
  status: string
}

/**
 * Scopes a query to only return active (non-deleted) records.
 * Equivalent to appending: WHERE deleted_at IS NULL AND status != 'deleted'
 */
export function scopeActiveOnly<T>(query: T): T {
  return (query as any).is("deleted_at", null).neq("status", "deleted")
}

/**
 * Scopes a query to only return archived (plan-archived or manually archived) records.
 * Equivalent to appending: WHERE deleted_at IS NULL AND status IN ('archived', 'arquivado') AND status != 'deleted'
 */
export function scopeArchivedOnly<T>(query: T): T {
  return (query as any).is("deleted_at", null).in("status", ["archived", "arquivado"]).neq("status", "deleted")
}

/**
 * Scopes a query to include all non-deleted records, including archived ones.
 */
export function scopeWithArchived<T>(query: T): T {
  return (query as any).is("deleted_at", null).neq("status", "deleted")
}

/**
 * Helper to build a standardized soft delete payload.
 * Note: Intentionally omits `is_active` because `products.is_active` and `services.is_active`
 * are PostgreSQL `GENERATED ALWAYS AS (status = 'ativo') STORED` columns (updating them raises 428C9).
 * Tables with a regular boolean `is_active` column (e.g. `customers`) should spread and set it explicitly.
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
 * Helper to build a soft delete payload for marketplace catalog items (products/services),
 * also disabling marketplace visibility so deleted rows are never exposed publicly.
 */
export function buildCatalogSoftDeletePayload(userId: string, reason?: string | null): CatalogSoftDeletePayload {
  return {
    ...buildSoftDeletePayload(userId, reason),
    show_in_marketplace: false,
  }
}

/**
 * Helper to build a standardized restore payload.
 * Intentionally omits `is_active` (generated column on `products` and `services`).
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
 * Intentionally omits `is_active` (generated column on `products` and `services`).
 */
export function buildArchivePayload(status: "arquivado" | "archived" = "arquivado"): ArchivePayload {
  return {
    deleted_at: null,
    deleted_by: null,
    deleted_reason: null,
    status,
  }
}
