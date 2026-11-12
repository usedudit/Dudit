import { describe, it, expect } from "vitest"
import { PERMISSION_PRESETS } from "./partner-roles"
import { can } from "./can"
import { ROUTE_MAP } from "./route-permissions"

describe("recurring_subscriptions.can_advance_cycle permission", () => {
  it("allows OWNER to advance cycle", () => {
    const ownerTemplate = PERMISSION_PRESETS.OWNER
    expect(ownerTemplate.recurring_subscriptions.can_advance_cycle).toBe(true)
    expect(can({ role_id: "owner", permissions: ownerTemplate }, "recurring_subscriptions.can_advance_cycle")).toBe(true)
  })

  it("allows ADMIN to advance cycle", () => {
    const adminTemplate = PERMISSION_PRESETS.ADMIN
    expect(adminTemplate.recurring_subscriptions.can_advance_cycle).toBe(true)
    expect(can({ role_id: "admin", permissions: adminTemplate }, "recurring_subscriptions.can_advance_cycle")).toBe(true)
  })

  it("strictly forbids MANAGER from advancing cycle", () => {
    const managerTemplate = PERMISSION_PRESETS.MANAGER
    expect(managerTemplate.recurring_subscriptions.can_advance_cycle).toBe(false)
    expect(can({ role_id: "manager", permissions: managerTemplate }, "recurring_subscriptions.can_advance_cycle")).toBe(false)
  })

  it("strictly forbids OPERATOR from advancing cycle", () => {
    const operatorTemplate = PERMISSION_PRESETS.OPERATOR
    expect(operatorTemplate.recurring_subscriptions.can_advance_cycle).toBe(false)
    expect(can({ role_id: "operator", permissions: operatorTemplate }, "recurring_subscriptions.can_advance_cycle")).toBe(false)
  })

  it("strictly forbids DELIVERY from advancing cycle", () => {
    const deliveryTemplate = PERMISSION_PRESETS.DELIVERY
    expect(deliveryTemplate.recurring_subscriptions.can_advance_cycle).toBe(false)
    expect(can({ role_id: "delivery", permissions: deliveryTemplate }, "recurring_subscriptions.can_advance_cycle")).toBe(false)
  })

  it("registers can_advance_cycle in route permissions specific permissions", () => {
    expect(ROUTE_MAP.recurring_subscriptions.specificPermissions).toContain("can_advance_cycle")
  })
})
