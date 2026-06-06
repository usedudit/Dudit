import { formatCurrency } from "@/lib/utils"
import { getDeliveryStatusLabel, getPaymentStatusLabel } from "@/lib/orders/status"
import { mapCustomerStatusLabel, stockStatusFromQuantity } from "./filters"
import type { ExportColumnDef, ExportRow } from "./types"

function formatPaymentMethods(row: any): string {
  const breakdown = Array.isArray(row.payment_breakdown) ? row.payment_breakdown : []
  if (breakdown.length > 0) {
    return breakdown.map((p: any) => String(p.method || p.name || "—")).filter(Boolean).join(", ")
  }
  return String(row.payment_method || "—")
}

function formatItemNames(items: any[] | null | undefined): string {
  if (!Array.isArray(items) || items.length === 0) return "—"
  return items.map((it) => String(it.product_name || it.name || "Item")).join("; ")
}

function calcSubtotal(items: any[]): number {
  return items.reduce((sum, it) => {
    const qty = Number(it.quantity || 0)
    const price = Number(it.product_price ?? it.unit_price ?? 0)
    return sum + Number(it.subtotal ?? qty * price)
  }, 0)
}

function situationLabel(situation: string): string {
  return getPaymentStatusLabel(situation) || situation
}

export const ORDER_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "Pedido", key: "orderNumber", width: 18 },
  { header: "Data", key: "date", width: 20 },
  { header: "Cliente", key: "customer", width: 28 },
  { header: "Vendedor", key: "salesperson", width: 22 },
  { header: "Itens", key: "items", width: 40 },
  { header: "Status Pagamento", key: "paymentStatus", width: 18 },
  { header: "Forma de Pagamento", key: "paymentMethods", width: 24 },
  { header: "Status Entrega", key: "deliveryStatus", width: 18 },
  { header: "Canal", key: "channel", width: 16 },
  { header: "Subtotal", key: "subtotal", width: 14 },
  { header: "Desconto Cupom", key: "couponDiscount", width: 14 },
  { header: "Desconto Pagamento", key: "paymentMethodDiscount", width: 16 },
  { header: "Outros Descontos", key: "otherDiscounts", width: 14 },
  { header: "Taxa Entrega", key: "deliveryFee", width: 14 },
  { header: "Valor Bruto", key: "grossAmount", width: 14 },
  { header: "Total Líquido", key: "netAmount", width: 14 },
]

export function mapOrderRow(row: any, sellerNames: Map<string, string>): ExportRow {
  const items = row.order_items || row.sale_items || []
  const subtotal = Number(row.subtotal ?? calcSubtotal(items))
  const couponDiscount = Number(row.discount_amount ?? row.coupon_discount_amount ?? 0)
  const manualDiscount = Number(row.discount_value ?? 0)
  const paymentMethodDiscount = Number(row.payment_method_discount_amount ?? 0)
  const deliveryFee = Number(row.delivery_fee ?? row.shipping_cost ?? 0)
  const additionalCosts = Number(row.additional_costs ?? 0)
  const grossAmount = subtotal + deliveryFee + additionalCosts
  const netAmount = Number(row.total_amount ?? row.final_amount ?? 0)
  const sellerId = row.created_by || row.finalized_by_user_id || ""

  return {
    orderNumber: row.order_number || row.sale_number || row.id?.slice(0, 8) || "—",
    date: row.created_at ? new Date(row.created_at).toLocaleString("pt-BR") : "—",
    customer: row.customer_name || "Consumidor final",
    salesperson: sellerNames.get(String(sellerId)) || "—",
    items: formatItemNames(items),
    paymentStatus: situationLabel(row.situation || row.payment_status || row.status || "pending"),
    paymentMethods: formatPaymentMethods(row),
    deliveryStatus: getDeliveryStatusLabel(row.delivery_status) || row.delivery_status || "—",
    channel: row.order_source || row.sales_channel || "Presencial",
    subtotal: formatCurrency(subtotal),
    couponDiscount: formatCurrency(couponDiscount),
    paymentMethodDiscount: formatCurrency(paymentMethodDiscount),
    otherDiscounts: formatCurrency(manualDiscount),
    deliveryFee: formatCurrency(deliveryFee),
    grossAmount: formatCurrency(grossAmount),
    netAmount: formatCurrency(netAmount),
  }
}

export const PRODUCT_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "Produto", key: "name", width: 32 },
  { header: "SKU", key: "sku", width: 16 },
  { header: "Categoria", key: "category", width: 20 },
  { header: "Estoque", key: "stock", width: 10 },
  { header: "Custo", key: "cost", width: 14 },
  { header: "Preço", key: "price", width: 14 },
  { header: "Visibilidade", key: "visibility", width: 14 },
  { header: "Status", key: "status", width: 12 },
]

