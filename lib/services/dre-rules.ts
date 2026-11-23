export type DreOrderRevenueBucket = "products" | "recurring"

export function getOrderRevenueBucket(orderSource?: string | null): DreOrderRevenueBucket {
  const normalized = String(orderSource || "").trim().toLowerCase()
  return normalized === "assinatura" ? "recurring" : "products"
}

export function isOrderDerivedTransaction(tx?: { kind?: string | null } | null): boolean {
  return String(tx?.kind || "").trim().length > 0
}

// ── Ordens de Serviço ───────────────────────────────────────────────────────

export const SERVICE_ORDER_REALIZED_STATUSES = ["concluida", "entregue"] as const
export const SERVICE_ORDER_CANCELLED_STATUS = "cancelada"

export function normalizeServiceOrderStatus(status?: string | null): string {
  return String(status || "").trim().toLowerCase()
}

export function isRealizedServiceOrder(status?: string | null): boolean {
  return (SERVICE_ORDER_REALIZED_STATUSES as readonly string[]).includes(normalizeServiceOrderStatus(status))
}

export function isCancelledServiceOrder(status?: string | null): boolean {
  return normalizeServiceOrderStatus(status) === SERVICE_ORDER_CANCELLED_STATUS
}

// ── Agendamentos ────────────────────────────────────────────────────────────

export const APPOINTMENT_REALIZED_STATUS = "Concluído"
export const APPOINTMENT_CANCELLED_STATUS = "Cancelado"
export const APPOINTMENT_NO_SHOW_STATUS = "Ausência"

export function normalizeAppointmentStatus(status?: string | null): string {
  const lower = String(status || "").trim().toLowerCase()
  if (lower.includes("cancel")) return APPOINTMENT_CANCELLED_STATUS
  if (
    lower.includes("ausên") ||
    lower.includes("ausencia") ||
    lower.includes("missed") ||
    lower.includes("no_show") ||
    lower.includes("faltou")
  ) {
    return APPOINTMENT_NO_SHOW_STATUS
  }
  if (
    lower.includes("pago") ||
    lower.includes("paid") ||
    lower.includes("conclu") ||
    lower.includes("complet") ||
    lower.includes("finaliz") ||
    lower.includes("atendid")
  ) {
    return APPOINTMENT_REALIZED_STATUS
  }
  if (lower.includes("andamento") || lower.includes("iniciado") || lower.includes("started")) return "Em andamento"
  if (lower.includes("confirm")) return "Confirmado"
  if (lower.includes("aguard")) return "Aguardando"
  if (lower.includes("reservado") || lower.includes("reserved")) return "Reservado"
  return "Agendado"
}

export function isRealizedAppointment(status?: string | null): boolean {
  return normalizeAppointmentStatus(status) === APPOINTMENT_REALIZED_STATUS
}

export function isExcludedAppointmentFromRevenue(status?: string | null): boolean {
  const normalized = normalizeAppointmentStatus(status)
  return normalized === APPOINTMENT_CANCELLED_STATUS || normalized === APPOINTMENT_NO_SHOW_STATUS
}

// ── Pedidos Online ──────────────────────────────────────────────────────────

const ORDER_UNRECOGNIZED_SITUATIONS = new Set([
  "cancelled",
  "canceled",
  "cancelada",
  "cancelado",
  "pending",
  "pending_payment",
  "awaiting_payment",
  "not_paid",
  "in_process",
  "refunded",
  "refund",
])

export function isOrderRevenueRecognized(situation?: string | null): boolean {
  const normalized = String(situation || "").trim().toLowerCase()
  if (!normalized) return false
  return !ORDER_UNRECOGNIZED_SITUATIONS.has(normalized)
}

export function isOrderCashCollected(situation?: string | null): boolean {
  const normalized = String(situation || "").trim().toLowerCase()
  return normalized === "paid" || normalized === "partially_paid"
}

// ── Deduplicação: OS/agendamentos também geram pedidos e vendas ─────────────
// A OS cria um pedido (order_source "Ordem de Serviço") e uma venda
// (origin_type "service_order"). Sem isso, a receita é contada em dobro.

const SERVICE_ORDER_ORDER_SOURCES = new Set(["ordem de serviço", "admin_service_order"])

