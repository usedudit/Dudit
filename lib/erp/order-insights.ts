export const DEFAULT_ORDER_STAGNANT_PERIOD_DAYS = 30
export const PAYMENT_EXPIRING_SOON_HOURS = 24
export const PAYMENT_PENDING_OLD_DAYS = 3
export const SEND_STALE_DAYS = 3
export const DELIVER_STALE_DAYS = 5

export const ORDER_STAGNANT_PERIOD_OPTIONS = [15, 30, 60, 90] as const

export type AlertSeverity = "critical" | "warning" | "info"

export const RETURN_STATUS_LABELS: Record<string, string> = {
    PENDING_REVIEW: "Aguardando análise",
    UNDER_ANALYSIS: "Em análise",
    ESCALATED: "Escalada",
    WAITING_ITEM_RETURN: "Aguardando retorno do item",
}

const PENDING_RETURN_STATUSES = ["PENDING_REVIEW", "UNDER_ANALYSIS", "ESCALATED", "WAITING_ITEM_RETURN"]

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }

function toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null
    const d = value instanceof Date ? value : new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
}

function daysSince(value: string | Date | null | undefined, ref: Date): number {
    const d = toDate(value)
    if (!d) return 0
    const diff = Math.floor((ref.getTime() - d.getTime()) / 86400000)
    return Math.max(0, diff)
}

function round2(n: number): number {
    return Math.round(n * 100) / 100
}

export function normalizeSituation(situation: string | null | undefined): string {
    return String(situation || "").trim().toLowerCase()
}

function normalizeDeliveryStatus(status: string | null | undefined): string {
    const value = String(status || "").trim().toLowerCase()
    return !value || value === "pending" ? "not_sent" : value
}

function isPaidSituation(situation: string | null | undefined): boolean {
    const s = normalizeSituation(situation)
    return s === "paid" || s === "partially_paid"
}

function isTerminalOrder(order: { situation?: string | null; delivery_status?: string | null }): boolean {
    const s = normalizeSituation(order.situation)
    if (s === "cancelled" || s === "refunded") return true
    return s === "paid" && normalizeDeliveryStatus(order.delivery_status) === "delivered"
}

export interface OrderAlertRow {
    id: string
    order_number?: string | null
    customer_name?: string | null
    total_amount?: number | string | null
    paid_amount?: number | string | null
    situation?: string | null
    delivery_status?: string | null
    delivery_type?: string | null
    payment_expires_at?: string | null
    created_at?: string | null
    updated_at?: string | null
    last_movement_at?: string | null
}

export interface OrderAlert {
    id: string
    order_number: string
    customer_name: string
    total_amount: number
    paid_amount: number
    situation: string
    delivery_status: string | null
    kind: string
    severity: AlertSeverity
    message: string
    created_at: string | null
    days: number
    hours_to_expire?: number | null
}

export interface OrderAlertGroup {
    alerts: OrderAlert[]
    count: number
    total_value: number
    critical_count: number
}

export interface StagnantOrderGroup extends OrderAlertGroup {
    periodDays: number
}

export interface ReturnAlertRow {
    id: string
    order_id?: string | null
    status?: string | null
    order_number_snapshot?: string | null
    customer_name_snapshot?: string | null
    order_total_snapshot?: number | string | null
    refund_amount?: number | string | null
    reason?: string | null
    created_at?: string | null
    updated_at?: string | null
    sla_due_at?: string | null
}

export interface ReturnAlert {
    id: string
    order_id: string | null
    order_number: string
    customer_name: string
    total_amount: number
    status: string
    status_label: string
    kind: "return"
    severity: AlertSeverity
    message: string
    created_at: string | null
    days: number
    sla_overdue: boolean
}

export interface ReturnAlertGroup {
    alerts: ReturnAlert[]
    count: number
    total_value: number
    critical_count: number
}

export interface OrdersInsightsResult {
    payments: OrderAlertGroup
    deliveries: OrderAlertGroup
    stagnant: StagnantOrderGroup
    returns: ReturnAlertGroup
}

function buildOrderAlert(order: OrderAlertRow, extra: Partial<OrderAlert>): OrderAlert {
    return {
        id: order.id,
        order_number: String(order.order_number || order.id).slice(0, 12),
        customer_name: String(order.customer_name || "Cliente não identificado"),
        total_amount: Number(order.total_amount) || 0,
        paid_amount: Number(order.paid_amount) || 0,
        situation: normalizeSituation(order.situation),
        delivery_status: order.delivery_status || null,
        created_at: order.created_at || null,
        days: 0,
        kind: "order",
        severity: "info",
        message: "",
        ...extra,
    }
}

