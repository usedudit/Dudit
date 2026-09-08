import { describe, it, expect } from "vitest"

function isValidOrderNumber(num?: string | null): boolean {
    if (!num) return false
    const clean = String(num).trim()
    if (!clean || clean.startsWith("temp-") || clean.startsWith("temp_")) return false
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return false
    return true
}

function formatItemQuantityUnit(quantity: number, rawUnit?: string | null): string {
    const clean = (rawUnit || "un").trim().toUpperCase().replace(/[.\s]/g, "")
    let unit = "un"
    switch (clean) {
        case "PC":
        case "PECA":
        case "PEÇA":
            unit = "pc"
            break
        case "UN":
        case "UNIDADE":
        case "UND":
            unit = "un"
            break
        case "KG":
        case "QUILO":
            unit = "kg"
            break
        case "LT":
        case "L":
        case "LITRO":
            unit = "L"
            break
        case "MT":
        case "M":
        case "METRO":
            unit = "m"
            break
        case "CX":
        case "CAIXA":
            unit = "cx"
            break
        case "PT":
        case "PCT":
        case "PACOTE":
            unit = "pct"
            break
        case "DZ":
        case "DUZIA":
        case "DÚZIA":
            unit = "dz"
            break
        default:
            unit = rawUnit ? rawUnit.trim().toLowerCase() : "un"
    }
    return `${quantity}${unit}`
}

function formatBookingDisplayDate(dateStr?: string | null): string {
    if (!dateStr) return ""
    if (dateStr.includes("/")) return dateStr
    const [year, month, day] = dateStr.split("-")
    if (year && month && day) {
        return `${day}/${month}/${year}`
    }
    return dateStr
}

describe("Payment & Confirmation Formatters", () => {
    describe("isValidOrderNumber", () => {
        it("identifies valid order numbers", () => {
            expect(isValidOrderNumber("1001")).toBe(true)
            expect(isValidOrderNumber("#1001")).toBe(true)
            expect(isValidOrderNumber("PED-2026")).toBe(true)
        })

        it("rejects UUIDs and temp IDs", () => {
            expect(isValidOrderNumber("550e8400-e29b-41d4-a716-446655440000")).toBe(false)
            expect(isValidOrderNumber("temp-1725800000")).toBe(false)
            expect(isValidOrderNumber("temp_xyz")).toBe(false)
            expect(isValidOrderNumber("")).toBe(false)
            expect(isValidOrderNumber(null)).toBe(false)
            expect(isValidOrderNumber(undefined)).toBe(false)
        })
    })

    describe("formatItemQuantityUnit", () => {
        it("formats according to user specifications", () => {
            expect(formatItemQuantityUnit(3, "pc")).toBe("3pc")
            expect(formatItemQuantityUnit(2, "un")).toBe("2un")
            expect(formatItemQuantityUnit(2)).toBe("2un")
            expect(formatItemQuantityUnit(2, null)).toBe("2un")
            expect(formatItemQuantityUnit(4, "peça")).toBe("4pc")
            expect(formatItemQuantityUnit(1.5, "kg")).toBe("1.5kg")
            expect(formatItemQuantityUnit(5, "cx")).toBe("5cx")
            expect(formatItemQuantityUnit(10, "m")).toBe("10m")
        })
    })

    describe("formatBookingDisplayDate", () => {
        it("formats ISO date to Brazilian format", () => {
            expect(formatBookingDisplayDate("2026-09-08")).toBe("08/09/2026")
            expect(formatBookingDisplayDate("08/09/2026")).toBe("08/09/2026")
            expect(formatBookingDisplayDate("")).toBe("")
            expect(formatBookingDisplayDate(null)).toBe("")
        })
    })
})
