import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { getDeliveryStatusLabel, getPaymentStatusLabel, getSalesChannelLabel, getFulfillmentModeLabel } from "@/lib/orders/status"
import { mapCustomerStatusLabel, stockStatusFromQuantity } from "./filters"
import type { ExportColumnDef, ExportRow } from "./types"

function formatPaymentMethods(row: any): string {
  const breakdown = Array.isArray(row.payment_breakdown) ? row.payment_breakdown : []
  if (breakdown.length > 0) {
    return breakdown.map((p: any) => String(p.method || p.name || "-")).filter(Boolean).join(", ")
  }
  return String(row.payment_method || "-")
}

function formatItemNames(items: any[] | null | undefined): string {
  if (!Array.isArray(items) || items.length === 0) return "-"
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

export const ORDER_EXPORT_ALL_COLUMNS: ExportColumnDef[] = [
  ...ORDER_EXPORT_COLUMNS,
  { header: "ID", key: "id", width: 36 },
  { header: "Tipo de Entrega", key: "deliveryType", width: 14 },
  { header: "Endereço de Entrega", key: "deliveryAddress", width: 30 },
  { header: "Valor Pago", key: "paidAmount", width: 14 },
  { header: "Acréscimo Pagto", key: "paymentMethodExtra", width: 16 },
  { header: "Observações", key: "notes", width: 30 },
]

export function mapOrderRow(
  row: any,
  sellerNames: Map<string, string>,
  includeAllColumns?: boolean,
): ExportRow {
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

  const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers
  const resolvedCustomer = (row.customer_name && row.customer_name !== "Consumidor final")
    ? row.customer_name
    : (cust?.name || cust?.email || row.customer_name || "Consumidor final")

  const base = {
    orderNumber: row.order_number || row.sale_number || row.id?.slice(0, 8) || "-",
    date: row.created_at ? formatDateTime(row.created_at) : "-",
    customer: resolvedCustomer,
    salesperson: sellerNames.get(String(sellerId)) || "-",
    items: formatItemNames(items),
    paymentStatus: situationLabel(row.situation || row.payment_status || row.status || "pending"),
    paymentMethods: formatPaymentMethods(row),
    deliveryStatus: getDeliveryStatusLabel(row.delivery_status) || row.delivery_status || "-",
    channel: row.order_source || row.sales_channel || "Presencial",
    subtotal: formatCurrency(subtotal),
    couponDiscount: formatCurrency(couponDiscount),
    paymentMethodDiscount: formatCurrency(paymentMethodDiscount),
    otherDiscounts: formatCurrency(manualDiscount),
    deliveryFee: formatCurrency(deliveryFee),
    grossAmount: formatCurrency(grossAmount),
    netAmount: formatCurrency(netAmount),
  }

  if (!includeAllColumns) return base

  return {
    ...base,
    id: row.id || "-",
    deliveryType: row.delivery_type === "delivery" ? "Entrega" : "Retirada",
    deliveryAddress: row.delivery_address || "-",
    paidAmount: formatCurrency(Number(row.paid_amount ?? 0)),
    paymentMethodExtra: formatCurrency(Number(row.payment_method_extra_amount ?? 0)),
    notes: row.notes || row.internal_notes || "-",
  }
}

export const PRODUCT_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "Nome do Produto", key: "name", width: 32 },
  { header: "SKU / Código", key: "sku", width: 16 },
  { header: "Código de Barras (GTIN/EAN)", key: "gtin", width: 22 },
  { header: "Preço de Venda", key: "price", width: 14 },
  { header: "Preço de Custo", key: "cost", width: 14 },
  { header: "Preço Promocional", key: "promotionalPrice", width: 16 },
  { header: "Estoque Atual", key: "stock", width: 12 },
  { header: "Status", key: "status", width: 12 },
  { header: "Visibilidade na Loja", key: "visibility", width: 16 },
]

export const PRODUCT_EXPORT_ALL_COLUMNS: ExportColumnDef[] = [
  ...PRODUCT_EXPORT_COLUMNS,
  { header: "Estoque Mínimo", key: "minStock", width: 14 },
  { header: "Unidade de Medida", key: "unit", width: 14 },
  { header: "Marca", key: "brand", width: 20 },
  { header: "Descrição", key: "description", width: 40 },
  { header: "Tipo de Produto", key: "productType", width: 16 },
  { header: "Condição", key: "condition", width: 14 },
  { header: "Categoria", key: "category", width: 20 },
  { header: "NCM", key: "ncm", width: 12 },
  { header: "CEST", key: "cest", width: 12 },
  { header: "Peso Bruto (g)", key: "weightGross", width: 14 },
  { header: "Peso Líquido (g)", key: "weightNet", width: 14 },
  { header: "Largura (cm)", key: "width", width: 12 },
  { header: "Altura (cm)", key: "height", width: 12 },
  { header: "Comprimento (cm)", key: "length", width: 14 },
]

