import { describe, expect, it } from "vitest"
import {
  getNotificationRecipientRoles,
  normalizePartnerRole,
  MANAGEMENT_ROLES,
  OPERATIONAL_ROLES,
  OWNERSHIP_ROLES,
} from "./audience"

describe("papéis por tipo de notificação", () => {
  it("pedidos do dia a dia vão para a operação inteira", () => {
    expect(getNotificationRecipientRoles("order_created")).toEqual(OPERATIONAL_ROLES)
    expect(getNotificationRecipientRoles("order_paid")).toEqual(OPERATIONAL_ROLES)
    expect(getNotificationRecipientRoles("order_shipped")).toEqual(OPERATIONAL_ROLES)
    expect(getNotificationRecipientRoles("order_delivered")).toEqual(OPERATIONAL_ROLES)
  })

  it("cancelamento, reembolso e limite fiscal ficam com a gestão", () => {
    expect(getNotificationRecipientRoles("order_cancelled")).toEqual(MANAGEMENT_ROLES)
    expect(getNotificationRecipientRoles("order_refunded")).toEqual(MANAGEMENT_ROLES)
    expect(getNotificationRecipientRoles("revenue_limit_alert")).toEqual(MANAGEMENT_ROLES)
  })

  it("assinatura da plataforma fica com dono/admin", () => {
    expect(getNotificationRecipientRoles("subscription_renewed")).toEqual(OWNERSHIP_ROLES)
    expect(getNotificationRecipientRoles("subscription_price_change_expired")).toEqual(OWNERSHIP_ROLES)
  })

  it("aceita override explícito do ponto de chamada", () => {
    expect(getNotificationRecipientRoles("admin_announcement", MANAGEMENT_ROLES)).toEqual(MANAGEMENT_ROLES)
  })

  it("carrinho abandonado não vai para o time", () => {
    expect(getNotificationRecipientRoles("cart_abandoned")).toEqual([])
  })
})

describe("normalizePartnerRole", () => {
  it("normaliza maiúsculas, minúsculas e papéis legados", () => {
    expect(normalizePartnerRole("owner")).toBe("OWNER")
    expect(normalizePartnerRole("ADMIN")).toBe("ADMIN")
    expect(normalizePartnerRole("manager")).toBe("MANAGER")
    expect(normalizePartnerRole("editor")).toBe("OPERATOR")
    expect(normalizePartnerRole("viewer")).toBe("DELIVERY")
    expect(normalizePartnerRole(null)).toBeNull()
    expect(normalizePartnerRole("desconhecido")).toBeNull()
  })
})
