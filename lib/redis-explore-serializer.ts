export type ExploreItemType = "produto" | "servico" | "loja"

const PUBLIC_PRODUCT_FIELDS = [
  "id", "name", "description", "price", "promotional_price", "images", "video_thumbnail",
  "rating", "marketplace_score", "sales_last_30_days", "favorites_count", "views_last_30_days",
  "category_id", "marketplace_category_id", "category", "subcategoryName", "created_at", "updated_at",
  "partners", "stores", "show_price_in_store", "fallback_variant_image", "fallback_variant_price", "itemType",
] as const

const PUBLIC_SERVICE_FIELDS = [
  "id", "name", "description", "price", "promotional_price", "images", "video_thumbnail",
  "rating", "marketplace_score", "bookings_last_30_days", "favorites_count", "views_count",
  "category_id", "marketplace_category_id", "category", "subcategoryName", "duration_minutes",
  "created_at", "updated_at", "partners", "stores", "show_price_in_store", "itemType",
] as const

const PUBLIC_STORE_FIELDS = [
  "id", "name", "slug", "description", "images", "rating", "category", "partners", "created_at", "updated_at", "itemType",
] as const

function pickFields<T extends Record<string, any>>(data: T, fields: readonly string[]) {
  return fields.reduce<Record<string, any>>((result, field) => {
    if (data[field] !== undefined) result[field] = data[field]
    return result
  }, {})
}

export function isExploreProductPublic(row: Record<string, any> | null | undefined): boolean {
  return Boolean(
    row &&
    row.is_active === true &&
    row.status === "ativo" &&
    row.moderation_status === "approved" &&
    row.deleted_at == null &&
    row.show_in_marketplace === true,
  )
}

export function isExploreServicePublic(row: Record<string, any> | null | undefined): boolean {
  const isStatusActive = row?.status === "ativo" || row?.status === "active" || row?.is_active === true
  const isNotArchivedOrDeleted = row?.status !== "inativo" && row?.status !== "arquivado" && row?.status !== "deleted" && row?.status !== "excluido"
  const isApproved = row?.moderation_status === "approved" || !row?.moderation_status

  return Boolean(
    row &&
    isStatusActive &&
    isNotArchivedOrDeleted &&
    isApproved &&
    row.deleted_at == null &&
    row.show_in_marketplace === true,
  )
}

export function isExploreStorePublic(row: Record<string, any> | null | undefined): boolean {
  return Boolean(row && row.is_active === true)
}

export function serializeExploreItem(
  data: Record<string, any>,
  type: ExploreItemType,
): Record<string, any> {
  const fields = type === "produto"
    ? PUBLIC_PRODUCT_FIELDS
    : type === "servico"
      ? PUBLIC_SERVICE_FIELDS
      : PUBLIC_STORE_FIELDS

  return pickFields(data, fields)
}

export function isExploreItemProjection(
  data: Record<string, any> | null | undefined,
  type: ExploreItemType,
): boolean {
  if (!data) return false
  const projected = serializeExploreItem(data, type)
  return Object.keys(data).every(field => Object.prototype.hasOwnProperty.call(projected, field))
}
