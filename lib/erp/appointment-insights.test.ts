import { describe, it, expect } from "vitest"
import {
    isNoShowStatus,
    isCancelledStatus,
    isPendingConfirmationStatus,
    isCompletedStatus,
    evaluateNoShowAlerts,
    evaluateStagnantServices,
    evaluatePendingConfirmations,
    evaluateRescheduleOpportunities,
    evaluateRetentionOpportunities,
    subtractDays,
    addDays,
    daysBetween,
    toDateStr,
    MIN_NO_SHOWS_TO_ALERT,
} from "./appointment-insights"

describe("isNoShowStatus", () => {
    it("recognizes all absence variants", () => {
        expect(isNoShowStatus("Ausência")).toBe(true)
        expect(isNoShowStatus("ausencia")).toBe(true)
        expect(isNoShowStatus("AUSÊNCIA")).toBe(true)
        expect(isNoShowStatus("missed")).toBe(true)
        expect(isNoShowStatus("no_show")).toBe(true)
        expect(isNoShowStatus("no-show")).toBe(true)
        expect(isNoShowStatus("faltou")).toBe(true)
        expect(isNoShowStatus("Não compareceu")).toBe(true)
    })

    it("rejects other statuses", () => {
        expect(isNoShowStatus("Concluído")).toBe(false)
        expect(isNoShowStatus("Cancelado")).toBe(false)
        expect(isNoShowStatus("Reservado")).toBe(false)
        expect(isNoShowStatus(null)).toBe(false)
        expect(isNoShowStatus("")).toBe(false)
    })
})

describe("isCancelledStatus", () => {
    it("recognizes cancellations only", () => {
        expect(isCancelledStatus("Cancelado")).toBe(true)
        expect(isCancelledStatus("canceled")).toBe(true)
        expect(isCancelledStatus("Cancelada")).toBe(true)
        expect(isCancelledStatus("Ausência")).toBe(false)
        expect(isCancelledStatus("Concluído")).toBe(false)
    })
})

