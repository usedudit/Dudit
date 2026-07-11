export type RecurringPlanStatus = "active" | "inactive" | "archived"
export type RecurringFrequencyType = "daily" | "weekly" | "monthly" | "yearly" | "custom"
export type RecurringSubscriptionStatus = "active" | "paused" | "cancelled" | "expired" | "awaiting_restock"
export type RecurringExecutionStatus = "pending" | "processing" | "completed" | "failed"
export type RecurringPlanItemType = "product" | "service"

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
  items?: RecurringPlanItemRow[]
  images?: string[] | null
}

export type RecurringPlanItemRow = RecurringPlanItem & {
  id: string
  planId: string
  product?: { id: string; name: string; price?: number } | null
  service?: { id: string; name: string; price?: number; duration?: number } | null
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

export function mapPlanRow(row: Record<string, unknown>): RecurringPlan {
  return {
    id: String(row.id),
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
    images: Array.isArray(row.images) ? (row.images as string[]) : null,
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
  }
}

export function getRecurringStatusLabel(status: RecurringSubscriptionStatus): string {
  switch (status) {
    case "active": return "Ativa"
    case "paused": return "Pausada"
    case "cancelled": return "Cancelada"
    case "expired": return "Expirada"
    case "awaiting_restock": return "Aguardando Reposição"
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