export function mapProductRow(row: any, includeAllColumns?: boolean): ExportRow {
  const base = {
    name: row.name || "-",
    sku: row.sku || "-",
    gtin: row.gtin || "-",
    price: formatCurrency(Number(row.price ?? 0)),
    cost: formatCurrency(Number(row.cost_price ?? 0)),
    promotionalPrice: row.promotional_price !== null && row.promotional_price !== undefined ? formatCurrency(Number(row.promotional_price)) : "-",
    stock: Number(row.stock_quantity ?? 0),
    status: row.is_active ? "Ativo" : "Inativo",
    visibility: row.show_in_marketplace === false ? "Não" : "Sim",
  }

  if (!includeAllColumns) return base

  return {
    ...base,
    minStock: Number(row.min_stock ?? 0),
    unit: row.unit || "-",
    brand: row.brand_rel?.name || row.brand || "-",
    description: row.description || "-",
    productType: row.product_type || "-",
    condition: row.condition || "-",
    category: row.category || "-",
    ncm: row.ncm || "-",
    cest: row.cest || "-",
    weightGross: row.weight_gross !== null && row.weight_gross !== undefined ? String(row.weight_gross) : "-",
    weightNet: row.weight_net !== null && row.weight_net !== undefined ? String(row.weight_net) : "-",
    width: row.width !== null && row.width !== undefined ? String(row.width) : "-",
    height: row.height !== null && row.height !== undefined ? String(row.height) : "-",
    length: row.length !== null && row.length !== undefined ? String(row.length) : "-",
  }
}

export const CUSTOMER_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "Nome / Razão Social", key: "name", width: 30 },
  { header: "Tipo de Pessoa", key: "personType", width: 14 },
  { header: "CPF", key: "cpf", width: 18 },
  { header: "CNPJ", key: "cnpj", width: 20 },
  { header: "E-mail", key: "email", width: 28 },
  { header: "Celular / WhatsApp", key: "phone", width: 18 },
  { header: "Status", key: "status", width: 12 },
  { header: "Cidade", key: "city", width: 20 },
  { header: "Estado (UF)", key: "state", width: 10 },
]

export const CUSTOMER_EXPORT_ALL_COLUMNS: ExportColumnDef[] = [
  ...CUSTOMER_EXPORT_COLUMNS,
  { header: "Telefone Fixo", key: "phoneFixed", width: 18 },
  { header: "Data de Nascimento", key: "birthDate", width: 16 },
  { header: "CEP", key: "zipCode", width: 12 },
  { header: "Logradouro (Rua/Av)", key: "street", width: 30 },
  { header: "Número", key: "number", width: 10 },
  { header: "Complemento", key: "complement", width: 16 },
  { header: "Bairro", key: "neighborhood", width: 20 },
  { header: "Inscrição Estadual", key: "stateInscription", width: 18 },
  { header: "Observações", key: "notes", width: 30 },
]

export function mapCustomerRow(row: any, includeAllColumns?: boolean): ExportRow {
  const isPJ = String(row.person_type || "").toLowerCase() === "pj"
  const statusMap: Record<string, string> = { ativo: "Ativo", inativo: "Inativo", bloqueado: "Bloqueado" }
  const addr = Array.isArray(row.addresses) ? row.addresses[0] : row.addresses || {}

  const base = {
    name: row.name || "-",
    personType: isPJ ? "Jurídica" : "Física",
    cpf: row.cpf || "-",
    cnpj: row.cnpj || "-",
    email: row.email || "-",
    phone: row.phone || "-",
    status: statusMap[row.status] || row.status || "Ativo",
    city: addr.city || "-",
    state: addr.state || "-",
  }

  if (!includeAllColumns) return base

  return {
    ...base,
    phoneFixed: row.phone_fixed || "-",
    birthDate: row.birth_date ? formatDate(row.birth_date) : "-",
    zipCode: addr.zip_code || "-",
    street: addr.street || "-",
    number: addr.number || "-",
    complement: addr.complement || "-",
    neighborhood: addr.neighborhood || "-",
    stateInscription: row.inscricao_estadual || "-",
    notes: row.notes || "-",
  }
}

export const SERVICE_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "Nome do Serviço", key: "name", width: 32 },
  { header: "SKU / Código", key: "sku", width: 16 },
  { header: "Preço", key: "price", width: 14 },
  { header: "Preço de Custo", key: "cost", width: 14 },
  { header: "Duração (minutos)", key: "duration", width: 16 },
  { header: "Categoria", key: "category", width: 20 },
  { header: "Tipo de Atendimento", key: "serviceType", width: 18 },
  { header: "Status", key: "status", width: 12 },
  { header: "Unidade", key: "unit", width: 12 },
  { header: "Descrição", key: "description", width: 40 },
]

