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

  it("returns specific clean user-facing error message for products view_cost_price", () => {
    const msg = getPermissionErrorMessage("products", "view_cost_price")
    expect(msg).toBe("Você não possui permissão para visualizar o preço de custo dos produtos.")
  })

  it("returns specific clean user-facing error message for customers export", () => {
    const msg = getPermissionErrorMessage("customers", "export")
    expect(msg).toBe("Você não possui permissão para exportar a base de clientes.")
  })

  it("returns specific clean user-facing error message for service_orders can_generate_invoice", () => {
    const msg = getPermissionErrorMessage("service_orders", "can_generate_invoice")
    expect(msg).toBe("Você não possui permissão para faturar ou emitir nota fiscal para ordens de serviço.")
  })

  it("returns specific clean user-facing error message for financial can_settle", () => {
    const msg = getPermissionErrorMessage("financial", "can_settle")
    expect(msg).toBe("Você não possui permissão para liquidar ou baixar contas a pagar/receber.")
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
