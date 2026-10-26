import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm } from "../filters"
import { buildKeysetOrFilter, fetchAllPages } from "../paginate"
import {
  applyProductStockFilter,
  mapProductRow,
  PRODUCT_EXPORT_ALL_COLUMNS,
  PRODUCT_EXPORT_COLUMNS,
} from "../mappers"
import type { ProductsExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const PRODUCT_SELECT =
  "id, name, stock_quantity, price, cost_price, is_active, sku, gtin, promotional_price, show_in_marketplace, product_variants(variant_name, variant_type, variant_value, sku, price_adjustment, stock_quantity, is_active)"

const PRODUCT_SELECT_ALL =
  "id, name, description, stock_quantity, price, cost_price, min_stock, is_active, sku, created_at, show_in_marketplace, category_id, category:product_categories!category_id(name), brand, brand_id, brand_rel:brands!brand_id(name), product_type, condition, gtin, unit, promotional_price, product_fiscal_profiles(ncm, cest), product_logistics(weight_gross, weight_net, width, height, length), product_variants(variant_name, variant_type, variant_value, sku, price_adjustment, stock_quantity, is_active)"

const TAB_STOCK: Record<string, string> = {
  normal: "Normal",
  low: "Baixo",
  out_of_stock: "Esgotado",
}

export async function fetchProductsExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: ProductsExportFilters,
): Promise<import("../types").ExportResult> {
  const includeAllColumns = filters.includeAllColumns === true
  const select = includeAllColumns ? PRODUCT_SELECT_ALL : PRODUCT_SELECT
  const categoryNames = (filters.categories || []).filter(Boolean)
  let categoryIds: string[] = []

  if (categoryNames.length) {
    const { data: cats } = await supabase
      .from("product_categories")
      .select("id, name")
      .eq("partner_id", partnerId)
      .in("name", categoryNames)
    categoryIds = (cats || []).map((c) => c.id)
    if (!categoryIds.length) {
      const columns = includeAllColumns ? PRODUCT_EXPORT_ALL_COLUMNS : PRODUCT_EXPORT_COLUMNS
      return { columns, rows: [], rowCount: 0 }
    }
  }

  const stockLabels = [...(filters.stockStatus || [])]
  if (filters.activeTab && filters.activeTab !== "all") {
    const tabLabel = TAB_STOCK[filters.activeTab]
    if (tabLabel) stockLabels.push(tabLabel)
  }

  const statusLabels = filters.status || []
  const search = sanitizeSearchTerm(filters.search)

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any).from("products").select(select).eq("partner_id", partnerId)

      if (filters.storeId) query = query.or(`store_id.eq.${filters.storeId},store_id.is.null`)
      if (filters.selectedIds?.length) query = query.in("id", filters.selectedIds)

      if (statusLabels.length === 1) {
        query = query.eq("status", statusLabels[0] === "Ativo" ? "ativo" : "inativo")
      }

      if (categoryIds.length) query = query.in("category_id", categoryIds)

      if (search) {
        query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
      }

      const orFilter = buildKeysetOrFilter(cursor)
      if (orFilter) query = query.or(orFilter)

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(EXPORT_CHUNK_SIZE)

      if (error) throw error
      const rows = (data || []).map((p: any) => ({
        ...p,
        ...(p.product_fiscal_profiles || {}),
        ...(p.product_logistics || {}),
        category: p.category?.name || null,
        brand: p.brand_rel?.name || p.brand || null,
      }))
      const last = rows[rows.length - 1]
      return {
        rows,
        nextCursor: last ? { createdAt: String(last.created_at), id: String(last.id) } : null,
      }
    },
  })

  const filtered = rawRows.filter((row) => applyProductStockFilter(row, stockLabels))
  const rows = filtered.map((row) => mapProductRow(row, includeAllColumns))
  const columns = includeAllColumns ? PRODUCT_EXPORT_ALL_COLUMNS : PRODUCT_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}