const SERVICE_TYPE_LABELS: Record<string, string> = {
  in_person: "Presencial",
  online: "Online",
  hybrid: "Híbrido",
}

export function mapServiceRow(row: any): ExportRow {
  return {
    name: row.name || "-",
    sku: row.sku || "-",
    price: formatCurrency(Number(row.price ?? 0)),
    cost: formatCurrency(Number(row.cost_price ?? 0)),
    duration: Number(row.duration_minutes ?? 0),
    category: row.service_categories?.name || "-",
    serviceType: SERVICE_TYPE_LABELS[row.service_type] || row.service_type || "-",
    status: row.is_active ? "Ativo" : "Inativo",
    unit: row.unit || "-",
    description: row.description || "-",
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

export const APPOINTMENT_EXPORT_ALL_COLUMNS: ExportColumnDef[] = [
  ...APPOINTMENT_EXPORT_COLUMNS,
  { header: "Data Fim", key: "endDate", width: 14 },
  { header: "Hora Fim", key: "endTime", width: 10 },
  { header: "Duração (min)", key: "duration", width: 14 },
  { header: "Preço", key: "price", width: 14 },
  { header: "Preço Unit.", key: "pricingUnit", width: 14 },
  { header: "Valor Pago", key: "paidAmount", width: 14 },
  { header: "Observações", key: "notes", width: 30 },
  { header: "Criado em", key: "createdAt", width: 20 },
]

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  booked: "Reservado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não Compareceu",
  in_progress: "Em Andamento",
  pending: "Pendente",
}

export function mapAppointmentRow(row: any, includeAllColumns?: boolean): ExportRow {
  const base = {
    date: row.start_date || "-",
    time: String(row.start_time || "").slice(0, 5),
    customer: row.customer_name || "-",
    professional: row.staff_name || "-",
    service: row.service_name || "-",
    status: APPOINTMENT_STATUS_LABELS[row.status] || row.status || "-",
    paymentStatus: getPaymentStatusLabel(row.payment_status) || row.payment_status || "-",
    salesChannel: getSalesChannelLabel(row.sales_channel) || row.sales_channel || "-",
    fulfillmentMode: getFulfillmentModeLabel(row.fulfillment_mode) || row.fulfillment_mode || "-",
  }

  if (!includeAllColumns) return base

  return {
    ...base,
    endDate: row.end_date || "-",
    endTime: String(row.end_time || "").slice(0, 5),
    duration: Number(row.duration_minutes ?? 0),
    price: formatCurrency(Number(row.price ?? 0)),
    pricingUnit: row.pricing_unit || "-",
    paidAmount: formatCurrency(Number(row.paid_amount ?? 0)),
    notes: row.notes || "-",
    createdAt: row.created_at ? formatDateTime(row.created_at) : "-",
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

export const SUBSCRIPTION_EXPORT_ALL_COLUMNS: ExportColumnDef[] = [
  ...SUBSCRIPTION_EXPORT_COLUMNS,
  { header: "Última Cobrança", key: "lastExecution", width: 20 },
  { header: "Pausada em", key: "pausedAt", width: 20 },
  { header: "Cancelada em", key: "cancelledAt", width: 20 },
  { header: "Endereço de Entrega", key: "deliveryAddress", width: 30 },
  { header: "Observações", key: "notes", width: 30 },
  { header: "Criado em", key: "createdAt", width: 20 },
]

export function mapSubscriptionRow(row: any, includeAllColumns?: boolean): ExportRow {
  const statusLabels: Record<string, string> = {
    active: "Ativa",
    paused: "Pausada",
    cancelled: "Cancelada",
    expired: "Expirada",
  }
  const base = {
    customer: row.customers?.name || row.customer?.name || "-",
    plan: row.recurring_plans?.name || row.plan?.name || "-",
    status: statusLabels[row.status] || row.status || "-",
    nextBilling: row.next_execution_at ? formatDate(row.next_execution_at) : "-",
    startedAt: row.started_at ? formatDate(row.started_at) : "-",
    salesChannel: row.delivery_type === "delivery" ? "Entrega" : "Retirada",
  }

  if (!includeAllColumns) return base

  return {
    ...base,
    lastExecution: row.last_execution_at ? formatDate(row.last_execution_at) : "-",
    pausedAt: row.paused_at ? formatDate(row.paused_at) : "-",
    cancelledAt: row.cancelled_at ? formatDate(row.cancelled_at) : "-",
    deliveryAddress: row.delivery_address || "-",
    notes: row.notes || "-",
    createdAt: row.created_at ? formatDateTime(row.created_at) : "-",
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

// ── Returns (Devoluções) ─────────────────────────────────────────────

export const RETURN_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "ID", key: "id", width: 36 },
  { header: "Data", key: "date", width: 20 },
  { header: "Cliente", key: "customer", width: 28 },
  { header: "Pedido", key: "orderNumber", width: 18 },
  { header: "Tipo", key: "requestType", width: 20 },
  { header: "Resolução", key: "resolution", width: 20 },
  { header: "Status", key: "status", width: 18 },
  { header: "Valor", key: "amount", width: 14 },
  { header: "Motivo", key: "reason", width: 30 },
]

export const RETURN_EXPORT_ALL_COLUMNS: ExportColumnDef[] = [
  ...RETURN_EXPORT_COLUMNS,
  { header: "E-mail Cliente", key: "customerEmail", width: 28 },
  { header: "Vendedor", key: "seller", width: 22 },
  { header: "Valor do Pedido", key: "orderTotal", width: 14 },
  { header: "Crédito Loja", key: "storeCredit", width: 14 },
  { header: "Valor Troca", key: "exchangeAmount", width: 14 },
  { header: "Mensagem Cliente", key: "customerMessage", width: 30 },
  { header: "Obs. Vendedor", key: "sellerNotes", width: 30 },
  { header: "Obs. Internas", key: "internalNotes", width: 30 },
  { header: "Resolvido em", key: "resolvedAt", width: 20 },
  { header: "Rejeitado em", key: "rejectedAt", width: 20 },
  { header: "Expira em", key: "expiresAt", width: 20 },
]

const RETURN_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: "Pendente",
  UNDER_ANALYSIS: "Em Análise",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  WAITING_CUSTOMER: "Aguardando Cliente",
  WAITING_ITEM_RETURN: "Aguardando Item",
  PROCESSING: "Processando",
  RESOLVED: "Resolvido",
  EXPIRED: "Expirado",
  ESCALATED: "Escalado",
}

const RETURN_REQUEST_TYPE_LABELS: Record<string, string> = {
  cancellation: "Cancelamento",
  return: "Devolução",
  exchange: "Troca",
  refund: "Reembolso",
  store_credit: "Crédito na Loja",
}

const RETURN_RESOLUTION_LABELS: Record<string, string> = {
  exchange: "Troca",
  refund: "Reembolso",
  store_credit: "Crédito na Loja",
  none: "Nenhum",
  rejected: "Rejeitado",
}

export function mapReturnRow(row: any, includeAllColumns?: boolean): ExportRow {
  const rawStatus = row.status || ""
  const base = {
    id: row.id?.slice(0, 8) || "-",
    date: row.created_at ? formatDateTime(row.created_at) : "-",
    customer: row.customer_name_snapshot || "-",
    orderNumber: row.order_number_snapshot || row.orders?.order_number || "-",
    requestType: RETURN_REQUEST_TYPE_LABELS[row.request_type] || row.request_type || "-",
    resolution: RETURN_RESOLUTION_LABELS[row.desired_resolution] || row.desired_resolution || "-",
    status: RETURN_STATUS_LABELS[rawStatus] || rawStatus || "-",
    amount: formatCurrency(Number(row.refund_amount ?? row.store_credit_amount ?? 0)),
    reason: row.customer_reason || row.reason || "-",
  }

  if (!includeAllColumns) return base

  return {
    ...base,
    customerEmail: row.customer_email_snapshot || "-",
    seller: row.seller_name_snapshot || "-",
    orderTotal: formatCurrency(Number(row.order_total_snapshot ?? 0)),
    storeCredit: formatCurrency(Number(row.store_credit_amount ?? 0)),
    exchangeAmount: formatCurrency(Number(row.exchange_shortfall_amount ?? 0)),
    customerMessage: row.customer_message || "-",
    sellerNotes: row.seller_notes || "-",
    internalNotes: row.internal_notes || "-",
    resolvedAt: row.resolved_at ? formatDateTime(row.resolved_at) : "-",
    rejectedAt: row.rejected_at ? formatDateTime(row.rejected_at) : "-",
    expiresAt: row.expires_at ? formatDateTime(row.expires_at) : "-",
  }
}

// ── Stock Movements (Movimentação de Estoque) ────────────────────────

export const STOCK_MOVEMENT_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "Data", key: "date", width: 20 },
  { header: "Tipo", key: "movementType", width: 16 },
  { header: "Produto", key: "product", width: 28 },
  { header: "SKU", key: "sku", width: 16 },
  { header: "Quantidade", key: "quantity", width: 12 },
  { header: "Motivo", key: "reason", width: 22 },
  { header: "Referência", key: "reference", width: 18 },
  { header: "Responsável", key: "createdBy", width: 22 },
]