describe("evaluateNoShowAlerts", () => {
    const today = "2026-10-09"

    it("returns empty result for no data", () => {
        const result = evaluateNoShowAlerts([], [], { today })
        expect(result.alerts).toEqual([])
        expect(result.counts).toEqual({ absences: 0, clients: 0, lost_value: 0, future_appointments: 0 })
        expect(result.periodDays).toBe(90)
    })

    it("groups absences per customer and keeps only recurrent clients", () => {
        const rows = [
            { id: "1", customer_id: "c1", customer_name: "Ana", start_date: "2026-09-01", status: "Ausência", price: 50, source: "appointment" },
            { id: "2", customer_id: "c1", customer_name: "Ana", start_date: "2026-09-15", status: "Ausência", price: 30, source: "appointment" },
            { id: "3", customer_id: "c2", customer_name: "Bia", start_date: "2026-09-10", status: "Ausência", price: 80, source: "appointment" },
            { id: "4", customer_id: "c3", customer_name: "Caio", start_date: "2026-09-12", status: "Concluído", price: 40, source: "appointment" },
        ]
        const result = evaluateNoShowAlerts(rows, [], { today })

        expect(result.alerts).toHaveLength(1)
        const alert = result.alerts[0]
        expect(alert.customer_id).toBe("c1")
        expect(alert.absences).toBe(2)
        expect(alert.lost_value).toBe(80)
        expect(alert.last_absence).toBe("2026-09-15")
        expect(result.counts).toEqual({ absences: 2, clients: 1, lost_value: 80, future_appointments: 0 })
        expect(MIN_NO_SHOWS_TO_ALERT).toBe(2)
    })

    it("supports a custom minimum of absences", () => {
        const rows = [
            { id: "1", customer_id: "c2", customer_name: "Bia", start_date: "2026-09-10", status: "Ausência", price: 80, source: "appointment" },
        ]
        const result = evaluateNoShowAlerts(rows, [], { today, minAbsences: 1 })
        expect(result.alerts).toHaveLength(1)
        expect(result.alerts[0].absences).toBe(1)
    })

    it("ignores unavailable blocks, non-absences and out-of-window rows", () => {
        const rows = [
            { id: "1", customer_id: "c1", customer_name: "Ana", start_date: "2026-09-01", status: "Ausência", price: 50, source: "unavailable" },
            { id: "2", customer_id: "c1", customer_name: "Ana", start_date: "2026-09-02", status: "Ausência", price: 50, source: "appointment" },
            { id: "3", customer_id: "c1", customer_name: "Ana", start_date: "2025-01-01", status: "Ausência", price: 50, source: "appointment" },
            { id: "4", customer_id: "c1", customer_name: "Ana", start_date: "2026-10-10", status: "Ausência", price: 50, source: "appointment" },
            { id: "5", customer_id: "c1", customer_name: "Ana", start_date: "2026-09-03", status: "Cancelado", price: 50, source: "appointment" },
        ]
        const result = evaluateNoShowAlerts(rows, [], { today, minAbsences: 1 })
        expect(result.alerts).toHaveLength(1)
        expect(result.alerts[0].absences).toBe(1)
    })

    it("falls back to customer name when there is no customer id", () => {
        const rows = [
            { id: "1", customer_id: null, customer_name: "Cliente Avulso", start_date: "2026-09-01", status: "Ausência", price: 0, source: "appointment" },
            { id: "2", customer_id: null, customer_name: "cliente avulso ", start_date: "2026-09-05", status: "Ausência", price: 0, source: "appointment" },
        ]
        const result = evaluateNoShowAlerts(rows, [], { today })
        expect(result.alerts).toHaveLength(1)
        expect(result.alerts[0].customer_id).toBeNull()
        expect(result.alerts[0].absences).toBe(2)
        expect(result.alerts[0].lost_value).toBe(0)
    })

    it("counts future appointments of alerted customers only", () => {
        const past = [
            { id: "1", customer_id: "c1", customer_name: "Ana", start_date: "2026-09-01", status: "Ausência", price: 50, source: "appointment" },
            { id: "2", customer_id: "c1", customer_name: "Ana", start_date: "2026-09-05", status: "Ausência", price: 50, source: "appointment" },
        ]
        const future = [
            { id: "f1", customer_id: "c1", customer_name: "Ana", start_date: "2026-10-20", status: "Confirmado", price: 50, source: "appointment" },
            { id: "f2", customer_id: "c1", customer_name: "Ana", start_date: "2026-11-01", status: "Reservado", price: 50, source: "appointment" },
            { id: "f3", customer_id: "c1", customer_name: "Ana", start_date: "2026-10-25", status: "Cancelado", price: 50, source: "appointment" },
            { id: "f4", customer_id: "c9", customer_name: "Outro", start_date: "2026-10-25", status: "Reservado", price: 50, source: "appointment" },
        ]
        const result = evaluateNoShowAlerts(past, future, { today })
        expect(result.alerts[0].future_appointments).toBe(2)
        expect(result.counts.future_appointments).toBe(2)
    })

    it("sorts by absences then by lost value", () => {
        const rows = [
            { id: "1", customer_id: "a", customer_name: "A", start_date: "2026-09-01", status: "Ausência", price: 10, source: "appointment" },
            { id: "2", customer_id: "a", customer_name: "A", start_date: "2026-09-02", status: "Ausência", price: 10, source: "appointment" },
            { id: "3", customer_id: "b", customer_name: "B", start_date: "2026-09-03", status: "Ausência", price: 100, source: "appointment" },
            { id: "4", customer_id: "b", customer_name: "B", start_date: "2026-09-04", status: "Ausência", price: 100, source: "appointment" },
            { id: "5", customer_id: "b", customer_name: "B", start_date: "2026-09-05", status: "Ausência", price: 100, source: "appointment" },
        ]
        const result = evaluateNoShowAlerts(rows, [], { today })
        expect(result.alerts.map((a) => a.key)).toEqual(["id:b", "id:a"])
    })

    it("respects a custom period window", () => {
        const rows = [
            { id: "1", customer_id: "c1", customer_name: "Ana", start_date: "2026-09-20", status: "Ausência", price: 50, source: "appointment" },
            { id: "2", customer_id: "c1", customer_name: "Ana", start_date: "2026-08-20", status: "Ausência", price: 50, source: "appointment" },
        ]
        const narrow = evaluateNoShowAlerts(rows, [], { today, periodDays: 30, minAbsences: 1 })
        expect(narrow.periodDays).toBe(30)
        expect(narrow.alerts[0]?.absences).toBe(1)

        const wide = evaluateNoShowAlerts(rows, [], { today, periodDays: 60, minAbsences: 1 })
        expect(wide.alerts[0]?.absences).toBe(2)
    })
})

