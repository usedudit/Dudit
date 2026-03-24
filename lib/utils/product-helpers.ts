import type { Product } from "@/lib/types/product"

export function calculateProfitMargin(costPrice: number, sellingPrice: number): number {
  if (costPrice <= 0) return 0
  return ((sellingPrice - costPrice) / costPrice) * 100
}

export function calculateMarkup(costPrice: number, sellingPrice: number): number {
  if (costPrice <= 0) return 0
  return ((sellingPrice - costPrice) / sellingPrice) * 100
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

export function formatPercentage(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`
}

export function isLowStock(product: Product): boolean {
  if (!product.min_stock || product.min_stock === 0) return false
  return product.stock_quantity <= product.min_stock
}

export function getStockStatus(product: Product): "out_of_stock" | "low_stock" | "in_stock" {
  if (product.stock_quantity === 0) return "out_of_stock"
  if (isLowStock(product)) return "low_stock"
  return "in_stock"
}

export function getStockStatusLabel(status: "out_of_stock" | "low_stock" | "in_stock"): string {
  const labels = {
    out_of_stock: "Sem estoque",
    low_stock: "Estoque baixo",
    in_stock: "Em estoque",
  }
  return labels[status]
}

export function getStockStatusColor(status: "out_of_stock" | "low_stock" | "in_stock"): string {
  const colors = {
    out_of_stock: "text-brand-red",
    low_stock: "text-yellow-600",
    in_stock: "text-green-600",
  }
  return colors[status]
}

export function sanitizeProductData(data: any): any {
  return {
    ...data,
    name: data.name?.trim() || "",
    description: data.description?.trim() || null,
    sku: data.sku?.trim() || null,
    gtin: data.gtin?.trim() || null,
    price: Number(data.price) || 0,
    cost_price: Number(data.cost_price) || 0,
    stock_quantity: Number(data.stock_quantity) || 0,
    min_stock: Number(data.min_stock) || 0,
  }
}
