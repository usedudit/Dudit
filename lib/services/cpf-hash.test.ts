import { describe, it, expect, beforeEach } from "vitest"
import { normalizeCpf, generateCpfLookupHash } from "./cpf-hash"

describe("CPF Lookup Hash & Blind Index Service", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CPF_LOOKUP_SECRET: "test-secret-salt-dudit-1234567890",
    }
  })

  describe("normalizeCpf", () => {
    it("normalizes formatted CPF to 11 raw digits", () => {
      expect(normalizeCpf("123.456.789-00")).toBe("12345678900")
      expect(normalizeCpf("  123.456.789-00  ")).toBe("12345678900")
      expect(normalizeCpf("123 456 789 00")).toBe("12345678900")
      expect(normalizeCpf("12345678900")).toBe("12345678900")
    })

    it("returns null for invalid, incomplete or empty CPFs", () => {
      expect(normalizeCpf(null)).toBeNull()
      expect(normalizeCpf(undefined)).toBeNull()
      expect(normalizeCpf("")).toBeNull()
      expect(normalizeCpf("123.456.789")).toBeNull() // 9 digits
      expect(normalizeCpf("123456789012")).toBeNull() // 12 digits
      expect(normalizeCpf("abc.def.ghi-jk")).toBeNull()
    })
  })

  describe("generateCpfLookupHash", () => {
    it("generates deterministic HMAC-SHA256 hash regardless of formatting", () => {
      const hash1 = generateCpfLookupHash("123.456.789-00")
      const hash2 = generateCpfLookupHash("12345678900")
      const hash3 = generateCpfLookupHash(" 123.456.789-00 ")

      expect(hash1).toBeDefined()
      expect(typeof hash1).toBe("string")
      expect(hash1?.length).toBe(64) // SHA-256 hex string length
      expect(hash1).toBe(hash2)
      expect(hash2).toBe(hash3)
    })

    it("generates distinct hashes for different CPFs", () => {
      const hashA = generateCpfLookupHash("111.444.777-35")
      const hashB = generateCpfLookupHash("222.555.888-46")

      expect(hashA).not.toBe(hashB)
    })

    it("returns null for invalid CPFs", () => {
      expect(generateCpfLookupHash(null)).toBeNull()
      expect(generateCpfLookupHash(undefined)).toBeNull()
      expect(generateCpfLookupHash("")).toBeNull()
      expect(generateCpfLookupHash("12345")).toBeNull()
    })
  })

  describe("Business Rules Simulation (Tenant Isolation & Soft Delete)", () => {
    // Simula a tabela com índice único parcial: (partner_id, cpf_lookup_hash) WHERE deleted_at IS NULL
    interface MockCustomerRow {
      id: string
      partner_id: string
      name: string
      cpf_lookup_hash: string | null
      deleted_at: string | null
    }

    function checkCanInsert(
      existingRows: MockCustomerRow[],
      newRow: { partner_id: string; cpf_lookup_hash: string | null; currentId?: string }
    ): { allowed: boolean; reason?: string } {
      if (!newRow.cpf_lookup_hash) return { allowed: true }

      const duplicate = existingRows.find(
        (r) =>
          r.partner_id === newRow.partner_id &&
          r.cpf_lookup_hash === newRow.cpf_lookup_hash &&
          r.deleted_at === null &&
          (!newRow.currentId || r.id !== newRow.currentId)
      )

      if (duplicate) {
        return { allowed: false, reason: "Já existe um cliente com este CPF." }
      }
      return { allowed: true }
    }

    it("impede duplicidade do mesmo CPF dentro do mesmo parceiro", () => {
      const hash = generateCpfLookupHash("123.456.789-00")!
      const rows: MockCustomerRow[] = [
        { id: "c1", partner_id: "partner-A", name: "João", cpf_lookup_hash: hash, deleted_at: null },
      ]

      const result = checkCanInsert(rows, { partner_id: "partner-A", cpf_lookup_hash: hash })
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe("Já existe um cliente com este CPF.")
    })

    it("permite o mesmo CPF em parceiros diferentes (isolamento de tenant)", () => {
      const hash = generateCpfLookupHash("123.456.789-00")!
      const rows: MockCustomerRow[] = [
        { id: "c1", partner_id: "partner-A", name: "João", cpf_lookup_hash: hash, deleted_at: null },
      ]

      const result = checkCanInsert(rows, { partner_id: "partner-B", cpf_lookup_hash: hash })
      expect(result.allowed).toBe(true)
    })

    it("permite editar o mesmo cliente mantendo o próprio CPF", () => {
      const hash = generateCpfLookupHash("123.456.789-00")!
      const rows: MockCustomerRow[] = [
        { id: "c1", partner_id: "partner-A", name: "João", cpf_lookup_hash: hash, deleted_at: null },
      ]

      const result = checkCanInsert(rows, {
        partner_id: "partner-A",
        cpf_lookup_hash: hash,
        currentId: "c1",
      })
      expect(result.allowed).toBe(true)
    })

    it("permite recriar cliente após soft delete (deleted_at IS NOT NULL)", () => {
      const hash = generateCpfLookupHash("123.456.789-00")!
      const rows: MockCustomerRow[] = [
        {
          id: "c1",
          partner_id: "partner-A",
          name: "João (Deletado)",
          cpf_lookup_hash: hash,
          deleted_at: "2026-08-01T10:00:00Z", // Cliente deletado
        },
      ]

      // Novo cliente ativo com o mesmo CPF
      const result = checkCanInsert(rows, {
        partner_id: "partner-A",
        cpf_lookup_hash: hash,
      })
      expect(result.allowed).toBe(true)
    })
  })
})
