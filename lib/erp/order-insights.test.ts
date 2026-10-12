import { describe, it, expect } from "vitest"
import {
    evaluatePaymentAlerts,
    evaluateDeliveryAlerts,
    evaluateStagnantOrders,
    evaluateReturnAlerts,
    normalizeSituation,
    PAYMENT_PENDING_OLD_DAYS,
    SEND_STALE_DAYS,
    DELIVER_STALE_DAYS,
    RETURN_STATUS_LABELS,
} from "./order-insights"

const NOW = "2026-10-09T12:00:00Z"

function order(overrides: Record<string, any> = {}) {
    return {
        id: overrides.id || "o1",
        order_number: "1042",
        customer_name: "Ana Souza",
        total_amount: 200,
        paid_amount: 0,
        situation: "pending",
        delivery_status: "not_sent",
        payment_expires_at: null,
        created_at: "2026-10-08T12:00:00Z",
        updated_at: "2026-10-08T12:00:00Z",
        last_movement_at: null,
        ...overrides,
    }
}

describe("normalizeSituation", () => {
    it("lowercases and trims", () => {
        expect(normalizeSituation(" Paid ")).toBe("paid")
        expect(normalizeSituation(null)).toBe("")
        expect(normalizeSituation(undefined)).toBe("")
    })
})

describe("evaluatePaymentAlerts", () => {
    it("returns empty group when there are no alerts", () => {
        const result = evaluatePaymentAlerts([order({ situation: "paid" })], { now: NOW })
        expect(result.alerts).toEqual([])
        expect(result.count).toBe(0)
        expect(result.total_value).toBe(0)
        expect(result.critical_count).toBe(0)
    })

    it("flags payment_failed as critical", () => {
        const result = evaluatePaymentAlerts([order({ situation: "payment_failed" })], { now: NOW })
        expect(result.alerts).toHaveLength(1)
        expect(result.alerts[0].kind).toBe("payment_failed")
        expect(result.alerts[0].severity).toBe("critical")
    })

    it("flags expired payment window as critical", () => {
        const result = evaluatePaymentAlerts(
            [order({ payment_expires_at: "2026-10-08T10:00:00Z" })],
            { now: NOW }
        )
        expect(result.alerts[0].kind).toBe("payment_expired")
        expect(result.alerts[0].severity).toBe("critical")
    })

    it("flags payment expiring within the window as warning with hours left", () => {
        const result = evaluatePaymentAlerts(
            [order({ payment_expires_at: "2026-10-10T00:00:00Z" })],
            { now: NOW }
        )
        expect(result.alerts[0].kind).toBe("payment_expiring")
        expect(result.alerts[0].severity).toBe("warning")
        expect(result.alerts[0].hours_to_expire).toBe(12)
        expect(result.alerts[0].message).toContain("12h")
    })

    it("flags old pending orders without expiry deadline", () => {
        const rows = [
            order({ id: "young", created_at: "2026-10-08T12:00:00Z" }),
            order({ id: "old", created_at: "2026-10-01T12:00:00Z" }),
        ]
        const result = evaluatePaymentAlerts(rows, { now: NOW })
        expect(result.alerts).toHaveLength(1)
        expect(result.alerts[0].id).toBe("old")
        expect(result.alerts[0].kind).toBe("pending_old")
        expect(result.alerts[0].days).toBe(8)
        expect(PAYMENT_PENDING_OLD_DAYS).toBe(3)
    })

    it("ignores pending orders whose deadline is far away", () => {
        const result = evaluatePaymentAlerts(
            [order({ created_at: "2026-10-01T12:00:00Z", payment_expires_at: "2026-10-20T12:00:00Z" })],
            { now: NOW }
        )
        expect(result.alerts).toEqual([])
    })

    it("sorts critical first then by value and sums totals", () => {
        const rows = [
            order({ id: "info", situation: "pending", created_at: "2026-10-01T12:00:00Z", total_amount: 900 }),
            order({ id: "failed", situation: "payment_failed", total_amount: 100 }),
            order({ id: "expired", payment_expires_at: "2026-10-08T10:00:00Z", total_amount: 500 }),
        ]
        const result = evaluatePaymentAlerts(rows, { now: NOW })
        expect(result.alerts.map((a) => a.id)).toEqual(["expired", "failed", "info"])
        expect(result.count).toBe(3)
        expect(result.total_value).toBe(1500)
        expect(result.critical_count).toBe(2)
    })
})

