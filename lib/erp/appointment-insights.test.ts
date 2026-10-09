import { describe, it, expect } from "vitest"
import {
    isNoShowStatus,
    isCancelledStatus,
    evaluateNoShowAlerts,
    evaluateStagnantServices,
    subtractDays,
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

    it("formats a date as yyyy-mm-dd", () => {
        expect(toDateStr(new Date(2026, 0, 5))).toBe("2026-01-05")
    })
})