export const STOCK_MOVEMENT_EXPORT_ALL_COLUMNS: ExportColumnDef[] = [
  ...STOCK_MOVEMENT_EXPORT_COLUMNS,
  { header: "Observações", key: "notes", width: 30 },
  { header: "Tipo Referência", key: "referenceType", width: 18 },
  { header: "ID", key: "id", width: 36 },
]

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  sale: "Venda",
  return: "Devolução",
  adjustment: "Ajuste",
  purchase: "Compra",
  damage: "Danificado",
  loss: "Perda",
  in: "Entrada",
  out: "Saída",
}

const REFERENCE_TYPE_LABELS: Record<string, string> = {
  customer: "Cliente",
  supplier: "Fornecedor",
  internal: "Interno",
}

export function mapStockMovementRow(row: any, includeAllColumns?: boolean): ExportRow {
  const items = row.stock_movement_items || []
  const productNames = items.map((i: any) => i.products?.name || i.product_name || "-").filter(Boolean).join("; ")
  const skus = items.map((i: any) => i.products?.sku || i.sku || "").filter(Boolean).join("; ")
  const totalQty = items.reduce((s: number, i: any) => s + Number(i.quantity || 0), 0)
  const base = {
    date: row.created_at ? formatDateTime(row.created_at) : "-",
    movementType: MOVEMENT_TYPE_LABELS[row.movement_type] || row.movement_type || "-",
    product: productNames || "-",
    sku: skus || "-",
    quantity: totalQty || Number(row.quantity || 0),
    reason: row.reason || "-",
    reference: row.reference_name || row.orders?.order_number || "-",
    createdBy: row.user_profiles?.full_name || row.created_by_name || "-",
  }

  if (!includeAllColumns) return base

  return {
    ...base,
    notes: row.notes || "-",
    referenceType: REFERENCE_TYPE_LABELS[row.reference_type] || row.reference_type || "-",
    id: row.id || "-",
  }
}

