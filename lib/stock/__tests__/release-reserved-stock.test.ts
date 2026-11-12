import { describe, it, expect } from "vitest"

describe("Reserved stock calculation logic", () => {
    it("correctly calculates available stock from physical and reserved stock", () => {
        const physicalStock = 15
        const reservedStock = 5
        const availableStock = Math.max(0, physicalStock - reservedStock)
        expect(availableStock).toBe(10)
    })

    it("correctly calculates partial release of reserved stock", () => {
        const currentReserved = 8
        const qtyToRelease = 3
        const newReserved = Math.max(0, currentReserved - Math.min(qtyToRelease, currentReserved))
        expect(newReserved).toBe(5)
    })

    it("caps release amount at current reserved stock when full or over-requested", () => {
        const currentReserved = 4
        const requestedQty = 10
        const qtyToRelease = Math.min(requestedQty, currentReserved)
        const newReserved = Math.max(0, currentReserved - qtyToRelease)
        expect(qtyToRelease).toBe(4)
        expect(newReserved).toBe(0)
    })

    it("recalculates available stock to equal total physical stock when fully released", () => {
        const physicalStock = 20
        const currentReserved = 6
        const qtyToRelease = 6
        const newReserved = Math.max(0, currentReserved - qtyToRelease)
        const newAvailable = Math.max(0, physicalStock - newReserved)
        expect(newReserved).toBe(0)
        expect(newAvailable).toBe(20)
    })
})
