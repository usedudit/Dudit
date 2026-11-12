import type { Product } from "@/lib/types/product"

export function mapProductToFormData(initialProduct: Product | null | undefined) {
  if (!initialProduct) {
    return null
  }

  const images = initialProduct.images || []

  return {
    ...initialProduct,
    images,
    stock: initialProduct.stock_quantity !== undefined ? initialProduct.stock_quantity : (initialProduct as any).stock,
    stock_reserved: initialProduct.stock_reserved !== undefined ? Math.max(0, Number(initialProduct.stock_reserved) || 0) : (Math.max(0, Number((initialProduct as any).stock_reserved) || 0)),
    stock_available: initialProduct.stock_available !== undefined ? Number(initialProduct.stock_available) : undefined,
    minStock: initialProduct.min_stock !== undefined ? initialProduct.min_stock : (initialProduct as any).minStock,
    maxStock: (initialProduct as any).max_stock !== undefined ? (initialProduct as any).max_stock : (initialProduct as any).maxStock,
    costPrice: initialProduct.cost_price !== undefined ? initialProduct.cost_price : (initialProduct as any).costPrice,
    localizacao: (initialProduct.location as any)?.name || (typeof initialProduct.location === 'string' ? initialProduct.location : "") || (initialProduct as any).localizacao || "",
    location: (initialProduct.location as any)?.name || (typeof initialProduct.location === 'string' ? initialProduct.location : "") || (initialProduct as any).localizacao || "",
    brand: (initialProduct.brand as any)?.name || (typeof initialProduct.brand === 'string' ? initialProduct.brand : "") || (initialProduct as any).brand || "",
    unidade: initialProduct.unit !== undefined ? initialProduct.unit : (initialProduct as any).unidade,
    is_active:
      initialProduct.is_active !== undefined ? initialProduct.is_active : (initialProduct as any).status === "Active",
    condicao: initialProduct.condition !== undefined ? initialProduct.condition : (initialProduct as any).condicao,
    productType: (initialProduct as any).product_type !== undefined ? (initialProduct as any).product_type : (initialProduct as any).productType,
    attributes: Array.isArray((initialProduct as any).technical_specs)
      ? (initialProduct as any).technical_specs
      : (initialProduct as any).technical_specs?.attributes || [],
    addon_groups: (initialProduct as any).addon_groups || (initialProduct as any).technical_specs?.addon_groups || [],
    accepts_offers: (initialProduct as any).accepts_offers ?? (initialProduct as any).technical_specs?.accepts_offers ?? false,
    accepts_trades: (initialProduct as any).accepts_trades ?? (initialProduct as any).technical_specs?.accepts_trades ?? false,
    warranty_value: (initialProduct as any).warranty ? parseInt((initialProduct as any).warranty.split(" ")[0]) || 0 : 0,
    warranty_period: (initialProduct as any).warranty ? (initialProduct as any).warranty.split(" ").slice(1).join(" ") || "Meses" : "Meses",
    availability_value: (initialProduct as any).availability_value ?? 0,
    availability_unit: (initialProduct as any).availability_unit || "Dias",
    digital_format: (initialProduct as any).delivery_format !== undefined ? (initialProduct as any).delivery_format : "Download",
    category_id: initialProduct.category_id || "",
    subcategory_id: initialProduct.subcategory_id || "",
    brand_id: initialProduct.brand_id || (initialProduct.brand as any)?.id || "",
    location_id: initialProduct.location_id || (initialProduct.location as any)?.id || "",
    video_type: (initialProduct as any).video_type || null,
    video_url: (initialProduct as any).video_url || "",
    video_thumbnail: (initialProduct as any).video_thumbnail || null,
    video_duration: (initialProduct as any).video_duration || null,
    video_provider_id: (initialProduct as any).video_provider_id || null,
    fulfillment_modes: Array.isArray((initialProduct as any).fulfillment_modes)
      ? (initialProduct as any).fulfillment_modes
      : undefined,
  }
}