// ── Transactions (Transações Financeiras) ────────────────────────────

export const TRANSACTION_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "Data", key: "date", width: 20 },
  { header: "Descrição", key: "description", width: 32 },
  { header: "Categoria", key: "category", width: 20 },
  { header: "Tipo", key: "transactionType", width: 16 },
  { header: "Valor", key: "amount", width: 14 },
  { header: "Status", key: "status", width: 14 },
  { header: "Vencimento", key: "dueDate", width: 16 },
  { header: "Pagamento", key: "paymentDate", width: 16 },
  { header: "Conta", key: "account", width: 20 },
  { header: "Forma Pagto.", key: "paymentType", width: 18 },
]

export const TRANSACTION_EXPORT_ALL_COLUMNS: ExportColumnDef[] = [
  ...TRANSACTION_EXPORT_COLUMNS,
  { header: "Observações", key: "notes", width: 30 },
  { header: "Contato", key: "contact", width: 24 },
  { header: "Tipo Contato", key: "contactType", width: 16 },
  { header: "Origem", key: "origin", width: 14 },
  { header: "Referência", key: "referenceNote", width: 24 },
  { header: "Desconto", key: "discountAmount", width: 14 },
  { header: "Valor Pago", key: "paidAmount", width: 14 },
  { header: "Parcela", key: "installment", width: 12 },
  { header: "Atualizado em", key: "updatedAt", width: 20 },
]

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência",
  adjustment: "Ajuste",
  refund: "Reembolso",
}

const TRANSACTION_STATUS_LABELS: Record<string, string> = {
  paid: "Pago",
  pending: "Pendente",
  cancelled: "Cancelado",
}

export function mapTransactionRow(row: any, includeAllColumns?: boolean): ExportRow {
  const base = {
    date: row.created_at ? formatDateTime(row.created_at) : "-",
    description: row.description || "-",
    category: row.financial_categories?.name || row.category || "-",
    transactionType: TRANSACTION_TYPE_LABELS[row.transaction_type] || row.transaction_type || "-",
    amount: formatCurrency(Number(row.amount ?? 0)),
    status: TRANSACTION_STATUS_LABELS[row.status] || row.status || "-",
    dueDate: row.due_date ? formatDate(row.due_date) : "-",
    paymentDate: row.payment_date ? formatDate(row.payment_date) : "-",
    account: row.financial_accounts?.name || row.account_name || "-",
    paymentType: row.payment_methods?.name || row.payment_type || "-",
  }

  if (!includeAllColumns) return base

  const contactName = row.customers?.name || row.transaction_contacts?.name || row.contact_name || "-"
  const installment = row.total_installments
    ? `${row.installment_number || 1}/${row.total_installments}`
    : "-"

  return {
    ...base,
    notes: row.notes || "-",
    contact: contactName,
    contactType: row.contact_type || "-",
    origin: row.origin || "-",
    referenceNote: row.reference_note || "-",
    discountAmount: formatCurrency(Number(row.discount_amount ?? 0)),
    paidAmount: formatCurrency(Number(row.paid_amount ?? 0)),
    installment,
    updatedAt: row.updated_at ? formatDateTime(row.updated_at) : "-",
  }
}