function sortAlerts<T extends { severity: AlertSeverity; total_amount: number; days: number }>(alerts: T[]): T[] {
    return alerts.sort(
        (a, b) =>
            SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
            b.total_amount - a.total_amount ||
            b.days - a.days
    )
}

function buildOrderGroup(alerts: OrderAlert[]): OrderAlertGroup {
    const sorted = sortAlerts(alerts)
    return {
        alerts: sorted,
        count: sorted.length,
        total_value: round2(sorted.reduce((sum, a) => sum + a.total_amount, 0)),
        critical_count: sorted.filter((a) => a.severity === "critical").length,
    }
}

// ---------------------------------------------------------------------------
// PAGAMENTOS
// ---------------------------------------------------------------------------

export function evaluatePaymentAlerts(
    orders: OrderAlertRow[],
    options?: { now?: string | Date; pendingOldDays?: number; expiringSoonHours?: number }
): OrderAlertGroup {
    const now = toDate(options?.now) || new Date()
    const pendingOldDays = Math.max(0, Number(options?.pendingOldDays) || PAYMENT_PENDING_OLD_DAYS)
    const expiringSoonHours = Math.max(1, Number(options?.expiringSoonHours) || PAYMENT_EXPIRING_SOON_HOURS)

    const alerts: OrderAlert[] = []

    for (const order of orders || []) {
        const situation = normalizeSituation(order.situation)

        if (situation === "payment_failed") {
            alerts.push(
                buildOrderAlert(order, {
                    kind: "payment_failed",
                    severity: "critical",
                    message: "Pagamento recusado pelo meio de pagamento.",
                    created_at: order.created_at || null,
                    days: daysSince(order.created_at, now),
                })
            )
            continue
        }

        if (situation !== "pending") continue

        const createdAt = toDate(order.created_at)
        const expiry = toDate(order.payment_expires_at)
        const days = daysSince(order.created_at, now)

        if (expiry && expiry.getTime() <= now.getTime()) {
            alerts.push(
                buildOrderAlert(order, {
                    kind: "payment_expired",
                    severity: "critical",
                    message: "Prazo de pagamento expirou — pedido pode ser cancelado em breve.",
                    created_at: order.created_at || null,
                    days,
                })
            )
            continue
        }

        if (expiry) {
            const hoursLeft = Math.ceil((expiry.getTime() - now.getTime()) / 3600000)
            if (hoursLeft <= expiringSoonHours) {
                alerts.push(
                    buildOrderAlert(order, {
                        kind: "payment_expiring",
                        severity: "warning",
                        message: `Pagamento expira em ${hoursLeft}h — cliente pode perder o prazo.`,
                        created_at: order.created_at || null,
                        days,
                        hours_to_expire: hoursLeft,
                    })
                )
            }
            // Com prazo definido, o próprio prazo governa o alerta.
            continue
        }

        if (createdAt && days >= pendingOldDays) {
            alerts.push(
                buildOrderAlert(order, {
                    kind: "pending_old",
                    severity: "info",
                    message: `Aguardando pagamento há ${days} dia(s).`,
                    created_at: order.created_at || null,
                    days,
                })
            )
        }
    }

    return buildOrderGroup(alerts)
}

// ---------------------------------------------------------------------------
// ENTREGAS
// ---------------------------------------------------------------------------

