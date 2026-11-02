import { describe, it, expect } from "vitest"
import {
  normalizeBusinessInfo,
  readOnboardingState,
  toBusinessInfoRecord,
} from "@/lib/business-info"

describe("business-info - onboarding state", () => {
  describe("normalizeBusinessInfo", () => {
    it("preserves the onboarding flags", () => {
      const result = normalizeBusinessInfo({
        mode: "erp",
        activeResources: ["orders", "products"],
        onboardingCompleted: true,
        onboardingGoals: ["products", "services"],
        onboardingCompletedAt: "2026-11-02T10:00:00.000Z",
      })

      expect(result.onboardingCompleted).toBe(true)
      expect(result.onboardingGoals).toEqual(["products", "services"])
      expect(result.onboardingCompletedAt).toBe("2026-11-02T10:00:00.000Z")
    })

    it("preserves the onboarding flags when business_info arrives as a JSON string", () => {
      const result = normalizeBusinessInfo(
        JSON.stringify({ mode: "erp", onboardingCompleted: true })
      )

      expect(result.onboardingCompleted).toBe(true)
    })

    it("keeps onboardingCompleted false when the partner never completed the guide", () => {
      const result = normalizeBusinessInfo({ mode: "erp" })

      expect(result.onboardingCompleted).toBeUndefined()
    })

    it("ignores malformed onboarding payloads", () => {
      const result = normalizeBusinessInfo({
        onboardingCompleted: "sim",
        onboardingGoals: "products",
        onboardingCompletedAt: 42,
      })

      expect(result.onboardingCompleted).toBeUndefined()
      expect(result.onboardingGoals).toBeUndefined()
      expect(result.onboardingCompletedAt).toBeUndefined()
    })
  })

  describe("toBusinessInfoRecord", () => {
    it("returns the raw record so unknown keys are not dropped", () => {
      const record = toBusinessInfoRecord({
        mode: "erp",
        customField: "keep-me",
        onboardingCompleted: true,
      })

      expect(record.customField).toBe("keep-me")
      expect(record.onboardingCompleted).toBe(true)
    })

    it("parses JSON strings", () => {
      const record = toBusinessInfoRecord('{"mode":"quick","onboardingCompleted":true}')

      expect(record.mode).toBe("quick")
      expect(record.onboardingCompleted).toBe(true)
    })

    it("returns an empty object for invalid input", () => {
      expect(toBusinessInfoRecord(null)).toEqual({})
      expect(toBusinessInfoRecord(undefined)).toEqual({})
      expect(toBusinessInfoRecord("not-json")).toEqual({})
      expect(toBusinessInfoRecord([1, 2, 3])).toEqual({})
    })
  })

  describe("readOnboardingState", () => {
    it("reports the guide as completed when the flag is set", () => {
      const state = readOnboardingState({
        onboardingCompleted: true,
        onboardingGoals: ["products"],
        onboardingCompletedAt: "2026-11-02T10:00:00.000Z",
      })

      expect(state.completed).toBe(true)
      expect(state.goals).toEqual(["products"])
      expect(state.completedAt).toBe("2026-11-02T10:00:00.000Z")
    })

    it("reports the guide as pending when there is no flag", () => {
      const state = readOnboardingState({ mode: "erp", activeResources: ["orders"] })

      expect(state.completed).toBe(false)
      expect(state.goals).toEqual([])
    })

    it("reads the flag from a JSON string", () => {
      const state = readOnboardingState(JSON.stringify({ onboardingCompleted: true }))

      expect(state.completed).toBe(true)
    })
  })
})
