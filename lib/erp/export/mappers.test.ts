import { describe, it, expect } from "vitest"
import { mapCustomerRow } from "./mappers"

describe("mapCustomerRow", () => {
  const baseCustomer = {
    id: "123",
    name: "João Silva",
    email: "joao@test.com",
    phone: "11999999999",
    status: "ativo",
    person_type: "pf",
    cpf: "12345678900",
    cnpj: null,
    created_at: "2025-01-15T10:00:00Z",
  }

  it("mapeia cliente sem endereço (addresses null) sem erro", () => {
    const row = { ...baseCustomer, addresses: null }
    const result = mapCustomerRow(row)

    expect(result.name).toBe("João Silva")
    expect(result.city).toBe("-")
    expect(result.state).toBe("-")
  })

  it("mapeia cliente sem endereço (addresses undefined) sem erro", () => {
    const row = { ...baseCustomer, addresses: undefined }
    const result = mapCustomerRow(row)

    expect(result.city).toBe("-")
    expect(result.state).toBe("-")
  })

  it("mapeia cliente sem endereço (addresses vazio []) sem erro", () => {
    const row = { ...baseCustomer, addresses: [] }
    const result = mapCustomerRow(row)

    expect(result.city).toBe("-")
    expect(result.state).toBe("-")
  })

  it("inclui colunas extras quando includeAllColumns=true e addresses é []", () => {
    const row = {
      ...baseCustomer,
      addresses: [],
      phone_fixed: "1133334444",
      birth_date: "1990-05-10",
      inscricao_estadual: null,
      notes: "observação",
    }
    const result = mapCustomerRow(row, true)

    expect(result.city).toBe("-")
    expect(result.zipCode).toBe("-")
    expect(result.street).toBe("-")
    expect(result.notes).toBe("observação")
  })

  it("mapeia cliente com endereço normalmente", () => {
    const row = {
      ...baseCustomer,
      addresses: [{ city: "São Paulo", state: "SP", zip_code: "01310-000" }],
    }
    const result = mapCustomerRow(row)

    expect(result.city).toBe("São Paulo")
    expect(result.state).toBe("SP")
  })

  it("usa o primeiro endereço quando há múltiplos", () => {
    const row = {
      ...baseCustomer,
      addresses: [
        { city: "São Paulo", state: "SP" },
        { city: "Rio de Janeiro", state: "RJ" },
      ],
    }
    const result = mapCustomerRow(row)

    expect(result.city).toBe("São Paulo")
    expect(result.state).toBe("SP")
  })
})
