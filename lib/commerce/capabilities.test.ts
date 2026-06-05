import { describe, expect, it } from "vitest"
import {
  deriveLineFlags,
  isFulfillmentModeAllowed,
  mergePlanItemFulfillmentModes,
  productCatalogCapabilities,
  serviceCatalogCapabilities,
} from "@/lib/commerce/capabilities"
import { aggregateCheckoutRequirements } from "@/lib/commerce/checkout-requirements"

describe("capabilities", () => {
  it("defaults physical product to delivery and pickup", () => {
    const caps = productCatalogCapabilities({ product_type: "Físico" })
    expect(caps.fulfillmentModes).toEqual(["delivery", "pickup"])
    expect(caps.schedulingEnabled).toBe(false)
  })

  it("derives address requirement for customer_location services", () => {
    const caps = serviceCatalogCapabilities({
      fulfillment_modes: ["on_site", "customer_location"],
      scheduling_enabled: true,
    })
    const flags = deriveLineFlags(caps, "customer_location", { schedulingMetadataComplete: true })
    expect(flags.requiresCustomerAddress).toBe(true)
    expect(flags.requiresDelivery).toBe(false)
    expect(flags.expectsAppointment).toBe(true)
  })

  it("merges plan item fulfillment modes", () => {
    const merged = mergePlanItemFulfillmentModes(
      [["delivery", "pickup"]],
      [["on_site"]],
    )
    expect(merged).toContain("delivery")
    expect(merged).toContain("on_site")
  })

  it("service-only checkout hides product delivery and pay on delivery", () => {
    const caps = serviceCatalogCapabilities({
      fulfillment_modes: ["on_site"],
      scheduling_enabled: true,
    })
    const requirements = aggregateCheckoutRequirements([
      {
        lineId: "s1",
        lineKind: "service_booking",
        catalog: caps,
        fulfillmentMode: "on_site",
        schedulingMetadataComplete: true,
      },
    ])
    expect(requirements.showProductFulfillmentOptions).toBe(false)
    expect(requirements.allowPayOnDelivery).toBe(false)
    expect(requirements.showPartnerLocation).toBe(true)
  })

  it("rejects invalid selected mode", () => {
    expect(isFulfillmentModeAllowed(["on_site"], "delivery")).toBe(false)
  })
})
