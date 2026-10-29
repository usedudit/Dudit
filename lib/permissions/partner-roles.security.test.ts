import { describe, expect, it } from "vitest"
import { canModifyUser, canUserInviteRole } from "@/lib/permissions/partner-roles"

describe("server-side partner role assignment rules", () => {
  it("does not let managers promote team members to manager, admin, or owner", () => {
    expect(canUserInviteRole("MANAGER", "OPERATOR")).toBe(true)
    expect(canUserInviteRole("MANAGER", "DELIVERY")).toBe(true)
    expect(canUserInviteRole("MANAGER", "MANAGER")).toBe(false)
    expect(canUserInviteRole("MANAGER", "ADMIN")).toBe(false)
    expect(canUserInviteRole("MANAGER", "OWNER")).toBe(false)
  })

  it("does not allow any team member to assign the owner role", () => {
    for (const actor of ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "DELIVERY"] as const) {
      expect(canUserInviteRole(actor, "OWNER")).toBe(false)
    }
  })

  it("only lets a higher-ranked role modify a lower-ranked member", () => {
    expect(canModifyUser("MANAGER", "OPERATOR")).toBe(true)
    expect(canModifyUser("MANAGER", "ADMIN")).toBe(false)
    expect(canModifyUser("ADMIN", "OWNER")).toBe(false)
  })
})
