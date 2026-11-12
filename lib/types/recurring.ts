import {
  normalizeFulfillmentModes,
  type FulfillmentMode,
} from "@/lib/commerce/capabilities"

export type RecurringPlanStatus = "active" | "inactive" | "archived"
export type RecurringFrequencyType = "daily" | "weekly" | "monthly" | "yearly" | "custom"
export type RecurringSubscriptionStatus =
  | "active"
  | "paused"
  | "cancelled"
  | "expired"
  | "awaiting_restock"
  | "awaiting_customer_decision"
  | "pending"
  | "past_due"
  | "payment_failed"
export type RecurringExecutionStatus =
  | "pending"
  | "processing"
  | "awaiting_payment"
  | "completed"
  | "failed"

/**
 * Status filter used by the ERP subscriptions panel.
 * `delinquent` is a pseudo-status that groups `past_due` + `payment_failed`.
 */
export type RecurringSubscriptionStatusFilter =
  | RecurringSubscriptionStatus
  | "all"
  | "delinquent"
export type RecurringPlanItemType = "product" | "service"

/**
 * How a plan handles freight.
 * `included` - freight baked into the item price
 * `flat`     - fixed amount defined by the seller
 * `quote`    - quoted with the carrier once at signup, never re-quoted
 */
export type RecurringShippingMode = "included" | "flat" | "quote"

/**
 * Where the subscription's frozen freight value came from.
 */
export type RecurringShippingSource =
  | "pickup"
  | "included"
  | "flat"
  | "quote_own"
  | "quote_carrier"

export type RecurringPlanItem = {
  id?: string
  itemType: RecurringPlanItemType
  productId?: string | null
  variantId?: string | null
  serviceId?: string | null
  quantity: number
  unitPrice?: number | null
  staffPartnerUserId?: string | null
  preferredTime?: string | null
  durationMinutes?: number | null
  sortOrder?: number
}

export type RecurringPlan = {
  id: string
  shortId?: string | null
  short_id?: string | null
  partnerId: string
  name: string
  description: string | null
  status: RecurringPlanStatus
  frequencyType: RecurringFrequencyType
  frequencyInterval: number
  weekdays: number[] | null
  dayOfMonth: number | null
  useLastDay: boolean
  yearMonth: number | null
  yearDay: number | null
  startDate: string
  endDate: string | null
  showInMarketplace: boolean
  createdAt: string
  updatedAt: string
  price?: number
  items?: RecurringPlanItemRow[]
  images?: string[] | null
  billingMode?: "manual" | "auto_mercado_pago"
  creditExpirationPolicy?: "never" | "end_of_cycle" | "fixed_days"
  creditExpirationDays?: number | null
  shippingMode?: RecurringShippingMode
  shippingFlatAmount?: number
  /** Modalidades aceitas pelo plano. Sem `delivery` nenhum frete e cobrado. */
  fulfillmentModes?: FulfillmentMode[]
  fulfillment_modes?: string[] | null
}

export type RecurringPlanItemRow = RecurringPlanItem & {
  id: string
  planId: string
  product?: { id: string; name: string; price?: number; images?: string[] | null } | null
  service?: { id: string; name: string; price?: number; duration?: number; images?: string[] | null } | null
}

export type RecurringSubscription = {
  id: string
  partnerId: string
  customerId: string
  recurringPlanId: string
  status: RecurringSubscriptionStatus
  nextExecutionAt: string
  lastExecutionAt: string | null
  startedAt: string
  pausedAt: string | null
  cancelledAt: string | null
  deliveryType: "pickup" | "delivery"
  deliveryAddress: string | null
  financeAccountId: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  mpPreapprovalId?: string | null
  billingMode?: string | null
  storeId?: string | null
  shippingAmount?: number
  shippingSource?: RecurringShippingSource
  shippingQuotedAt?: string | null
  carrierServiceId?: string | null
  pendingAddress?: string | null
  pendingShippingAmount?: number | null
  contractedAmount?: number | null
  contractedItemsHash?: string | null
  priceChangeRequestedAt?: string | null
  priceChangeExpiresAt?: string | null
  priceChangeDecision?: "accepted" | "rejected" | null
  pendingCancellationReason?: string | null
  plan?: RecurringPlan | null
  customer?: { id: string; name: string; email?: string | null } | null
}

