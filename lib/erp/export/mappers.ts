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
    orderNumber: row.order_number || row.sale_number || row.id?.slice(0, 8) || "-",
    date: row.created_at ? formatDateTime(row.created_at) : "-",
    customer: row.customer_name || "Consumidor final",
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

export const PRODUCT_EXPORT_ALL_COLUMNS: ExportColumnDef[] = [
  { header: "Produto", key: "name", width: 32 },
  { header: "Descrição", key: "description", width: 40 },
  { header: "SKU", key: "sku", width: 16 },
  { header: "GTIN/EAN", key: "gtin", width: 18 },
  { header: "Categoria", key: "category", width: 20 },
  { header: "Subcategoria", key: "subcategory", width: 20 },
  { header: "Marca", key: "brand", width: 20 },
  { header: "Localização", key: "location", width: 20 },
  { header: "Tipo de Produto", key: "productType", width: 18 },
  { header: "Condição", key: "condition", width: 14 },
  { header: "Unidade", key: "unit", width: 12 },
  { header: "Estoque", key: "stock", width: 10 },
  { header: "Estoque Mín.", key: "minStock", width: 12 },
  { header: "Custo", key: "cost", width: 14 },
  { header: "Margem Lucro", key: "profitMargin", width: 14 },
  { header: "Preço", key: "price", width: 14 },
  { header: "Preço Promocional", key: "promotionalPrice", width: 16 },
  { header: "Em Promoção", key: "isOnPromotion", width: 14 },
  { header: "Valor Promoção", key: "promotionValue", width: 14 },
  { header: "Visibilidade", key: "visibility", width: 14 },
  { header: "Status", key: "status", width: 12 },
  { header: "Criado em", key: "createdAt", width: 20 },
  { header: "NCM", key: "ncm", width: 12 },
  { header: "CEST", key: "cest", width: 12 },
  { header: "Origem", key: "origin", width: 10 },
  { header: "CFOP Interno", key: "cfopInternal", width: 14 },
  { header: "CFOP Externo", key: "cfopExternal", width: 14 },
  { header: "CSOSN", key: "csosn", width: 10 },
  { header: "Alíquota (%)", key: "taxPercentage", width: 14 },
  { header: "PIS CST", key: "pisCst", width: 10 },
  { header: "PIS %", key: "pisRate", width: 8 },
  { header: "COFINS CST", key: "cofinsCst", width: 12 },
  { header: "COFINS %", key: "cofinsRate", width: 10 },
  { header: "IPI CST", key: "ipiCst", width: 10 },
  { header: "IPI Código", key: "ipiCode", width: 12 },
  { header: "Situação Produto", key: "productSituation", width: 16 },
  { header: "C. Benefício", key: "cBenef", width: 12 },
  { header: "Inf. Adicional", key: "infAdProd", width: 20 },
  { header: "Peso Bruto (g)", key: "weightGross", width: 14 },
  { header: "Peso Líquido (g)", key: "weightNet", width: 14 },
  { header: "Largura (cm)", key: "width", width: 12 },
  { header: "Altura (cm)", key: "height", width: 12 },
  { header: "Comprimento (cm)", key: "length", width: 14 },
  { header: "Tipo Embalagem", key: "packagingType", width: 14 },
  { header: "Dias Preparação", key: "preparationDays", width: 14 },
  { header: "Vende s/ Estoque", key: "allowSellWithoutStock", width: 16 },
  { header: "Estoque Máx.", key: "maxStock", width: 12 },
  { header: "Disponibilidade", key: "availabilityValue", width: 14 },
  { header: "Unid. Disponib.", key: "availabilityUnit", width: 14 },
  { header: "Moderação", key: "moderationStatus", width: 14 },
  { header: "Mostrar Preço", key: "showPriceInStore", width: 14 },
  { header: "FCI", key: "fciCode", width: 10 },
]

