import { describe, it, expect } from "vitest"
import {
    getDefaultMarginPercent,
    getMarginThresholdPercent,
    getSuggestedPrice,
    calculateMarginPercent,
    evaluatePricing,
    sortPricingAlerts,
    DEFAULT_MARGIN_PERCENT,
} from "./pricing-alerts"

describe("getDefaultMarginPercent", () => {
    it("uses defaultMarginPercent from sales settings", () => {
        expect(getDefaultMarginPercent({ salesSettings: { defaultMarginPercent: 40 } })).toBe(40)
    })

    it("ignores unknown sales settings keys", () => {
        expect(getDefaultMarginPercent({ salesSettings: { unknownKey: 25 } })).toBe(DEFAULT_MARGIN_PERCENT)
    })

    it("returns 30 when settings are missing or invalid", () => {
        expect(getDefaultMarginPercent(null)).toBe(DEFAULT_MARGIN_PERCENT)
        expect(getDefaultMarginPercent({})).toBe(DEFAULT_MARGIN_PERCENT)
        expect(getDefaultMarginPercent({ salesSettings: {} })).toBe(DEFAULT_MARGIN_PERCENT)
        expect(getDefaultMarginPercent({ salesSettings: { defaultMarginPercent: 150 } })).toBe(
            DEFAULT_MARGIN_PERCENT
        )
        expect(getDefaultMarginPercent({ salesSettings: { defaultMarginPercent: "abc" } })).toBe(
            DEFAULT_MARGIN_PERCENT
        )
    })

    it("accepts numeric strings and explicit zero", () => {
        expect(getDefaultMarginPercent({ salesSettings: { defaultMarginPercent: "35" } })).toBe(35)
        expect(getDefaultMarginPercent({ salesSettings: { defaultMarginPercent: 0 } })).toBe(0)
    })
})

describe("getMarginThresholdPercent", () => {
    it("uses half of the default margin", () => {
        expect(getMarginThresholdPercent(30)).toBe(15)
        expect(getMarginThresholdPercent(40)).toBe(20)
    })

    it("keeps a minimum floor of 5%", () => {
        expect(getMarginThresholdPercent(8)).toBe(5)
        expect(getMarginThresholdPercent(0)).toBe(5)
    })
})

describe("getSuggestedPrice", () => {
    it("applies markup on cost and rounds to cents", () => {
        expect(getSuggestedPrice(100, 30)).toBe(130)
        expect(getSuggestedPrice(33.33, 30)).toBe(43.33)
        expect(getSuggestedPrice(50, 0)).toBe(50)
    })
})

describe("calculateMarginPercent", () => {
    it("computes margin over sale price", () => {
        expect(calculateMarginPercent(100, 70)).toBe(30)
        expect(calculateMarginPercent(200, 150)).toBe(25)
    })

    it("returns null when there is no sale price", () => {
        expect(calculateMarginPercent(0, 10)).toBeNull()
    })

    it("returns negative margin when selling below cost", () => {
        expect(calculateMarginPercent(10, 20)).toBe(-100)
    })
})

describe("evaluatePricing", () => {
    const threshold = getMarginThresholdPercent(30)

    it("flags products selling below cost as loss", () => {
        const result = evaluatePricing({ price: 10, costPrice: 20, hasVariants: false }, 30, threshold)
        expect(result.status).toBe("loss")
        expect(result.cause).toBe("price")
        expect(result.effectivePrice).toBe(10)
        expect(result.marginPercent).toBe(-100)
        expect(result.lossPerUnit).toBe(10)
        expect(result.suggestedPrice).toBe(26)
    })

    it("flags price equal to cost as loss with zero margin", () => {
        const result = evaluatePricing({ price: 20, costPrice: 20, hasVariants: false }, 30, threshold)
        expect(result.status).toBe("loss")
        expect(result.marginPercent).toBe(0)
        expect(result.lossPerUnit).toBe(0)
        expect(result.potentialGainPerUnit).toBe(6)
    })

    it("flags missing sale price with a cost as loss", () => {
        const result = evaluatePricing({ price: 0, costPrice: 10, hasVariants: false }, 30, threshold)
        expect(result.status).toBe("loss")
        expect(result.effectivePrice).toBe(0)
        expect(result.marginPercent).toBeNull()
        expect(result.lossPerUnit).toBe(10)
    })

    it("flags thin margins below the threshold", () => {
        const result = evaluatePricing({ price: 100, costPrice: 86, hasVariants: false }, 30, threshold)
        expect(result.status).toBe("thin")
        expect(result.marginPercent).toBe(14)
        expect(result.suggestedPrice).toBe(111.8)
        expect(result.potentialGainPerUnit).toBe(11.8)
    })

    it("accepts a margin exactly on the threshold", () => {
        const result = evaluatePricing({ price: 100, costPrice: 85, hasVariants: false }, 30, threshold)
        expect(result.status).toBe("ok")
        expect(result.marginPercent).toBe(15)
    })

    it("accepts healthy margins", () => {
        const result = evaluatePricing({ price: 100, costPrice: 50, hasVariants: false }, 30, threshold)
        expect(result.status).toBe("ok")
        expect(result.marginPercent).toBe(50)
    })

    it("detects promotional price below cost while base price is healthy", () => {
        const result = evaluatePricing(
            { price: 40, costPrice: 20, promotionalPrice: 15, hasVariants: false },
            30,
            threshold
        )
        expect(result.status).toBe("loss")
        expect(result.cause).toBe("promo")
        expect(result.basePrice).toBe(40)
        expect(result.effectivePrice).toBe(15)
        expect(result.lossPerUnit).toBe(5)
    })

    it("keeps cause as price when the base price is already the problem", () => {
        const result = evaluatePricing(
            { price: 16, costPrice: 20, promotionalPrice: 15, hasVariants: false },
            30,
            threshold
        )
        expect(result.status).toBe("loss")
        expect(result.cause).toBe("price")
        expect(result.effectivePrice).toBe(15)
    })

    it("ignores promotional price when the product has variants", () => {
        const result = evaluatePricing(
            { price: 40, costPrice: 50, promotionalPrice: 45, variantMinPrice: 60, hasVariants: true },
            30,
            threshold
        )
        expect(result.effectivePrice).toBe(60)
        expect(result.status).toBe("ok")
    })

    it("evaluates variant products by the lowest variant price", () => {
        const result = evaluatePricing(
            { price: 100, costPrice: 40, variantMinPrice: 30, hasVariants: true },
            30,
            threshold
        )
        expect(result.effectivePrice).toBe(30)
        expect(result.status).toBe("loss")
        expect(result.lossPerUnit).toBe(10)
    })

    it("skips products without cost", () => {
        const result = evaluatePricing({ price: 10, costPrice: 0, hasVariants: false }, 30, threshold)
        expect(result.status).toBe("ok")
    })
})

describe("sortPricingAlerts", () => {
    it("orders losses first, then by impact descending", () => {
        const sorted = sortPricingAlerts([
            { id: "a", status: "thin" as const, impact: 500 },
            { id: "b", status: "loss" as const, impact: 10 },
            { id: "c", status: "loss" as const, impact: 300 },
            { id: "d", status: "thin" as const, impact: 900 },
        ])
        expect(sorted.map((a) => a.id)).toEqual(["c", "b", "d", "a"])
    })
})