describe("evaluateDeliveryAlerts", () => {
    it("flags delivery_failed as critical", () => {
        const result = evaluateDeliveryAlerts(
            [order({ situation: "paid", delivery_status: "delivery_failed" })],
            { now: NOW }
        )
        expect(result.alerts[0].kind).toBe("delivery_failed")
        expect(result.alerts[0].severity).toBe("critical")
    })

    it("ignores cancelled and refunded orders", () => {
        const rows = [
            order({ id: "c", situation: "cancelled", delivery_status: "delivery_failed" }),
            order({ id: "r", situation: "refunded", delivery_status: "delivery_failed" }),
        ]
        expect(evaluateDeliveryAlerts(rows, { now: NOW }).alerts).toEqual([])
    })

    it("flags paid orders without sending after the stale window", () => {
        const result = evaluateDeliveryAlerts(
            [
                order({
                    situation: "paid",
                    delivery_status: "not_sent",
                    updated_at: "2026-10-01T12:00:00Z",
                    created_at: "2026-10-01T12:00:00Z",
                }),
            ],
            { now: NOW }
        )
        expect(result.alerts[0].kind).toBe("paid_not_sent")
        expect(result.alerts[0].days).toBe(8)
        expect(result.alerts[0].severity).toBe("warning")
        expect(SEND_STALE_DAYS).toBe(3)
    })

    it("does not flag recently paid orders", () => {
        const result = evaluateDeliveryAlerts(
            [order({ situation: "paid", delivery_status: "not_sent", updated_at: "2026-10-08T12:00:00Z" })],
            { now: NOW }
        )
        expect(result.alerts).toEqual([])
    })

    it("treats legacy delivery status 'pending' as not_sent", () => {
        const result = evaluateDeliveryAlerts(
            [
                order({
                    situation: "paid",
                    delivery_status: "pending",
                    updated_at: "2026-10-01T12:00:00Z",
                    created_at: "2026-10-01T12:00:00Z",
                }),
            ],
            { now: NOW }
        )
        expect(result.alerts[0].kind).toBe("paid_not_sent")
    })

    it("flags sent orders stuck without delivery confirmation", () => {
        const result = evaluateDeliveryAlerts(
            [
                order({
                    situation: "paid",
                    delivery_status: "sent",
                    updated_at: "2026-10-01T12:00:00Z",
                    created_at: "2026-10-01T12:00:00Z",
                }),
            ],
            { now: NOW }
        )
        expect(result.alerts[0].kind).toBe("sent_not_delivered")
        expect(result.alerts[0].days).toBe(8)
        expect(DELIVER_STALE_DAYS).toBe(5)
    })

    it("does not flag fresh sent orders", () => {
        const result = evaluateDeliveryAlerts(
            [order({ situation: "paid", delivery_status: "sent", updated_at: "2026-10-07T12:00:00Z" })],
            { now: NOW }
        )
        expect(result.alerts).toEqual([])
    })

    it("does not require paid status for delivery_failed", () => {
        const result = evaluateDeliveryAlerts(
            [order({ situation: "pending", delivery_status: "delivery_failed" })],
            { now: NOW }
        )
        expect(result.alerts).toHaveLength(1)
    })
})

