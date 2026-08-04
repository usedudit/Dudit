import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm } from "../filters"
import { buildKeysetOrFilter, fetchAllPages } from "../paginate"
import {
  applyProductStockFilter,
  mapProductRow,
  PRODUCT_EXPORT_COLUMNS,
  PRODUCT_EXPORT_ALL_COLUMNS,
} from "../mappers"
import type { ProductsExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const PRODUCT_SELECT_DEFAULT =
  "id, name, stock_quantity, price, cost_price, min_stock, is_active, sku, created_at, show_in_marketplace, category_id, category:product_categories!category_id(name)"

const PRODUCT_SELECT_ALL =
  "id, name, description, stock_quantity, price, cost_price, min_stock, is_active, sku, created_at, show_in_marketplace, category_id, category:product_categories!category_id(name), brand_id, brand:brands!brand_id(name), location_id, location:storage_locations!location_id(name), product_type, condition, gtin, unit, fci_code, profit_margin, ncm, cest, origin, item_type, cfop_internal, cfop_external, csosn, tax_percentage, pis_cst, pis_rate, cofins_cst, cofins_rate, ipi_cst, ipi_code, product_situation, c_benef, inf_ad_prod, weight_gross, weight_net, width, height, length, packaging_type, preparation_days, allow_sell_without_stock, max_stock, promotional_price, is_on_promotion, promotion_value, availability_value, availability_unit, moderation_status, show_price_in_store, subcategory_id, subcategory:product_categories!subcategory_id(name)"

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
  const selectFields = includeAllColumns ? PRODUCT_SELECT_ALL : PRODUCT_SELECT_DEFAULT

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any).from("products").select(selectFields).eq("partner_id", partnerId)

      if (filters.storeId) query = query.eq("store_id", filters.storeId)
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
        category: p.category?.name || null,
        subcategory: p.subcategory?.name || null,
        brand: p.brand?.name || null,
        location: p.location?.name || null,
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
