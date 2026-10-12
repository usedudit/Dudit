import { resolveDatePeriodBounds, type DatePeriodFilterValue } from "@/lib/utils/filter-date-period"
import type { OrdersExportFilters } from "./types"

const ORDER_STATUS_LABELS: Record<string, string[]> = {
  Pago: ["paid", "delivered"],
  Pendente: ["pending", "unpaid"],
  Enviado: ["shipped"],
  Cancelado: ["cancelled"],
  "Em análise": ["in_process"],
  "Parcialmente Pago": ["partially_paid"],
  Entregue: ["delivered"],
}

const ORDER_TAB_SITUATIONS: Record<string, string[]> = {
  Pendente: ["pending", "in_process"],
  Pago: ["paid", "delivered"],
  Enviado: ["shipped"],
  Cancelado: ["cancelled"],
}

const PAYMENT_STATUS_MAP: Record<string, string[]> = {
  paid: ["paid", "delivered"],
  pago: ["paid", "delivered"],
  pending: ["pending", "in_process"],
  pendente: ["pending", "in_process"],
  partially_paid: ["partially_paid"],
  "parcialmente pago": ["partially_paid"],
  cancelled: ["cancelled"],
  cancelado: ["cancelled"],
  shipped: ["shipped"],
  enviado: ["shipped"],
}

export function sanitizeSearchTerm(value?: string | null, maxLen = 120): string {
  return String(value || "")
    .trim()
    .slice(0, maxLen)
    .replace(/[%_]/g, "")
}

export function resolveExportDateBounds(period?: DatePeriodFilterValue) {
  if (!period) return { startIso: null as string | null, endIso: null as string | null }
  const { startYmd, endYmd } = resolveDatePeriodBounds(period)
  const startIso = startYmd ? `${startYmd}T00:00:00-03:00` : null
  const endIso = endYmd ? `${endYmd}T23:59:59.999-03:00` : null
  return { startIso, endIso }
}

export function resolveOrderSituations(filters: OrdersExportFilters): string[] | null {
  const situations = new Set<string>()

  if (filters.activeTab && filters.activeTab !== "Todos") {
    for (const s of ORDER_TAB_SITUATIONS[filters.activeTab] || []) situations.add(s)
  }

  for (const label of filters.status || []) {
    for (const s of ORDER_STATUS_LABELS[label] || []) situations.add(s)
  }

  for (const raw of filters.paymentStatus || []) {
    const key = raw.toLowerCase()
    for (const s of PAYMENT_STATUS_MAP[key] || [key]) situations.add(s)
  }

  return situations.size > 0 ? [...situations] : null
}

export function mapCustomerStatusLabel(status?: string | null): string {
  const s = String(status || "").toLowerCase()
  if (s === "bloqueado" || s === "blocked") return "Bloqueado"
  if (s === "inativo" || s === "inactive") return "Inativo"
  return "Ativo"
}

export function mapCustomerStatusToDb(statusLabel: string): string {
  if (statusLabel === "Bloqueado") return "bloqueado"
  if (statusLabel === "Inativo") return "inativo"
  return "ativo"
}

export function stockStatusFromQuantity(stock: number, min = 10): "Esgotado" | "Baixo" | "Normal" {
  if (stock <= 0) return "Esgotado"
  if (stock < min) return "Baixo"
  return "Normal"
}
