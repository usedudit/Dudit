export const getStockStatus = (stock: number, min?: number | null) => {
  if (stock <= 0)
    return { label: "Esgotado", variant: "red" as const }
  if (min && min > 0 && stock <= min)
    return { label: "Baixo", variant: "orange" as const }
  return { label: "Normal", variant: "green" as const }
}

import { formatCurrency as centralizedFormatCurrency } from "@/lib/utils"

export const formatCurrency = (value: number | string) => {
  return centralizedFormatCurrency(value)
}

export const getSupplierColor = (name: string) => {
  const colors = [
    "text-green-500 bg-green-500",
    "text-blue-500 bg-blue-500",
    "text-purple-500 bg-purple-500",
    "text-brand-orange bg-orange-500",
    "text-cyan-500 bg-cyan-500",
    "text-pink-500 bg-pink-500",
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}