export function isServiceOrderLinkedOrder(
  order?: { order_source?: string | null; source_service_order_id?: string | null } | null,
): boolean {
  if (!order) return false
  if (order.source_service_order_id) return true
  return SERVICE_ORDER_ORDER_SOURCES.has(String(order.order_source || "").trim().toLowerCase())
}

export function isServiceOrderOriginSale(sale?: { origin_type?: string | null } | null): boolean {
  return String(sale?.origin_type || "").trim().toLowerCase() === "service_order"
}

// ── Assinaturas: cobrança do ciclo vs resgate de créditos ────────────────────
// No modelo de créditos da Dudit:
// 1. O pedido gerado pelo ciclo (`recurring_execution_id`) é a COBRANÇA da
//    mensalidade -> reconhece Receita Recorrente, mas NÃO baixa CMV (o estoque
//    não sai nesse pedido).
// 2. O pedido de resgate ("Assinatura (Créditos)" / `subscription_credits`) é a
//    ENTREGA/CONSUMO dos créditos já pagos -> Receita R$ 0 (evita duplicação),
//    mas baixa CMV/CSP real dos itens entregues.

function isSubscriptionCreditLabel(value?: string | null): boolean {
  const norm = String(value || "").trim().toLowerCase()
  if (!norm) return false
  return norm.includes("assinatura") || norm.includes("subscription")
}

export function isSubscriptionCreditOrder(
  order?: {
    payment_method?: string | null
    payment_breakdown?: Array<{ method?: string | null; paymentType?: string | null }> | null
  } | null,
): boolean {
  if (!order) return false
  if (isSubscriptionCreditLabel(order.payment_method)) return true
  if (Array.isArray(order.payment_breakdown)) {
    for (const entry of order.payment_breakdown) {
      if (String(entry?.paymentType || "").trim().toLowerCase() === "subscription_credits") return true
      if (isSubscriptionCreditLabel(entry?.method)) return true
    }
  }
  return false
}

export function isSubscriptionCycleBillingOrder(
  order?: {
    recurring_execution_id?: string | null
    payment_method?: string | null
    payment_breakdown?: Array<{ method?: string | null; paymentType?: string | null }> | null
  } | null,
): boolean {
  if (!order) return false
  if (!order.recurring_execution_id) return false
  return !isSubscriptionCreditOrder(order)
}

// ── Devoluções (return_requests): reembolso + crédito em loja (vale-compra) ─
// Crédito em loja / vale-compra é forma de pagamento na nova compra (receita
// normal). Para o DRE fechar sem duplicar receita, a devolução que originou o
// crédito (ou reembolso) entra em Deduções da Receita Bruta — desde que o
// pedido original não tenha sido cancelado/estornado na própria receita bruta.

export interface ReturnRequestDreImpact {
  deductionAmount: number
  cogsProductsReversal: number
  cogsServicesReversal: number
}

export function computeReturnRequestDreImpact(
  rr?: {
    status?: string | null
    approved_resolution?: string | null
    refund_amount?: number | string | null
    store_credit_amount?: number | string | null
    inventory_movement_id?: string | null
    orders?: { situation?: string | null } | Array<{ situation?: string | null }> | null
    return_items?: Array<{
      quantity?: number | string | null
      order_items?:
        | { unit_cost?: number | string | null; service_id?: string | null; line_type?: string | null }
        | Array<{ unit_cost?: number | string | null; service_id?: string | null; line_type?: string | null }>
        | null
    }> | null
  } | null,
): ReturnRequestDreImpact {
  const zero: ReturnRequestDreImpact = { deductionAmount: 0, cogsProductsReversal: 0, cogsServicesReversal: 0 }
  if (!rr) return zero

  const status = String(rr.status || "").trim().toUpperCase()
  if (status !== "RESOLVED") return zero

  const resolution = String(rr.approved_resolution || "").trim().toLowerCase()
  if (resolution === "rejected" || resolution === "none") return zero

  const linkedOrder = Array.isArray(rr.orders) ? rr.orders[0] : rr.orders
  if (linkedOrder?.situation && !isOrderRevenueRecognized(linkedOrder.situation)) {
    // Pedido original já foi excluído da Receita Bruta (ex.: cancelled/refunded)
    return zero
  }

  const refundVal = Math.max(0, Number(rr.refund_amount || 0))
  const storeCreditVal = Math.max(0, Number(rr.store_credit_amount || 0))
  const deductionAmount = refundVal + storeCreditVal

  let cogsProductsReversal = 0
  let cogsServicesReversal = 0

  // Estorna CMV somente se houve retorno físico ao estoque
  if (rr.inventory_movement_id && Array.isArray(rr.return_items)) {
    for (const ri of rr.return_items) {
      const qty = Math.max(0, Number(ri?.quantity || 0))
      if (qty <= 0) continue
      const oi = Array.isArray(ri.order_items) ? ri.order_items[0] : ri.order_items
      const unitCost = Math.max(0, Number(oi?.unit_cost || 0))
      if (unitCost <= 0) continue
      const isServiceLine = Boolean(oi?.service_id) || oi?.line_type === "service_booking"
      if (isServiceLine) {
        cogsServicesReversal += qty * unitCost
      } else {
        cogsProductsReversal += qty * unitCost
      }
    }
  }

  return { deductionAmount, cogsProductsReversal, cogsServicesReversal }
}

