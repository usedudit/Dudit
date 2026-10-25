import { describe, expect, it } from "vitest"
import {
  SYSTEM_RESOURCES,
  SYSTEM_RESOURCE_MODULE_LABELS,
  SYSTEM_RESOURCES_VERSION,
  isSystemResourceActive,
  resolveActiveResources,
} from "./system-resources"

describe("system resources: assinaturas", () => {
  it("groups recurring resources in their own module", () => {
    const recurring = SYSTEM_RESOURCES.filter((resource) => resource.module === "recurring")

    expect(SYSTEM_RESOURCE_MODULE_LABELS.recurring).toBe("Assinaturas")
    expect(recurring.map((resource) => resource.id)).toEqual([
      "recurringPlans",
      "recurringSubscriptions",
    ])
  })

  it("keeps recurring resources active for legacy ERP partners that never saved the new version", () => {
    const activeResources = resolveActiveResources({
      mode: "erp",
      activeResources: ["orders", "products"],
    })

    expect(activeResources).toEqual(
      expect.arrayContaining(["recurringPlans", "recurringSubscriptions"]),
    )
  })

  it("respects explicit recurring choices after the partner saves the current version", () => {
    const businessInfo = {
      mode: "erp",
      activeResources: ["orders", "products"],
      resourcesVersion: SYSTEM_RESOURCES_VERSION,
    }

    expect(isSystemResourceActive(businessInfo, "recurringPlans")).toBe(false)
    expect(isSystemResourceActive(businessInfo, "recurringSubscriptions")).toBe(false)
  })

  it("does not enable recurring resources outside ERP mode", () => {
    const activeResources = resolveActiveResources({
      mode: "quick",
      activeResources: ["orders", "products"],
    })

    expect(activeResources).not.toContain("recurringPlans")
    expect(activeResources).not.toContain("recurringSubscriptions")
  })
})
