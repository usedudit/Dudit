import { describe, it, expect } from "vitest"
import { getLocationLabel, type LocationContext } from "./location-label"

describe("getLocationLabel", () => {
    describe("Country scope (Brasil)", () => {
        const countryContext: LocationContext = { scope: "country" }

        it("shows 'City, UF' when seller has city and state", () => {
            const partner = { city: "Maringá", state: "PR" }
            expect(getLocationLabel(partner, countryContext)).toBe("Maringá, PR")
        })

        it("cleans trailing state from city name to avoid duplication (e.g. 'Maringá, PR' + 'PR')", () => {
            const partner = { city: "Maringá, PR", state: "PR" }
            expect(getLocationLabel(partner, countryContext)).toBe("Maringá, PR")

            const partnerDash = { city: "São Paulo - SP", state: "SP" }
            expect(getLocationLabel(partnerDash, countryContext)).toBe("São Paulo, SP")
        })

        it("shows city name when state is not available", () => {
            const partner = { city: "Campinas" }
            expect(getLocationLabel(partner, countryContext)).toBe("Campinas")
        })

        it("shows state when city is not available", () => {
            const partner = { state: "SP" }
            expect(getLocationLabel(partner, countryContext)).toBe("SP")
        })

        it("returns null when neither city nor state is available", () => {
            expect(getLocationLabel({}, countryContext)).toBe(null)
            expect(getLocationLabel(null, countryContext)).toBe(null)
        })
    })

    describe("State scope (Estado)", () => {
        const stateContext: LocationContext = { scope: "state", state: "SP" }

        it("shows only city name when seller is in the same state", () => {
            const partner = { city: "Campinas", state: "SP" }
            expect(getLocationLabel(partner, stateContext)).toBe("Campinas")
        })

        it("shows 'City, UF' when seller is from a different state", () => {
            const partner = { city: "Curitiba", state: "PR" }
            expect(getLocationLabel(partner, stateContext)).toBe("Curitiba, PR")
        })

        it("shows 'City, UF' if state context has no specific state", () => {
            const genericStateContext: LocationContext = { scope: "state" }
            const partner = { city: "Campinas", state: "SP" }
            expect(getLocationLabel(partner, genericStateContext)).toBe("Campinas, SP")
        })
    })

    describe("City scope (Local)", () => {
        const cityContext: LocationContext = { scope: "city", city: "Maringá", state: "PR" }

        it("returns null for seller in the same city (shows distance/delivery time instead)", () => {
            const partner = { city: "Maringá", state: "PR" }
            expect(getLocationLabel(partner, cityContext)).toBe(null)
        })

        it("shows city name for seller from another city in the same state", () => {
            const partner = { city: "Londrina", state: "PR" }
            expect(getLocationLabel(partner, cityContext)).toBe("Londrina")
        })

        it("shows 'City, UF' for seller from another state", () => {
            const partner = { city: "São Paulo", state: "SP" }
            expect(getLocationLabel(partner, cityContext)).toBe("São Paulo, SP")
        })
    })
})