export function isPaidAmountSettled(paymentStatus?: string | null, paidAmount?: number | string | null): boolean {
  const normalized = String(paymentStatus || "").trim().toLowerCase()
  if (normalized === "paid" || normalized === "partially_paid") return true
  return Number(paidAmount || 0) > 0
}

// ── Valor de OS: bruto (nominal), descontos e líquido ───────────────────────
// Regra canônica em app/actions/erp/service-orders.ts:
//   finalTotal = max(0, (serviços + produtos) - desconto + outros custos)
// Logo, o desconto concedido = (serviços + produtos + outros custos) - total.

export interface ServiceOrderAmounts {
  productsRevenue: number
  servicesRevenue: number
  discount: number
  net: number
}

export function computeServiceOrderAmounts(
  so?: {
    total_service_amount?: number | string | null
    total_product_amount?: number | string | null
    total_amount?: number | string | null
    other_costs?: number | string | null
  } | null,
): ServiceOrderAmounts {
  const num = (value: unknown): number => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (!so) return { productsRevenue: 0, servicesRevenue: 0, discount: 0, net: 0 }

  const services = num(so.total_service_amount)
  const products = num(so.total_product_amount)
  const otherCosts = num(so.other_costs)
  const net = num(so.total_amount)
  const gross = services + products + otherCosts

  return {
    productsRevenue: products,
    servicesRevenue: services + otherCosts,
    discount: Math.max(0, gross - net),
    net,
  }
}

// ── DAS-MEI: valor fixo mensal rateado pelo período selecionado ─────────────
// O DAS do MEI é um valor fixo por mês; em períodos parciais rateamos por dia.

export function computeProratedMonthlyTax(monthlyAmount: number, startDate: string, endDate: string): number {
  const amount = Number(monthlyAmount)
  if (!Number.isFinite(amount) || amount <= 0) return 0

  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) return 0

  const MS_PER_DAY = 86_400_000
  let total = 0
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))

  while (cursor.getTime() <= end.getTime()) {
    const year = cursor.getUTCFullYear()
    const month = cursor.getUTCMonth()
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const monthStart = Date.UTC(year, month, 1)
    const monthEnd = Date.UTC(year, month, daysInMonth)

    const overlapStart = Math.max(monthStart, start.getTime())
    const overlapEnd = Math.min(monthEnd, end.getTime())
    const overlapDays = Math.floor((overlapEnd - overlapStart) / MS_PER_DAY) + 1
    if (overlapDays > 0) total += (amount * overlapDays) / daysInMonth

    cursor = new Date(Date.UTC(year, month + 1, 1))
  }

  return Number(total.toFixed(2))
}

// ── Rótulo de regime tributário (alinhado a person_type + crt) ──────────────
// person_type: 'pf' | 'pj' | 'foreign'  /  crt: '1'..'4'

export function getTaxRegimeLabel(personType?: string | null, crt?: string | null): string {
  const type = String(personType || "").trim().toLowerCase()
  const code = String(crt ?? "").trim()

  if (type === "foreign") return "Pessoa Estrangeira"
  if (type === "pf") return "Pessoa Física (CPF)"
  if (code === "4") return "MEI (SIMEI)"
  if (code === "1" || code === "2") return "Simples Nacional"
  if (code === "3") return "Lucro Presumido / Lucro Real"
  return "Pessoa Jurídica"
}