describe("evaluateStagnantServices", () => {
    const today = "2026-10-09"

    const service = (overrides: Record<string, any>) => ({
        id: "s1",
        name: "Corte",
        price: 50,
        promotional_price: null,
        duration_minutes: 30,
        category: "Cabelo",
        images: null,
        created_at: "2026-01-01T10:00:00+00:00",
        is_unavailable_type: false,
        ...overrides,
    })

    it("returns empty result for no data", () => {
        const result = evaluateStagnantServices([], [], { today })
        expect(result.services).toEqual([])
        expect(result.total).toBe(0)
        expect(result.periodDays).toBe(90)
    })

    it("includes active services with zero usage registered before the cutoff", () => {
        const result = evaluateStagnantServices([service({})], [], { today })
        expect(result.services).toHaveLength(1)
        expect(result.services[0].id).toBe("s1")
        expect(result.services[0].days_stagnant).toBeGreaterThanOrEqual(90)
        expect(result.services[0].price).toBe(50)
    })

    it("excludes services used in the window by id or by name fallback", () => {
        const services = [
            service({ id: "s1", name: "Corte" }),
            service({ id: "s2", name: "Barba" }),
            service({ id: "s3", name: "Escova" }),
        ]
        const usage = [
            { service_id: "s1", service_name: "Corte", start_date: "2026-09-20", source: "appointment" },
            { service_id: null, service_name: "Barba", start_date: "2026-10-01", source: "appointment" },
            { service_id: null, service_name: "Escova", start_date: "2026-09-15", source: "appointment" },
        ]
        const result = evaluateStagnantServices(services, usage, { today })
        expect(result.services.map((s) => s.id)).toEqual([])
    })

    it("ignores unavailable blocks when counting usage", () => {
        const usage = [
            { service_id: "s1", service_name: "Corte", start_date: "2026-09-20", source: "unavailable" },
        ]
        const result = evaluateStagnantServices([service({})], usage, { today })
        expect(result.services).toHaveLength(1)
    })

    it("excludes services created inside the window and unavailable types", () => {
        const services = [
            service({ id: "s1", created_at: "2026-10-01T10:00:00+00:00" }),
            service({ id: "s2", is_unavailable_type: true }),
        ]
        const result = evaluateStagnantServices(services, [], { today })
        expect(result.services).toEqual([])
    })

    it("respects a custom period window", () => {
        const services = [service({ id: "s1", created_at: "2026-08-20T10:00:00+00:00" })]
        const narrow = evaluateStagnantServices(services, [], { today, periodDays: 30 })
        expect(narrow.services).toHaveLength(1)
        expect(narrow.periodDays).toBe(30)
        const wide = evaluateStagnantServices(services, [], { today, periodDays: 60 })
        expect(wide.services).toEqual([])
        expect(wide.periodDays).toBe(60)
    })

    it("sorts by oldest registration first", () => {
        const services = [
            service({ id: "newer", created_at: "2026-05-01T10:00:00+00:00" }),
            service({ id: "older", created_at: "2026-02-01T10:00:00+00:00" }),
        ]
        const result = evaluateStagnantServices(services, [], { today })
        expect(result.services.map((s) => s.id)).toEqual(["older", "newer"])
    })
})

describe("date helpers", () => {
    it("subtracts days across month boundaries", () => {
        expect(subtractDays("2026-10-09", 90)).toBe("2026-07-11")
        expect(subtractDays("2026-03-01", 1)).toBe("2026-02-28")
    })

    it("adds days across month boundaries", () => {
        expect(addDays("2026-10-09", 7)).toBe("2026-10-16")
        expect(addDays("2026-02-28", 1)).toBe("2026-03-01")
    })

    it("calculates days between two dates", () => {
        expect(daysBetween("2026-10-01", "2026-10-09")).toBe(8)
        expect(daysBetween("2026-10-09", "2026-10-09")).toBe(0)
    })

    it("formats a date as yyyy-mm-dd", () => {
        expect(toDateStr(new Date(2026, 0, 5))).toBe("2026-01-05")
    })
})