export type RecurringExecution = {
  id: string
  subscriptionId: string
  partnerId: string
  scheduledFor: string
  status: RecurringExecutionStatus
  orderId: string | null
  appointmentIds: string[] | null
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
  order?: { id: string; order_number?: string; total_amount?: number } | null
}

export type RecurringListCursor = { createdAt: string; id: string }

export type RecurringStatusVariant = "green" | "red" | "orange" | "blue" | "gray"

export type RecurringSubscriptionDetailCustomer = {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  image_url?: string | null
}

export type RecurringSubscriptionDetailItem = {
  id: string
  itemType: RecurringPlanItemType
  quantity: number
  unitPrice: number
  sortOrder: number
  preferredTime: string | null
  durationMinutes: number | null
  product: { id: string; name: string; images?: string[] | null } | null
  service: { id: string; name: string; images?: string[] | null } | null
}

export type RecurringSubscriptionDetailCredit = {
  id: string
  itemName: string
  itemType: "service" | "product"
  serviceId: string | null
  productId: string | null
  quantity: number
  consumed: number
  remaining: number
  expiresAt: string | null
  staffPartnerUserId?: string | null
  durationMinutes?: number | null
  createdAt?: string | null
}

export type RecurringSubscriptionDetail = {
  subscription: RecurringSubscription
  plan: (RecurringPlan & { items: RecurringPlanItemRow[] }) | null
  customer: RecurringSubscriptionDetailCustomer | null
  items: RecurringSubscriptionDetailItem[]
  credits: RecurringSubscriptionDetailCredit[]
}

export function mapPlanRow(row: Record<string, unknown>): RecurringPlan {
  return {
    id: String(row.id),
    shortId: row.short_id != null ? String(row.short_id) : undefined,
    short_id: row.short_id != null ? String(row.short_id) : undefined,
    partnerId: String(row.partner_id),
    name: String(row.name || ""),

    description: row.description != null ? String(row.description) : null,
    status: row.status as RecurringPlanStatus,
    frequencyType: row.frequency_type as RecurringFrequencyType,
    frequencyInterval: Number(row.frequency_interval || 1),
    weekdays: (row.weekdays as number[] | null) ?? null,
    dayOfMonth: row.day_of_month != null ? Number(row.day_of_month) : null,
    useLastDay: !!row.use_last_day,
    yearMonth: row.year_month != null ? Number(row.year_month) : null,
    yearDay: row.year_day != null ? Number(row.year_day) : null,
    startDate: String(row.start_date),
    endDate: row.end_date != null ? String(row.end_date) : null,
    showInMarketplace: row.show_in_marketplace !== false,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    price: row.price != null ? Number(row.price) : undefined,
    images: Array.isArray(row.images) ? (row.images as string[]) : null,
    billingMode: (row.billing_mode as "manual" | "auto_mercado_pago" | undefined) || "manual",
    creditExpirationPolicy: (row.credit_expiration_policy as "never" | "end_of_cycle" | "fixed_days" | undefined) || "end_of_cycle",
    creditExpirationDays: row.credit_expiration_days != null ? Number(row.credit_expiration_days) : null,
    shippingMode: (row.shipping_mode as RecurringShippingMode | undefined) || "included",
    shippingFlatAmount: row.shipping_flat_amount != null ? Number(row.shipping_flat_amount) : 0,
    fulfillment_modes: Array.isArray(row.fulfillment_modes) ? (row.fulfillment_modes as string[]) : null,
    fulfillmentModes: normalizeFulfillmentModes(
      row.fulfillment_modes as string[] | null | undefined,
      ["delivery", "pickup"] as FulfillmentMode[],
    ),
  }
}

