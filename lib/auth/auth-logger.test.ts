import { describe, it, expect, vi } from "vitest"
import { logPermissionDenied, logPolicyLimitExceeded } from "./auth-logger"
import { ForbiddenError } from "./authorization"

describe("auth-logger", () => {
  it("logs structured permission denial without user email", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    logPermissionDenied({
      userId: "usr_12345",
      partnerId: "part_67890",
      roleId: "operator",
      resource: "pdv",
      action: "can_apply_discount",
      reason: "Cargo 'operator' não tem a permissão 'pdv.can_apply_discount' habilitada",
    })

    expect(warnSpy).toHaveBeenCalled()
    const logOutput = warnSpy.mock.calls[0][0]
    expect(logOutput).toContain("🚫 [PERMISSÃO NEGADA / 403 FORBIDDEN]")
    expect(logOutput).toContain("• Permissão       : pdv.can_apply_discount")
    expect(logOutput).toContain("• ID do Usuário   : usr_12345")
    expect(logOutput).toContain("• Cargo           : Operador (operator)")
    expect(logOutput).toContain("• Empresa/Partner : part_67890")
    expect(logOutput).not.toContain("@")

    warnSpy.mockRestore()
  })

  it("logs policy limit exceeded with attempted and allowed values", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    logPolicyLimitExceeded({
      userId: "usr_12345",
      partnerId: "part_67890",
      policy: "maxDiscountPercent",
      attemptedValue: "15.0%",
      allowedLimit: "10.0%",
    })

    expect(warnSpy).toHaveBeenCalled()
    const logOutput = warnSpy.mock.calls[0][0]
    expect(logOutput).toContain("⚠️ [LIMITE DE POLÍTICA EXCEDIDO / MAXDISCOUNTPERCENT]")
    expect(logOutput).toContain("• Valor Tentado   : 15.0%")
    expect(logOutput).toContain("• Limite Permitido: 10.0%")

    warnSpy.mockRestore()
  })

  it("ForbiddenError retains metadata and status code", () => {
    const err = new ForbiddenError("Você não possui permissão para aplicar desconto no PDV.", {
      resource: "pdv",
      action: "can_apply_discount",
      permissionKey: "pdv.can_apply_discount",
      roleId: "operator",
      userId: "usr_12345",
      partnerId: "part_67890",
    })

    expect(err.name).toBe("ForbiddenError")
    expect(err.statusCode).toBe(403)
    expect(err.message).toBe("Você não possui permissão para aplicar desconto no PDV.")
    expect(err.resource).toBe("pdv")
    expect(err.action).toBe("can_apply_discount")
    expect(err.roleId).toBe("operator")
    expect(err.userId).toBe("usr_12345")
    expect(err.partnerId).toBe("part_67890")
  })
})