describe("evaluatePendingConfirmations", () => {
    const today = "2026-10-09"

    it("identifies upcoming appointments with pending status within 7 days", () => {
        const rows = [
            { id: "1", customer_name: "Lucas", start_date: "2026-10-10", start_time: "14:00", status: "Aguardando", price: 50 },
            { id: "2", customer_name: "Mariana", start_date: "2026-10-12", start_time: "09:00", status: "Reservado", price: 80 },
            { id: "3", customer_name: "Pedro", start_date: "2026-10-08", start_time: "10:00", status: "Aguardando", price: 60 }, // past
            { id: "4", customer_name: "Julia", start_date: "2026-10-25", start_time: "15:00", status: "Aguardando", price: 70 }, // too far (>7d)
            { id: "5", customer_name: "Carlos", start_date: "2026-10-11", start_time: "11:00", status: "Confirmado", price: 90 }, // already confirmed
            { id: "6", customer_name: "Bloqueio", start_date: "2026-10-11", status: "Aguardando", source: "unavailable" },
        ]

        const alerts = evaluatePendingConfirmations(rows as any, { today, lookaheadDays: 7 })
        expect(alerts).toHaveLength(2)
        expect(alerts[0].customer_name).toBe("Lucas")
        expect(alerts[1].customer_name).toBe("Mariana")
    })
})

describe("evaluateRescheduleOpportunities", () => {
    const today = "2026-10-09"

    it("finds appointments marked with needs_reschedule and recent cancellations", () => {
        const rows = [
            { id: "1", customer_id: "c1", customer_name: "Roberta", start_date: "2026-10-05", status: "Aguardando", needs_reschedule: true, price: 100 },
            { id: "2", customer_id: "c2", customer_name: "Felipe", start_date: "2026-10-07", status: "Cancelado", price: 120 },
            { id: "3", customer_id: "c3", customer_name: "Beatriz", start_date: "2026-10-08", status: "Confirmado", price: 150 },
        ]
        const future = [
            { id: "4", customer_id: "c2", customer_name: "Felipe", start_date: "2026-10-15", status: "Confirmado" },
        ]

        const result = evaluateRescheduleOpportunities(rows as any, future as any, { today })
        expect(result).toHaveLength(2)

        const roberta = result.find(r => r.customer_name === "Roberta")
        expect(roberta).toBeDefined()
        expect(roberta?.reason).toBe("needs_reschedule")
        expect(roberta?.has_future_appointment).toBe(false)

        const felipe = result.find(r => r.customer_name === "Felipe")
        expect(felipe).toBeDefined()
        expect(felipe?.reason).toBe("cancelled")
        expect(felipe?.has_future_appointment).toBe(true)
    })
})

describe("evaluateRetentionOpportunities", () => {
    const today = "2026-10-09"

    it("identifies past clients with completed appointments inactive for >30 days without future booking", () => {
        const past = [
            { id: "1", customer_id: "c1", customer_name: "Renata", start_date: "2026-08-15", status: "Concluído", price: 150, service_name: "Corte" },
            { id: "2", customer_id: "c1", customer_name: "Renata", start_date: "2026-09-01", status: "Concluído", price: 100, service_name: "Hidratação" },
            { id: "3", customer_id: "c2", customer_name: "Thiago", start_date: "2026-10-02", status: "Pago", price: 80, service_name: "Barba" }, // 7 days ago (<30d)
            { id: "4", customer_id: "c3", customer_name: "Vanessa", start_date: "2026-08-01", status: "Concluído", price: 200, service_name: "Coloração" },
        ]
        const future = [
            { id: "5", customer_id: "c3", customer_name: "Vanessa", start_date: "2026-10-20", status: "Reservado" }, // has future booking
        ]

        const result = evaluateRetentionOpportunities(past as any, future as any, { today, minDaysSinceLast: 30 })
        expect(result).toHaveLength(1)
        expect(result[0].customer_name).toBe("Renata")
        expect(result[0].total_completed).toBe(2)
        expect(result[0].total_spent).toBe(250)
        expect(result[0].last_service_name).toBe("Hidratação")
        expect(result[0].last_date).toBe("2026-09-01")
    })
})