export function mapProductRow(row: any, includeAllColumns?: boolean): ExportRow {
  const stock = Number(row.stock_quantity ?? 0)
  const base = {
    name: row.name || "-",
    sku: row.sku || "-",
    category: row.category || "-",
    stock,
    cost: formatCurrency(Number(row.cost_price ?? 0)),
    price: formatCurrency(Number(row.price ?? 0)),
    visibility: row.show_in_marketplace === false ? "Oculto" : "Visível",
    status: row.is_active ? "Ativo" : "Inativo",
  }

  if (!includeAllColumns) return base

  return {
    ...base,
    description: row.description || "-",
    gtin: row.gtin || "-",
    subcategory: row.subcategory || "-",
    brand: row.brand || "-",
    location: row.location || "-",
    productType: row.product_type || "-",
    condition: row.condition || "-",
    unit: row.unit || "-",
    minStock: Number(row.min_stock ?? 0),
    profitMargin: row.profit_margin !== null && row.profit_margin !== undefined ? formatCurrency(Number(row.profit_margin)) : "-",
    promotionalPrice: row.promotional_price !== null && row.promotional_price !== undefined ? formatCurrency(Number(row.promotional_price)) : "-",
    isOnPromotion: row.is_on_promotion ? "Sim" : "Não",
    promotionValue: row.promotion_value !== null && row.promotion_value !== undefined ? formatCurrency(Number(row.promotion_value)) : "-",
    createdAt: row.created_at ? formatDate(row.created_at) : "-",
    ncm: row.ncm || "-",
    cest: row.cest || "-",
    origin: row.origin !== null && row.origin !== undefined ? String(row.origin) : "-",
    cfopInternal: row.cfop_internal || "-",
    cfopExternal: row.cfop_external || "-",
    csosn: row.csosn || "-",
    taxPercentage: row.tax_percentage !== null && row.tax_percentage !== undefined ? String(row.tax_percentage) : "-",
    pisCst: row.pis_cst || "-",
    pisRate: row.pis_rate !== null && row.pis_rate !== undefined ? String(row.pis_rate) : "-",
    cofinsCst: row.cofins_cst || "-",
    cofinsRate: row.cofins_rate !== null && row.cofins_rate !== undefined ? String(row.cofins_rate) : "-",
    ipiCst: row.ipi_cst || "-",
    ipiCode: row.ipi_code || "-",
    productSituation: row.product_situation || "-",
    cBenef: row.c_benef || "-",
    infAdProd: row.inf_ad_prod || "-",
    weightGross: row.weight_gross !== null && row.weight_gross !== undefined ? String(row.weight_gross) : "-",
    weightNet: row.weight_net !== null && row.weight_net !== undefined ? String(row.weight_net) : "-",
    width: row.width !== null && row.width !== undefined ? String(row.width) : "-",
    height: row.height !== null && row.height !== undefined ? String(row.height) : "-",
    length: row.length !== null && row.length !== undefined ? String(row.length) : "-",
    packagingType: row.packaging_type || "-",
    preparationDays: row.preparation_days !== null && row.preparation_days !== undefined ? String(row.preparation_days) : "-",
    allowSellWithoutStock: row.allow_sell_without_stock ? "Sim" : "Não",
    maxStock: row.max_stock !== null && row.max_stock !== undefined ? String(row.max_stock) : "-",
    availabilityValue: row.availability_value !== null && row.availability_value !== undefined ? String(row.availability_value) : "-",
    availabilityUnit: row.availability_unit || "-",
    moderationStatus: row.moderation_status || "-",
    showPriceInStore: row.show_price_in_store ? "Sim" : "Não",
    fciCode: row.fci_code || "-",
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
    name: row.name || "-",
    email: row.email || "-",
    phone: row.phone || "-",
    createdAt: row.created_at ? formatDate(row.created_at) : "-",
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
    name: row.name || "-",
    category: row.service_categories?.name || "-",
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

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  booked: "Reservado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não Compareceu",
  in_progress: "Em Andamento",
  pending: "Pendente",
}

export function mapAppointmentRow(row: any): ExportRow {
  return {
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
    customer: row.customers?.name || row.customer?.name || "-",
    plan: row.recurring_plans?.name || row.plan?.name || "-",
    status: statusLabels[row.status] || row.status || "-",
    nextBilling: row.next_execution_at ? formatDate(row.next_execution_at) : "-",
    startedAt: row.started_at ? formatDate(row.started_at) : "-",
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

export function mapReturnRow(row: any): ExportRow {
  const rawStatus = row.status || ""
  return {
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

export function mapStockMovementRow(row: any): ExportRow {
  const items = row.stock_movement_items || []
  const productNames = items.map((i: any) => i.products?.name || i.product_name || "-").filter(Boolean).join("; ")
  const skus = items.map((i: any) => i.products?.sku || i.sku || "").filter(Boolean).join("; ")
  const totalQty = items.reduce((s: number, i: any) => s + Number(i.quantity || 0), 0)
  return {
    date: row.created_at ? formatDateTime(row.created_at) : "-",
    movementType: MOVEMENT_TYPE_LABELS[row.movement_type] || row.movement_type || "-",
    product: productNames || "-",
    sku: skus || "-",
    quantity: totalQty || Number(row.quantity || 0),
    reason: row.reason || "-",
    reference: row.reference_name || row.orders?.order_number || "-",
    createdBy: row.user_profiles?.full_name || row.created_by_name || "-",
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

export function mapTransactionRow(row: any): ExportRow {
  return {
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

export function mapSupplierRow(row: any): ExportRow {
  return {
    name: row.name || "-",
    email: row.email || "-",
    phone: row.phone || "-",
    document: row.cnpj || row.cpf || "-",
    city: row.city || row.street || "-",
    state: row.state || "-",
    status: row.status === "ativo" ? "Ativo" : row.status === "inativo" ? "Inativo" : row.status || "-",
    createdAt: row.created_at ? formatDate(row.created_at) : "-",
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

export function mapServiceOrderRow(row: any): ExportRow {
  const customer = row.customer_snapshot
  return {
    orderNumber: row.order_number || row.id?.slice(0, 8) || "-",
    customer: typeof customer === "object" && customer ? (customer as any).name || "-" : "-",
    title: row.title || "-",
    status: SERVICE_ORDER_STATUS_LABELS[row.status] || row.status || "-",
    assignedUser: row.user_profiles?.full_name || row.assigned_user_name || "-",
    expectedCompletion: row.expected_completion_date ? formatDate(row.expected_completion_date) : "-",
    totalAmount: formatCurrency(Number(row.total_amount ?? 0)),
    createdAt: row.created_at ? formatDateTime(row.created_at) : "-",
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

export function mapCashRegisterRow(row: any): ExportRow {
  return {
    openedAt: row.opened_at ? formatDateTime(row.opened_at) : "-",
    closedAt: row.closed_at ? formatDateTime(row.closed_at) : "-",
    status: row.status === "open" ? "Aberto" : row.status === "closed" ? "Fechado" : row.status || "-",
    openedBy: row.opener?.full_name || row.opened_by_name || "-",
    initialAmount: formatCurrency(Number(row.initial_amount ?? 0)),
    closingAmount: formatCurrency(Number(row.closing_amount ?? 0)),
    difference: formatCurrency(Number(row.difference_amount ?? 0)),
    notes: row.notes || "-",
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

const XML_IMPORT_STATUS_LABELS: Record<string, string> = {
  preview: "Pré-visualização",
  completed: "Concluído",
  failed: "Falha",
  reversed: "Estornado",
}

export function mapXmlImportRow(row: any): ExportRow {
  return {
    invoiceNumber: row.invoice_number || "-",
    invoiceSeries: row.invoice_series || "-",
    supplier: row.supplier_name || "-",
    totalValue: formatCurrency(Number(row.total_value ?? 0)),
    itemsCount: Number(row.items_count ?? 0),
    status: XML_IMPORT_STATUS_LABELS[row.status] || row.status || "-",
    date: row.created_at ? formatDateTime(row.created_at) : "-",
    accessKey: row.access_key || "-",
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

export function mapQuoteRow(row: any): ExportRow {
  const rawStatus = row.status || ""
  
  // Resolve customer name
  const customerName = row.customers?.name || "-"
  
  // Resolve salesperson name
  const salespersonName = row.user_profiles?.full_name || "-"

  return {
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
}