// ── Suppliers (Fornecedores) ─────────────────────────────────────────

export const SUPPLIER_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "Nome", key: "name", width: 28 },
  { header: "Email", key: "email", width: 28 },
  { header: "Telefone", key: "phone", width: 18 },
  { header: "CPF/CNPJ", key: "document", width: 18 },
  { header: "Cidade", key: "city", width: 20 },
  { header: "UF", key: "state", width: 6 },
  { header: "Status", key: "status", width: 12 },
  { header: "Cadastro", key: "createdAt", width: 16 },
]

export const SUPPLIER_EXPORT_ALL_COLUMNS: ExportColumnDef[] = [
  ...SUPPLIER_EXPORT_COLUMNS,
  { header: "Código", key: "supplierCode", width: 14 },
  { header: "Pessoa", key: "personType", width: 8 },
  { header: "Nome Fantasia", key: "fantasyName", width: 24 },
  { header: "Inscrição Estadual", key: "stateInscription", width: 18 },
  { header: "Regime Tributário", key: "taxRegime", width: 18 },
  { header: "País", key: "country", width: 14 },
  { header: "CEP", key: "zipCode", width: 12 },
  { header: "Endereço", key: "address", width: 40 },
  { header: "Bairro", key: "neighborhood", width: 20 },
  { header: "Número", key: "number", width: 10 },
  { header: "Complemento", key: "complement", width: 20 },
  { header: "Observações", key: "notes", width: 30 },
]

export function mapSupplierRow(row: any, includeAllColumns?: boolean): ExportRow {
  const isPJ = String(row.person_type || "").toLowerCase() === "pj" || Boolean(row.cnpj)

  const base = {
    name: row.name || "-",
    email: row.email || "-",
    phone: row.phone || "-",
    document: row.cnpj || row.cpf || "-",
    city: row.city || row.street || "-",
    state: row.state || "-",
    status: row.status === "ativo" ? "Ativo" : row.status === "inativo" ? "Inativo" : row.status || "-",
    createdAt: row.created_at ? formatDate(row.created_at) : "-",
  }

  if (!includeAllColumns) return base

  const addressParts = [row.street, row.number, row.complement, row.neighborhood].filter(Boolean)
  return {
    ...base,
    supplierCode: row.supplier_code || "-",
    personType: isPJ ? "PJ" : "PF",
    fantasyName: row.nome_fantasia || "-",
    stateInscription: row.inscricao_estadual || "-",
    taxRegime: row.crt ? `CRT ${row.crt}` : row.regime_tributario || "-",
    country: row.country || "-",
    zipCode: row.zip_code || "-",
    address: addressParts.join(", ") || row.address || "-",
    neighborhood: row.neighborhood || "-",
    number: row.number || "-",
    complement: row.complement || "-",
    notes: row.notes || "-",
  }
}

// ── Service Orders (Ordens de Serviço) ───────────────────────────────

export const SERVICE_ORDER_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "Nº OS", key: "orderNumber", width: 14 },
  { header: "Cliente", key: "customer", width: 28 },
  { header: "Título", key: "title", width: 28 },
  { header: "Status", key: "status", width: 20 },
  { header: "Técnico", key: "assignedUser", width: 22 },
  { header: "Previsão", key: "expectedCompletion", width: 16 },
  { header: "Valor", key: "totalAmount", width: 14 },
  { header: "Criação", key: "createdAt", width: 20 },
]

export const SERVICE_ORDER_EXPORT_ALL_COLUMNS: ExportColumnDef[] = [
  ...SERVICE_ORDER_EXPORT_COLUMNS,
  { header: "Descrição", key: "description", width: 40 },
  { header: "Obs. Internas", key: "internalNotes", width: 30 },
  { header: "Total Serviços", key: "totalServiceAmount", width: 16 },
  { header: "Total Produtos", key: "totalProductAmount", width: 16 },
  { header: "Concluída em", key: "completedAt", width: 20 },
  { header: "ID", key: "id", width: 36 },
]

const SERVICE_ORDER_STATUS_LABELS: Record<string, string> = {
  aberta: "Aberta",
  aguardando_aprovacao: "Aguardando Aprovação",
  aprovada: "Aprovada",
  em_andamento: "Em Andamento",
  aguardando_peca: "Aguardando Peça",
  concluida: "Concluída",
  entregue: "Entregue",
  cancelada: "Cancelada",
}

