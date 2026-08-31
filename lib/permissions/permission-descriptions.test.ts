import { describe, it, expect } from "vitest"
import {
  getPermissionErrorMessage,
  getRoleLabel,
  RESOURCE_NAMES,
  ROLE_LABELS,
} from "./permission-descriptions"

describe("permission-descriptions", () => {
  it("returns specific clean user-facing error message for PDV discount", () => {
    const msg = getPermissionErrorMessage("pdv", "can_apply_discount")
    expect(msg).toBe("Você não possui permissão para aplicar desconto no PDV.")
  })

  it("returns specific clean user-facing error message for orders cancel", () => {
    const msg = getPermissionErrorMessage("orders", "cancel")
    expect(msg).toBe("Você não possui permissão para cancelar pedidos.")
  })

  it("returns specific clean user-facing error message for financial edit", () => {
    const msg = getPermissionErrorMessage("financial", "edit")
    expect(msg).toBe("Você não possui permissão para editar lançamentos financeiros.")
  })

  it("returns specific clean user-facing error message for products delete", () => {
    const msg = getPermissionErrorMessage("products", "delete")
    expect(msg).toBe("Você não possui permissão para excluir produtos.")
  })

  it("returns fallback message with resource name when specific mapping is not defined", () => {
    const msg = getPermissionErrorMessage("categories", "edit")
    expect(msg).toBe("Você não possui permissão para editar Categorias.")
  })

  it("returns proper role label for known roles", () => {
    expect(getRoleLabel("operator")).toBe("Operador")
    expect(getRoleLabel("delivery")).toBe("Entregador")
    expect(getRoleLabel("manager")).toBe("Gestor")
    expect(getRoleLabel("admin")).toBe("Administrador")
    expect(getRoleLabel("owner")).toBe("Proprietário")
  })

  it("returns original or fallback for unknown roles", () => {
    expect(getRoleLabel("custom_role")).toBe("custom_role")
    expect(getRoleLabel(null)).toBe("Desconhecido")
  })
})
