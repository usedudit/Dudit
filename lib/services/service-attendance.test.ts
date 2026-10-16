import { describe, expect, it } from "vitest"
import {
    calculateServiceTravelFee,
    isServiceWithinAttendanceRadius,
    normalizeServiceAttendanceSettings,
} from "@/lib/services/service-attendance"

describe("service-attendance", () => {
    it("free mode charges nothing within radius", () => {
        const s = normalizeServiceAttendanceSettings({ travel_fee_mode: "free", max_service_km: 10 })
        expect(calculateServiceTravelFee(s, 5)).toEqual(
            expect.objectContaining({ fee: 0, outOfRadius: false, mode: "free", chargedKm: 5 }),
        )
    })

    it("flat mode returns flat fee inside radius", () => {
        const s = normalizeServiceAttendanceSettings({ travel_fee_mode: "flat", travel_flat_fee: 20, max_service_km: 10 })
        expect(calculateServiceTravelFee(s, 5).fee).toBe(20)
    })

    it("per_km charges only for km beyond free tier", () => {
        const s = normalizeServiceAttendanceSettings({
            travel_fee_mode: "per_km",
            free_travel_km: 2,
            travel_per_km: 5,
            max_service_km: 10,
        })
        expect(calculateServiceTravelFee(s, 7).fee).toBe(25) // (7-2)*5
        expect(calculateServiceTravelFee(s, 2).fee).toBe(0)
    })

    it("tiered mode picks the right band", () => {
        const s = normalizeServiceAttendanceSettings({
            travel_fee_mode: "tiered",
            travel_tiers: [{ upToKm: 5, fee: 10 }, { upToKm: 10, fee: 20 }],
            max_service_km: 15,
        })
        expect(calculateServiceTravelFee(s, 3).fee).toBe(10)
        expect(calculateServiceTravelFee(s, 7).fee).toBe(20)
        expect(calculateServiceTravelFee(s, 12).fee).toBe(20) // above last tier -> last band
    })

    it("blocks when outside radius and enforce is on", () => {
        const s = normalizeServiceAttendanceSettings({ max_service_km: 5, enforce_service_area: true })
        const r = calculateServiceTravelFee(s, 9)
        expect(r.outOfRadius).toBe(true)
        expect(r.fee).toBe(0)
        expect(isServiceWithinAttendanceRadius(s, 9)).toBe(false)
        expect(isServiceWithinAttendanceRadius(s, 5)).toBe(true)
    })

    it("null distance => out of radius", () => {
        const s = normalizeServiceAttendanceSettings({ max_service_km: 5 })
        const r = calculateServiceTravelFee(s, null)
        expect(r.outOfRadius).toBe(true)
        expect(isServiceWithinAttendanceRadius(s, null)).toBe(false)
    })
})
