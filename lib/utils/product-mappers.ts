/**
 * Utilitários para mapear dados de produtos entre diferentes formatos
 */

import type { Product } from "@/lib/types/product"

/**
 * Mapeia um produto do banco de dados para o formato usado no formulário
 */
export function mapProductToFormData(initialProduct: Product | null | undefined) {
  if (!initialProduct) {
    return null
  }

  const images = initialProduct.images || []

  return {
    ...initialProduct,
    images,
    stock: initialProduct.stock_quantity !== undefined ? initialProduct.stock_quantity : (initialProduct as any).stock,
    minStock: initialProduct.min_stock !== undefined ? initialProduct.min_stock : (initialProduct as any).minStock,
    maxStock: (initialProduct as any).max_stock !== undefined ? (initialProduct as any).max_stock : (initialProduct as any).maxStock,
    costPrice: initialProduct.cost_price !== undefined ? initialProduct.cost_price : (initialProduct as any).costPrice,
    localizacao: initialProduct.location !== undefined ? initialProduct.location : (initialProduct as any).localizacao,
    unidade: initialProduct.unit !== undefined ? initialProduct.unit : (initialProduct as any).unidade,
    is_active:
      initialProduct.is_active !== undefined ? initialProduct.is_active : (initialProduct as any).status === "Active",
    condicao: initialProduct.condition !== undefined ? initialProduct.condition : (initialProduct as any).condicao,
    productType: (initialProduct as any).product_type !== undefined ? (initialProduct as any).product_type : (initialProduct as any).productType,
    attributes: (initialProduct as any).technical_specs || [],
    warranty_value: (initialProduct as any).warranty ? parseInt((initialProduct as any).warranty.split(" ")[0]) || 0 : 0,
    warranty_period: (initialProduct as any).warranty ? (initialProduct as any).warranty.split(" ").slice(1).join(" ") || "Meses" : "Meses",
    is_highlighted: (initialProduct as any).is_featured || false,
    availability_value: (initialProduct as any).availability_value ?? 0,
    availability_unit: (initialProduct as any).availability_unit || "Dias",
    digital_format: (initialProduct as any).delivery_format !== undefined ? (initialProduct as any).delivery_format : "Download",
    category_id: initialProduct.category_id,
    subcategory_id: initialProduct.subcategory_id,
    brand_id: initialProduct.brand_id,
    location_id: initialProduct.location_id,
    video_type: (initialProduct as any).video_type || null,
    video_url: (initialProduct as any).video_url || "",
    video_thumbnail: (initialProduct as any).video_thumbnail || null,
    video_duration: (initialProduct as any).video_duration || null,
    video_provider_id: (initialProduct as any).video_provider_id || null,
    // F5.5c: Extract visibility_scope from store_products bridge
    visibility_scope: extractVisibilityScope((initialProduct as any).store_products),
    visibility_stores: extractVisibilityStores((initialProduct as any).store_products),
  }
}

function extractVisibilityScope(storeProducts: any[] | undefined): string {
  if (!storeProducts || storeProducts.length === 0) return 'exclusive'
  const nonExclusive = storeProducts.find((sp: any) => sp.visibility_scope && sp.visibility_scope !== 'exclusive')
  if (nonExclusive) return nonExclusive.visibility_scope
  return 'exclusive'
}

function extractVisibilityStores(storeProducts: any[] | undefined): string[] {
  if (!storeProducts || storeProducts.length === 0) return []
  return storeProducts
    .filter((sp: any) => sp.visibility_scope === 'selected')
    .map((sp: any) => sp.store_id)
}