describe("evaluateStagnantOrders", () => {
    it("flags orders without movement for the period", () => {
        const result = evaluateStagnantOrders(
            [
                order({
                    situation: "pending",
                    updated_at: "2026-09-01T12:00:00Z",
                    created_at: "2026-09-01T12:00:00Z",
                }),
            ],
            { now: NOW, periodDays: 30 }
        )
        expect(result.alerts).toHaveLength(1)
        expect(result.alerts[0].kind).toBe("stagnant")
        expect(result.alerts[0].days).toBe(38)
        expect(result.periodDays).toBe(30)
    })

    it("ignores orders moved inside the period", () => {
        const result = evaluateStagnantOrders(
            [order({ situation: "pending", updated_at: "2026-10-05T12:00:00Z" })],
            { now: NOW, periodDays: 30 }
        )
        expect(result.alerts).toEqual([])
    })

    it("excludes cancelled, refunded and fully delivered orders", () => {
        const stale = "2026-09-01T12:00:00Z"
        const rows = [
            order({ id: "c", situation: "cancelled", updated_at: stale, created_at: stale }),
            order({ id: "r", situation: "refunded", updated_at: stale, created_at: stale }),
            order({ id: "d", situation: "paid", delivery_status: "delivered", updated_at: stale, created_at: stale }),
            order({ id: "p", situation: "paid", delivery_status: "sent", updated_at: stale, created_at: stale }),
        ]
        const result = evaluateStagnantOrders(rows, { now: NOW, periodDays: 30 })
        expect(result.alerts).toHaveLength(1)
        expect(result.alerts[0].id).toBe("p")
    })

    it("uses last_movement_at when available and escalates severity after 2x the period", () => {
        const result = evaluateStagnantOrders(
            [
                order({
                    situation: "pending",
                    created_at: "2026-05-01T12:00:00Z",
                    updated_at: "2026-05-01T12:00:00Z",
                    last_movement_at: "2026-05-01T12:00:00Z",
                }),
            ],
            { now: NOW, periodDays: 15 }
        )
        expect(result.alerts[0].severity).toBe("warning")
        expect(result.alerts[0].days).toBeGreaterThan(30)
    })

    it("sums total value of stagnant orders", () => {
        const stale = "2026-09-01T12:00:00Z"
        const rows = [
            order({ id: "a", situation: "pending", total_amount: 100, updated_at: stale, created_at: stale }),
            order({ id: "b", situation: "pending", total_amount: 250.5, updated_at: stale, created_at: stale }),
        ]
        const result = evaluateStagnantOrders(rows, { now: NOW, periodDays: 30 })
        expect(result.total_value).toBe(350.5)
    })
})

describe("evaluateReturnAlerts", () => {
    const request = (overrides: Record<string, any> = {}) => ({
        id: "rr1",
        order_id: "o1",
        status: "PENDING_REVIEW",
        order_number_snapshot: "1042",
        customer_name_snapshot: "Ana Souza",
        order_total_snapshot: 300,
        refund_amount: 0,
        created_at: "2026-10-05T12:00:00Z",
        updated_at: "2026-10-05T12:00:00Z",
        sla_due_at: null,
        ...overrides,
    })

    it("returns only statuses waiting for action", () => {
        const rows = [
            request({ id: "1" }),
            request({ id: "2", status: "RESOLVED" }),
            request({ id: "3", status: "REJECTED" }),
            request({ id: "4", status: "ESCALATED" }),
            request({ id: "5", status: "WAITING_ITEM_RETURN" }),
            request({ id: "6", status: "UNDER_ANALYSIS" }),
        ]
        const result = evaluateReturnAlerts(rows, { now: NOW })
        expect(result.alerts.map((a) => a.id)).toEqual(["4", "1", "6", "5"])
        expect(result.count).toBe(4)
        expect(result.total_value).toBe(1200)
    })

    it("escalates severity to critical when SLA is overdue", () => {
        const result = evaluateReturnAlerts(
            [request({ sla_due_at: "2026-10-07T12:00:00Z" })],
            { now: NOW }
        )
        expect(result.alerts[0].severity).toBe("critical")
        expect(result.alerts[0].sla_overdue).toBe(true)
        expect(result.alerts[0].message).toContain("SLA vencido")
        expect(result.critical_count).toBe(1)
    })

    it("uses status labels for messages", () => {
        const result = evaluateReturnAlerts([request({ status: "UNDER_ANALYSIS" })], { now: NOW })
        expect(result.alerts[0].status_label).toBe(RETURN_STATUS_LABELS.UNDER_ANALYSIS)
        expect(result.alerts[0].message).toContain("Em análise")
    })

    it("orders critical first then by value", () => {
        const rows = [
            request({ id: "info", status: "WAITING_ITEM_RETURN", order_total_snapshot: 900 }),
            request({ id: "crit", status: "ESCALATED", order_total_snapshot: 100 }),
        ]
        const result = evaluateReturnAlerts(rows, { now: NOW })
        expect(result.alerts.map((a) => a.id)).toEqual(["crit", "info"])
    })
})