export function mapSubscriptionRow(row: Record<string, unknown>): RecurringSubscription {
  return {
    id: String(row.id),
    partnerId: String(row.partner_id),
    customerId: String(row.customer_id),
    recurringPlanId: String(row.recurring_plan_id),
    status: row.status as RecurringSubscriptionStatus,
    nextExecutionAt: String(row.next_execution_at),
    lastExecutionAt: row.last_execution_at != null ? String(row.last_execution_at) : null,
    startedAt: String(row.started_at),
    pausedAt: row.paused_at != null ? String(row.paused_at) : null,
    cancelledAt: row.cancelled_at != null ? String(row.cancelled_at) : null,
    deliveryType: (row.delivery_type as "pickup" | "delivery") || "pickup",
    deliveryAddress: row.delivery_address != null ? String(row.delivery_address) : null,
    financeAccountId: row.finance_account_id != null ? String(row.finance_account_id) : null,
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    mpPreapprovalId: row.mp_preapproval_id != null ? String(row.mp_preapproval_id) : null,
    billingMode: row.billing_mode != null ? String(row.billing_mode) : null,
    storeId: row.store_id != null ? String(row.store_id) : null,
    shippingAmount: row.shipping_amount != null ? Number(row.shipping_amount) : 0,
    shippingSource: (row.shipping_source as RecurringShippingSource | undefined) || "pickup",
    shippingQuotedAt: row.shipping_quoted_at != null ? String(row.shipping_quoted_at) : null,
    carrierServiceId: row.carrier_service_id != null ? String(row.carrier_service_id) : null,
    pendingAddress: row.pending_address != null ? String(row.pending_address) : null,
    pendingShippingAmount:
      row.pending_shipping_amount != null ? Number(row.pending_shipping_amount) : null,
    contractedAmount: row.contracted_amount != null ? Number(row.contracted_amount) : null,
    contractedItemsHash: row.contracted_items_hash != null ? String(row.contracted_items_hash) : null,
    priceChangeRequestedAt:
      row.price_change_requested_at != null ? String(row.price_change_requested_at) : null,
    priceChangeExpiresAt:
      row.price_change_expires_at != null ? String(row.price_change_expires_at) : null,
    priceChangeDecision:
      (row.price_change_decision as "accepted" | "rejected" | null | undefined) ?? null,
    pendingCancellationReason:
      row.pending_cancellation_reason != null ? String(row.pending_cancellation_reason) : null,
  }
}

export function getRecurringShippingModeLabel(mode: RecurringShippingMode): string {
  switch (mode) {
    case "included": return "Incluso no preço"
    case "flat": return "Valor fixo"
    case "quote": return "Cotado na transportadora"
    default: return mode
  }
}

export function getRecurringBillingModeLabel(mode?: string | null): string {
  return mode === "auto_mercado_pago" ? "Automático (Mercado Pago)" : "Manual"
}

export function getRecurringShippingSourceLabel(source: RecurringShippingSource): string {
  switch (source) {
    case "pickup": return "Retirada"
    case "included": return "Frete incluso"
    case "flat": return "Frete fixo"
    case "quote_own": return "Cotação própria"
    case "quote_carrier": return "Cotação da transportadora"
    default: return source
  }
}

export function getRecurringStatusLabel(status: RecurringSubscriptionStatus): string {
  switch (status) {
    case "active": return "Ativa"
    case "paused": return "Pausada"
    case "cancelled": return "Cancelada"
    case "expired": return "Expirada"
    case "awaiting_restock": return "Aguardando Reposição"
    case "pending": return "Aguardando Confirmação"
    case "past_due": return "Pagamento Pendente"
    case "payment_failed": return "Falha no Pagamento"
    case "awaiting_customer_decision": return "Aguardando Cliente"
    default: return status
  }
}

export function getRecurringStatusVariant(
  status: RecurringSubscriptionStatus | string,
): RecurringStatusVariant {
  switch (status) {
    case "active": return "green"
    case "paused": return "orange"
    case "pending": return "blue"
    case "past_due": return "orange"
    case "payment_failed": return "red"
    case "cancelled": return "red"
    case "awaiting_restock": return "red"
    case "awaiting_customer_decision": return "orange"
    default: return "gray"
  }
}

export function getRecurringExecutionStatusLabel(status: RecurringExecutionStatus): string {
  switch (status) {
    case "pending": return "Agendada"
    case "processing": return "Processando"
    case "awaiting_payment": return "Aguardando Pagamento"
    case "completed": return "Concluída"
    case "failed": return "Falhou"
    default: return status
  }
}

export function getRecurringFrequencyLabel(type: RecurringFrequencyType, interval: number): string {
  const n = Math.max(interval, 1)
  switch (type) {
    case "daily": return n === 1 ? "Diária" : `A cada ${n} dias`
    case "weekly": return n === 1 ? "Semanal" : `A cada ${n} semanas`
    case "monthly": return n === 1 ? "Mensal" : `A cada ${n} meses`
    case "yearly": return n === 1 ? "Anual" : `A cada ${n} anos`
    case "custom": return `Personalizada (intervalo ${n})`
    default: return type
  }
}