export function mapServiceOrderRow(row: any, includeAllColumns?: boolean): ExportRow {
  const customer = row.customer_snapshot
  const base = {
    orderNumber: row.order_number || row.id?.slice(0, 8) || "-",
    customer: typeof customer === "object" && customer ? (customer as any).name || "-" : "-",
    title: row.title || "-",
    status: SERVICE_ORDER_STATUS_LABELS[row.status] || row.status || "-",
    assignedUser: row.user_profiles?.full_name || row.assigned_user_name || "-",
    expectedCompletion: row.expected_completion_date ? formatDate(row.expected_completion_date) : "-",
    totalAmount: formatCurrency(Number(row.total_amount ?? 0)),
    createdAt: row.created_at ? formatDateTime(row.created_at) : "-",
  }

  if (!includeAllColumns) return base

  return {
    ...base,
    description: row.description || "-",
    internalNotes: row.internal_notes || "-",
    totalServiceAmount: formatCurrency(Number(row.total_service_amount ?? 0)),
    totalProductAmount: formatCurrency(Number(row.total_product_amount ?? 0)),
    completedAt: row.completed_at ? formatDateTime(row.completed_at) : "-",
    id: row.id || "-",
  }
}

// ── Cash Register (Controle de Caixa) ────────────────────────────────

export const CASH_REGISTER_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "Abertura", key: "openedAt", width: 20 },
  { header: "Fechamento", key: "closedAt", width: 20 },
  { header: "Status", key: "status", width: 12 },
  { header: "Responsável", key: "openedBy", width: 22 },
  { header: "Saldo Inicial", key: "initialAmount", width: 16 },
  { header: "Saldo Final", key: "closingAmount", width: 16 },
  { header: "Diferença", key: "difference", width: 14 },
  { header: "Observações", key: "notes", width: 28 },
]

export const CASH_REGISTER_EXPORT_ALL_COLUMNS: ExportColumnDef[] = [
  ...CASH_REGISTER_EXPORT_COLUMNS,
  { header: "Valor Calculado", key: "calculatedAmount", width: 16 },
  { header: "Fechado por", key: "closedBy", width: 22 },
  { header: "ID", key: "id", width: 36 },
]

export function mapCashRegisterRow(row: any, includeAllColumns?: boolean): ExportRow {
  const base = {
    openedAt: row.opened_at ? formatDateTime(row.opened_at) : "-",
    closedAt: row.closed_at ? formatDateTime(row.closed_at) : "-",
    status: row.status === "open" ? "Aberto" : row.status === "closed" ? "Fechado" : row.status || "-",
    openedBy: row.opener?.full_name || row.opened_by_name || "-",
    initialAmount: formatCurrency(Number(row.initial_amount ?? 0)),
    closingAmount: formatCurrency(Number(row.closing_amount ?? 0)),
    difference: formatCurrency(Number(row.difference_amount ?? 0)),
    notes: row.notes || "-",
  }

  if (!includeAllColumns) return base

  return {
    ...base,
    calculatedAmount: formatCurrency(Number(row.calculated_amount ?? 0)),
    closedBy: row.closer?.full_name || row.closed_by_name || "-",
    id: row.id || "-",
  }
}

// ── XML Import (Importação XML) ──────────────────────────────────────

export const XML_IMPORT_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "NF-e", key: "invoiceNumber", width: 16 },
  { header: "Série", key: "invoiceSeries", width: 8 },
  { header: "Fornecedor", key: "supplier", width: 28 },
  { header: "Valor", key: "totalValue", width: 16 },
  { header: "Itens", key: "itemsCount", width: 10 },
  { header: "Status", key: "status", width: 14 },
  { header: "Data", key: "date", width: 20 },
  { header: "Chave Acesso", key: "accessKey", width: 48 },
]

export const XML_IMPORT_EXPORT_ALL_COLUMNS: ExportColumnDef[] = [
  ...XML_IMPORT_EXPORT_COLUMNS,
  { header: "CNPJ/CPF Fornecedor", key: "supplierDocument", width: 18 },
  { header: "Data Emissão", key: "invoiceDate", width: 20 },
  { header: "Modelo", key: "model", width: 8 },
  { header: "Protocolo", key: "protocol", width: 18 },
  { header: "Ambiente", key: "environment", width: 10 },
  { header: "Finalidade", key: "purpose", width: 14 },
  { header: "Tipo Operação", key: "operationType", width: 16 },
  { header: "Inf. CPL", key: "infCpl", width: 40 },
  { header: "Inf. Ad Fisco", key: "infAdFisco", width: 40 },
  { header: "Itens Importados", key: "importedItems", width: 16 },
  { header: "Itens Ignorados", key: "skippedItems", width: 14 },
  { header: "Hash XML", key: "xmlHash", width: 30 },
  { header: "Processado em", key: "processedAt", width: 20 },
]