export function evaluateDeliveryAlerts(
    orders: OrderAlertRow[],
    options?: { now?: string | Date; sendStaleDays?: number; deliverStaleDays?: number }
): OrderAlertGroup {
    const now = toDate(options?.now) || new Date()
    const sendStaleDays = Math.max(1, Number(options?.sendStaleDays) || SEND_STALE_DAYS)
    const deliverStaleDays = Math.max(1, Number(options?.deliverStaleDays) || DELIVER_STALE_DAYS)

    const alerts: OrderAlert[] = []

    for (const order of orders || []) {
        const situation = normalizeSituation(order.situation)
        if (situation === "cancelled" || situation === "refunded") continue

        const deliveryStatus = normalizeDeliveryStatus(order.delivery_status)
        const lastMovement = order.last_movement_at || order.updated_at || order.created_at
        const days = daysSince(lastMovement, now)

        if (deliveryStatus === "delivery_failed") {
            alerts.push(
                buildOrderAlert(order, {
                    kind: "delivery_failed",
                    severity: "critical",
                    message: "Falha na entrega — é preciso nova tentativa ou contato com o cliente.",
                    created_at: order.created_at || null,
                    days,
                })
            )
            continue
        }

        if (!isPaidSituation(situation)) continue

        if (deliveryStatus === "not_sent" && days >= sendStaleDays) {
            alerts.push(
                buildOrderAlert(order, {
                    kind: "paid_not_sent",
                    severity: "warning",
                    message: `Pago, mas sem envio há ${days} dia(s).`,
                    created_at: order.created_at || null,
                    days,
                })
            )
            continue
        }

        if ((deliveryStatus === "sent" || deliveryStatus === "pickup_available") && days >= deliverStaleDays) {
            alerts.push(
                buildOrderAlert(order, {
                    kind: "sent_not_delivered",
                    severity: "warning",
                    message: `Enviado há ${days} dia(s) sem confirmação de entrega.`,
                    created_at: order.created_at || null,
                    days,
                })
            )
        }
    }

    return buildOrderGroup(alerts)
}

// ---------------------------------------------------------------------------
// PARADOS
// ---------------------------------------------------------------------------

export function evaluateStagnantOrders(
    orders: OrderAlertRow[],
    options?: { periodDays?: number; now?: string | Date }
): StagnantOrderGroup {
    const periodDays = Math.max(1, Number(options?.periodDays) || DEFAULT_ORDER_STAGNANT_PERIOD_DAYS)
    const now = toDate(options?.now) || new Date()

    const alerts: OrderAlert[] = []

    for (const order of orders || []) {
        if (isTerminalOrder(order)) continue

        const lastMovement = order.last_movement_at || order.updated_at || order.created_at
        const days = daysSince(lastMovement, now)
        if (days < periodDays) continue

        alerts.push(
            buildOrderAlert(order, {
                kind: "stagnant",
                severity: days >= periodDays * 2 ? "warning" : "info",
                message: `Sem movimentação há ${days} dia(s).`,
                created_at: order.created_at || null,
                days,
            })
        )
    }

    return { ...buildOrderGroup(alerts), periodDays }
}

// ---------------------------------------------------------------------------
// DEVOLUÇÕES
// ---------------------------------------------------------------------------

export function evaluateReturnAlerts(
    requests: ReturnAlertRow[],
    options?: { now?: string | Date }
): ReturnAlertGroup {
    const now = toDate(options?.now) || new Date()

    const alerts: ReturnAlert[] = []

    for (const request of requests || []) {
        const status = String(request.status || "").trim().toUpperCase()
        if (!PENDING_RETURN_STATUSES.includes(status)) continue

        const createdAt = toDate(request.created_at)
        const slaDue = toDate(request.sla_due_at)
        const slaOverdue = Boolean(slaDue && slaDue.getTime() < now.getTime())
        const days = daysSince(request.created_at, now)

        let severity: AlertSeverity =
            status === "ESCALATED" ? "critical" : status === "WAITING_ITEM_RETURN" ? "info" : "warning"
        if (slaOverdue) severity = "critical"

        const label = RETURN_STATUS_LABELS[status] || status
        const message = slaOverdue
            ? `${label} — SLA vencido há ${daysSince(request.sla_due_at, now)} dia(s).`
            : `${label} há ${days} dia(s).`

        alerts.push({
            id: request.id,
            order_id: request.order_id || null,
            order_number: String(request.order_number_snapshot || request.order_id || "").slice(0, 12),
            customer_name: String(request.customer_name_snapshot || "Cliente não identificado"),
            total_amount: Number(request.order_total_snapshot) || Number(request.refund_amount) || 0,
            status,
            status_label: label,
            kind: "return",
            severity,
            message,
            created_at: request.created_at || null,
            days,
            sla_overdue: slaOverdue,
        })
    }

    const sorted = alerts.sort(
        (a, b) =>
            SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
            b.total_amount - a.total_amount ||
            b.days - a.days
    )

    return {
        alerts: sorted,
        count: sorted.length,
        total_value: round2(sorted.reduce((sum, a) => sum + a.total_amount, 0)),
        critical_count: sorted.filter((a) => a.severity === "critical").length,
    }
}
