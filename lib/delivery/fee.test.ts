import { describe, it, expect } from "vitest"
import {
  calculateDeliveryFee,
  getEffectiveMaxDeliveryKm,
  hasDeliveryRatesConfigured,
  type DeliverySettings,
  type DeliveryFeeRule,
} from "./fee"

describe("Delivery Fee Calculation & Configuration", () => {
  const defaultSettings: DeliverySettings = {
    baseFee: 0,
    includedKm: 0,
    extraKmPrice: 0,
    maxDeliveryKm: null,
    isDeliveryEnabled: true,
    isPickupEnabled: true,
    freeDeliveryThreshold: null,
    deliveryPayer: "customer",
  }

  describe("hasDeliveryRatesConfigured", () => {
    it("should return false when no delivery rates or distance rules are configured", () => {
      expect(hasDeliveryRatesConfigured(defaultSettings, [])).toBe(false)
      expect(hasDeliveryRatesConfigured(null, null)).toBe(false)
      expect(
        hasDeliveryRatesConfigured({
          baseFee: 0,
          includedKm: 0,
          extraKmPrice: 0,
          maxDeliveryKm: 0,
          freeDeliveryThreshold: 0,
          deliveryPayer: "customer",
          isDeliveryEnabled: true,
          isPickupEnabled: true,
        }, [])
      ).toBe(false)
    })

    it("should return true when baseFee > 0", () => {
      expect(
        hasDeliveryRatesConfigured({ ...defaultSettings, baseFee: 10 }, [])
      ).toBe(true)
    })

    it("should return true when includedKm > 0", () => {
      expect(
        hasDeliveryRatesConfigured({ ...defaultSettings, includedKm: 5 }, [])
      ).toBe(true)
    })

    it("should return true when extraKmPrice > 0", () => {
      expect(
        hasDeliveryRatesConfigured({ ...defaultSettings, extraKmPrice: 2.5 }, [])
      ).toBe(true)
    })

    it("should return true when maxDeliveryKm > 0", () => {
      expect(
        hasDeliveryRatesConfigured({ ...defaultSettings, maxDeliveryKm: 15 }, [])
      ).toBe(true)
    })

    it("should return true when freeDeliveryThreshold > 0", () => {
      expect(
        hasDeliveryRatesConfigured({ ...defaultSettings, freeDeliveryThreshold: 100 }, [])
      ).toBe(true)
    })

    it("should return true when deliveryPayer is seller", () => {
      expect(
        hasDeliveryRatesConfigured({ ...defaultSettings, deliveryPayer: "seller" }, [])
      ).toBe(true)
    })

    it("should return true when active rules with value > 0 exist", () => {
      const activeRule: DeliveryFeeRule = {
        id: "rule-1",
        startTime: "18:00",
        endTime: "23:59",
        type: "fixed",
        value: 5,
        isActive: true,
      }
      expect(
        hasDeliveryRatesConfigured(defaultSettings, [activeRule])
      ).toBe(true)
    })

    it("should return false when rules are inactive or value is 0", () => {
      const inactiveRule: DeliveryFeeRule = {
        id: "rule-1",
        startTime: "18:00",
        endTime: "23:59",
        type: "fixed",
        value: 5,
        isActive: false,
      }
      expect(
        hasDeliveryRatesConfigured(defaultSettings, [inactiveRule])
      ).toBe(false)
    })
  })

  describe("calculateDeliveryFee with hasRatesConfigured breakdown", () => {
    it("should return hasRatesConfigured: false when store has no delivery fee settings", () => {
      const result = calculateDeliveryFee({
        distanceKm: 4,
        currentTime: new Date(),
        settings: defaultSettings,
        rules: [],
      })

      expect(result.fee).toBe(0)
      expect(result.breakdown.hasRatesConfigured).toBe(false)
      expect(result.breakdown.deliveryPayer).toBe("customer")
    })

    it("should return hasRatesConfigured: true when store has configured distance pricing", () => {
      const result = calculateDeliveryFee({
        distanceKm: 5,
        currentTime: new Date(),
        settings: {
          ...defaultSettings,
          baseFee: 7,
          includedKm: 2,
          extraKmPrice: 2,
          maxDeliveryKm: 10,
        },
        rules: [],
      })

      expect(result.fee).toBe(13) // 7 + (5-2)*2 = 13
      expect(result.breakdown.hasRatesConfigured).toBe(true)
    })

    it("should return hasRatesConfigured: true and fee: 0 when free delivery threshold is reached", () => {
      const result = calculateDeliveryFee({
        distanceKm: 3,
        currentTime: new Date(),
        settings: {
          ...defaultSettings,
          baseFee: 10,
          freeDeliveryThreshold: 50,
        },
        rules: [],
        orderSubtotal: 60,
      })

      expect(result.fee).toBe(0)
      expect(result.breakdown.isFreeByThreshold).toBe(true)
      expect(result.breakdown.hasRatesConfigured).toBe(true)
    })

    it("should NOT apply free delivery when freeDeliveryThreshold is 0 or null", () => {
      const result = calculateDeliveryFee({
        distanceKm: 3,
        currentTime: new Date(),
        settings: {
          ...defaultSettings,
          baseFee: 10,
          freeDeliveryThreshold: 0,
        },
        rules: [],
        orderSubtotal: 60,
      })

      expect(result.fee).toBe(10)
      expect(result.breakdown.isFreeByThreshold).toBe(false)
    })

    it("should return hasRatesConfigured: true and fee: 0 when free delivery coupon is applied", () => {
      const result = calculateDeliveryFee({
        distanceKm: 3,
        currentTime: new Date(),
        settings: {
          ...defaultSettings,
          baseFee: 10,
        },
        rules: [],
        freeDeliveryCoupon: true,
      })

      expect(result.fee).toBe(0)
      expect(result.breakdown.freeDeliveryReason).toBe("coupon")
      expect(result.breakdown.hasRatesConfigured).toBe(true)
    })

    it("should throw outside radius when distance exceeds includedKm and maxDeliveryKm is null", () => {
      expect(() =>
        calculateDeliveryFee({
          distanceKm: 600,
          currentTime: new Date(),
          settings: {
            ...defaultSettings,
            baseFee: 5,
            includedKm: 5,
            maxDeliveryKm: null,
          },
          rules: [],
        })
      ).toThrow("Endereço fora do raio de entrega.")
    })

    it("should allow delivery when distance is within includedKm and maxDeliveryKm is null", () => {
      const result = calculateDeliveryFee({
        distanceKm: 4.5,
        currentTime: new Date(),
        settings: {
          ...defaultSettings,
          baseFee: 5,
          includedKm: 5,
          maxDeliveryKm: null,
        },
        rules: [],
      })

      expect(result.fee).toBe(5)
      expect(result.breakdown.isOutsideRadius).toBe(false)
      expect(result.breakdown.maxDeliveryKm).toBe(5)
    })

    it("should prefer maxDeliveryKm over includedKm when both are set", () => {
      expect(getEffectiveMaxDeliveryKm({ includedKm: 5, maxDeliveryKm: 15 })).toBe(15)
      expect(getEffectiveMaxDeliveryKm({ includedKm: 5, maxDeliveryKm: null })).toBe(5)
      expect(getEffectiveMaxDeliveryKm({ included_km: 8, max_delivery_km: 0 })).toBe(8)
      expect(getEffectiveMaxDeliveryKm({ includedKm: 0, maxDeliveryKm: null })).toBeNull()

      expect(() =>
        calculateDeliveryFee({
          distanceKm: 16,
          currentTime: new Date(),
          settings: {
            ...defaultSettings,
            baseFee: 5,
            includedKm: 5,
            extraKmPrice: 2,
            maxDeliveryKm: 15,
          },
          rules: [],
        })
      ).toThrow("Endereço fora do raio de entrega.")
    })

    it("should reject distant addresses (e.g. 500km) using the 50km fallback when no maxDeliveryKm/includedKm is configured", () => {
      expect(() =>
        calculateDeliveryFee({
          distanceKm: 500,
          currentTime: new Date(),
          settings: {
            ...defaultSettings,
            baseFee: 5,
            includedKm: 0,
            extraKmPrice: 0,
            maxDeliveryKm: null,
          },
          rules: [],
        })
      ).toThrow("Endereço fora do raio de entrega.")
    })
  })
})
