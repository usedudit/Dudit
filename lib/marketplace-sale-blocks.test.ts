import { describe, expect, it } from "vitest"
import { resolveRecurringPlanSaleBlock } from "./marketplace-sale-blocks"

const baseCapabilities = {
  recurringEnabled: true,
  productsEnabled: true,
  servicesEnabled: true,
  appointmentsViaDudit: true,
  deliveriesEnabled: true,
}

describe("resolveRecurringPlanSaleBlock", () => {
  it("allows a product plan when every required resource is active", () => {
    expect(
      resolveRecurringPlanSaleBlock(baseCapabilities, [{ item_type: "product" }], "pickup"),
    ).toBeNull()
  })

  it("blocks new sales when recurring resources are disabled", () => {
    expect(
      resolveRecurringPlanSaleBlock(
        { ...baseCapabilities, recurringEnabled: false },
        [{ item_type: "product" }],
        "pickup",
      ),
    ).toBe("recurring_disabled")
  })

  it("blocks product plans when products are disabled", () => {
    expect(
      resolveRecurringPlanSaleBlock(
        { ...baseCapabilities, productsEnabled: false },
        [{ item_type: "product" }],
        "pickup",
      ),
    ).toBe("products_disabled")
  })

  it("blocks service plans when appointments are disabled", () => {
    expect(
      resolveRecurringPlanSaleBlock(
        { ...baseCapabilities, appointmentsViaDudit: false },
        [{ item_type: "service" }],
        "pickup",
      ),
    ).toBe("appointments_disabled")
  })

  it("blocks delivery-only plans when deliveries are disabled", () => {
    expect(
      resolveRecurringPlanSaleBlock(
        { ...baseCapabilities, deliveriesEnabled: false },
        [{ item_type: "product" }],
        "delivery",
      ),
    ).toBe("deliveries_disabled")
  })

  it("still allows pickup when deliveries are disabled", () => {
    expect(
      resolveRecurringPlanSaleBlock(
        { ...baseCapabilities, deliveriesEnabled: false },
        [{ item_type: "product" }],
        "pickup",
      ),
    ).toBeNull()
  })
})