const XML_IMPORT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  preview: "Pré-visualização",
  completed: "Concluído",
  failed: "Falha",
  reprocessing: "Reprocessando",
  reversed: "Estornado",
}

export function mapXmlImportRow(row: any, includeAllColumns?: boolean): ExportRow {
  const base = {
    invoiceNumber: row.invoice_number || "-",
    invoiceSeries: row.invoice_series || "-",
    supplier: row.supplier_name || "-",
    totalValue: formatCurrency(Number(row.total_value ?? 0)),
    itemsCount: Number(row.items_count ?? 0),
    status: XML_IMPORT_STATUS_LABELS[row.status] || row.status || "-",
    date: row.created_at ? formatDateTime(row.created_at) : "-",
    accessKey: row.access_key || "-",
  }

  if (!includeAllColumns) return base

  return {
    ...base,
    supplierDocument: row.supplier_document || "-",
    invoiceDate: row.invoice_date ? formatDateTime(row.invoice_date) : "-",
    model: row.modelo || "-",
    protocol: row.protocolo || "-",
    environment: row.ambiente || "-",
    purpose: row.finalidade || "-",
    operationType: row.tipo_operacao || "-",
    infCpl: row.inf_cpl || "-",
    infAdFisco: row.inf_ad_fisco || "-",
    importedItems: Number(row.imported_items ?? 0),
    skippedItems: Number(row.skipped_items ?? 0),
    xmlHash: row.xml_hash || "-",
    processedAt: row.processed_at ? formatDateTime(row.processed_at) : "-",
  }
}

// ── Quotes (Orçamentos) ──────────────────────────────────────────────

export const QUOTE_EXPORT_COLUMNS: ExportColumnDef[] = [
  { header: "Número", key: "quoteNumber", width: 18 },
  { header: "Data Emissão", key: "date", width: 16 },
  { header: "Validade", key: "expirationDate", width: 16 },
  { header: "Cliente", key: "customer", width: 28 },
  { header: "Vendedor", key: "salesperson", width: 22 },
  { header: "Status", key: "status", width: 20 },
  { header: "Subtotal", key: "subtotal", width: 14 },
  { header: "Desconto", key: "discount", width: 14 },
  { header: "Frete", key: "shipping", width: 14 },
  { header: "Outros Custos", key: "otherCosts", width: 14 },
  { header: "Total", key: "total", width: 16 },
  { header: "Qtde Itens", key: "itemsCount", width: 12 },
]

export const QUOTE_EXPORT_ALL_COLUMNS: ExportColumnDef[] = [
  ...QUOTE_EXPORT_COLUMNS,
  { header: "Tipo Desconto", key: "discountType", width: 14 },
  { header: "Observações", key: "notes", width: 30 },
  { header: "Criado em", key: "createdAt", width: 20 },
  { header: "Atualizado em", key: "updatedAt", width: 20 },
  { header: "ID", key: "id", width: 36 },
]

const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  pending_client: "Pendente do Cliente",
  viewed: "Visualizado",
  approved: "Aprovado",
  rejected: "Rejeitado",
  expired: "Expirado",
  cancelled: "Cancelado",
  converted_to_order: "Convertido em Pedido"
}

export function mapQuoteRow(row: any, includeAllColumns?: boolean): ExportRow {
  const rawStatus = row.status || ""
  
  // Resolve customer name
  const customerName = row.customers?.name || "-"
  
  // Resolve salesperson name
  const salespersonName = row.user_profiles?.full_name || "-"

  const base = {
    quoteNumber: row.quote_number || "-",
    date: row.issue_date ? formatDate(row.issue_date) : "-",
    expirationDate: row.expiration_date ? formatDate(row.expiration_date) : "-",
    customer: customerName,
    salesperson: salespersonName,
    status: QUOTE_STATUS_LABELS[rawStatus] || rawStatus || "-",
    subtotal: formatCurrency(Number(row.subtotal ?? 0)),
    discount: formatCurrency(Number(row.discount_value ?? 0)),
    shipping: formatCurrency(Number(row.shipping_cost ?? 0)),
    otherCosts: formatCurrency(Number(row.additional_costs ?? 0)),
    total: formatCurrency(Number(row.total ?? 0)),
    itemsCount: Number(row.items_count ?? 0),
  }

  if (!includeAllColumns) return base

  return {
    ...base,
    discountType: row.discount_type === "percentage" ? "Percentual" : row.discount_type === "fixed" ? "Fixo" : row.discount_type || "-",
    notes: row.notes || "-",
    createdAt: row.created_at ? formatDateTime(row.created_at) : "-",
    updatedAt: row.updated_at ? formatDateTime(row.updated_at) : "-",
    id: row.id || "-",
  }
}