export function mapProductRow(row: any): ExportRow {
  const stock = Number(row.stock_quantity ?? 0)
  return {
    name: row.name || "—",
    sku: row.sku || "—",
    category: row.category?.name || row.category || "—",
    stock,
    cost: formatCurrency(Number(row.cost_price ?? 0)),
    price: formatCurrency(Number(row.price ?? 0)),
    visibility: row.show_in_marketplace === false ? "Oculto" : "Visível",
    status: row.is_active ? "Ativo" : "Inativo",
  }
}

export const CUSTOMER_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "Nome", key: "name", width: 28 },
  { header: "E-mail", key: "email", width: 28 },
  { header: "Telefone", key: "phone", width: 18 },
  { header: "Criado em", key: "createdAt", width: 20 },
  { header: "Total Pedidos", key: "totalOrders", width: 14 },
  { header: "Valor Vitalício", key: "lifetimeValue", width: 16 },
]

export function mapCustomerRow(row: any, stats?: { orders: number; ltv: number }): ExportRow {
  return {
    name: row.name || "—",
    email: row.email || "—",
    phone: row.phone || "—",
    createdAt: row.created_at ? new Date(row.created_at).toLocaleDateString("pt-BR") : "—",
    totalOrders: stats?.orders ?? 0,
    lifetimeValue: formatCurrency(stats?.ltv ?? 0),
  }
}

export const SERVICE_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "Serviço", key: "name", width: 32 },
  { header: "Categoria", key: "category", width: 20 },
  { header: "Preço", key: "price", width: 14 },
  { header: "Duração (min)", key: "duration", width: 14 },
  { header: "Status", key: "status", width: 12 },
]

export function mapServiceRow(row: any): ExportRow {
  return {
    name: row.name || "—",
    category: row.service_categories?.name || "—",
    price: formatCurrency(Number(row.price ?? 0)),
    duration: Number(row.duration_minutes ?? 0),
    status: row.is_active ? "Ativo" : "Inativo",
  }
}

export const APPOINTMENT_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "Data", key: "date", width: 14 },
  { header: "Hora", key: "time", width: 10 },
  { header: "Cliente", key: "customer", width: 28 },
  { header: "Profissional", key: "professional", width: 22 },
  { header: "Serviço", key: "service", width: 28 },
  { header: "Status", key: "status", width: 16 },
  { header: "Status Pagamento", key: "paymentStatus", width: 18 },
  { header: "Canal", key: "salesChannel", width: 14 },
  { header: "Modo Atendimento", key: "fulfillmentMode", width: 18 },
]

export function mapAppointmentRow(row: any): ExportRow {
  return {
    date: row.start_date || "—",
    time: String(row.start_time || "").slice(0, 5),
    customer: row.customer_name || "—",
    professional: row.staff_name || "—",
    service: row.service_name || "—",
    status: row.status || "—",
    paymentStatus: row.payment_status || "—",
    salesChannel: row.sales_channel || "—",
    fulfillmentMode: row.fulfillment_mode || "—",
  }
}

export const SUBSCRIPTION_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "Cliente", key: "customer", width: 28 },
  { header: "Plano", key: "plan", width: 28 },
  { header: "Status", key: "status", width: 14 },
  { header: "Próxima Cobrança", key: "nextBilling", width: 20 },
  { header: "Início", key: "startedAt", width: 20 },
  { header: "Canal", key: "salesChannel", width: 14 },
]

export function mapSubscriptionRow(row: any): ExportRow {
  const statusLabels: Record<string, string> = {
    active: "Ativa",
    paused: "Pausada",
    cancelled: "Cancelada",
    expired: "Expirada",
  }
  return {
    customer: row.customers?.name || row.customer?.name || "—",
    plan: row.recurring_plans?.name || row.plan?.name || "—",
    status: statusLabels[row.status] || row.status || "—",
    nextBilling: row.next_execution_at ? new Date(row.next_execution_at).toLocaleDateString("pt-BR") : "—",
    startedAt: row.started_at ? new Date(row.started_at).toLocaleDateString("pt-BR") : "—",
    salesChannel: row.delivery_type === "delivery" ? "Entrega" : "Retirada",
  }
}

export function applyProductStockFilter(row: any, stockLabels: string[]): boolean {
  if (!stockLabels.length) return true
  const stock = Number(row.stock_quantity ?? 0)
  const min = Number(row.min_stock ?? 10)
  return stockLabels.includes(stockStatusFromQuantity(stock, min))
}

export function applyCustomerStatusFilter(row: any, labels: string[]): boolean {
  if (!labels.length) return true
  return labels.includes(mapCustomerStatusLabel(row.status))
}
