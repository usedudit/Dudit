import { beforeEach, describe, expect, it, vi } from "vitest"
import { ensureMarketplaceCustomer } from "./marketplace-customer"

const { getAdminClientMock } = vi.hoisted(() => ({
  getAdminClientMock: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: getAdminClientMock,
}))

const mockEncryptCPF = vi.hoisted(() => vi.fn((cpf: string) => Promise.resolve(`enc_${cpf}`)))
const mockDecryptCPF = vi.hoisted(() => vi.fn((enc: string) => Promise.resolve(enc.replace("enc_", ""))))

vi.mock("@/lib/crypto", () => ({
  encryptCPF: ((cpf: string) => mockEncryptCPF(cpf)) as any,
  decryptCPF: ((enc: string) => mockDecryptCPF(enc)) as any,
}))

vi.mock("@/lib/input-validator", () => ({
  validateCPF: vi.fn((cpf: string) => cpf.length === 11),
}))

function createMockChain() {
  const chain: Record<string, any> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.not = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(() => chain)
  chain.single = vi.fn(() => chain)
  chain.insert = vi.fn(() => chain)
  chain.update = vi.fn(() => chain)
  chain.is = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
  return chain
}

function createAdminMock() {
  const chain = createMockChain()
  const client = {
    from: vi.fn(() => chain),
  }
  return { client, chain }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("ensureMarketplaceCustomer", () => {
  const partnerA = "partner-a-uuid"
  const partnerB = "partner-b-uuid"
  const userId = "user-123-uuid"
  const name = "John Doe"
  const email = "john@example.com"
  const phone = "11999999999"

  describe("first purchase creates a customer", () => {
    it("creates new customer when no existing record is found", async () => {
      const { client, chain } = createAdminMock()
      getAdminClientMock.mockReturnValue(client)

      // Step 1: lookup by marketplace_user_id -> null
      chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      // Step 2: lookup by email -> null
      chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      // Step 4: insert -> success
      const newCustomerId = "new-customer-1"
      chain.single.mockResolvedValueOnce({
        data: { id: newCustomerId },
        error: null,
      })

      const result = await ensureMarketplaceCustomer({
        partnerId: partnerA,
        name,
        email,
        phone,
        userId,
      })

      expect(result).toBe(newCustomerId)
      const insertCall = chain.insert.mock.calls[0][0]
      expect(insertCall.marketplace_user_id).toBe(userId)
      expect(insertCall.user_id).toBe(userId)
      expect(insertCall.partner_id).toBe(partnerA)
      expect(insertCall.name).toBe(name)
    })
  })

  describe("second purchase reuses the same customer", () => {
    it("returns existing customer when marketplace_user_id matches", async () => {
      const { client, chain } = createAdminMock()
      getAdminClientMock.mockReturnValue(client)

      const existingCustomerId = "existing-customer-1"

      chain.maybeSingle.mockResolvedValueOnce({
        data: { id: existingCustomerId, name, email, phone, cpf: null },
        error: null,
      })

      const result = await ensureMarketplaceCustomer({
        partnerId: partnerA,
        name,
        email,
        phone,
        userId,
      })

      expect(result).toBe(existingCustomerId)
      expect(chain.insert).not.toHaveBeenCalled()

      const eqCalls = chain.eq.mock.calls
      expect(eqCalls[0]).toEqual(["partner_id", partnerA])
      expect(eqCalls[1]).toEqual(["marketplace_user_id", userId])
    })

    it("updates non-sensitive fields on reuse when they have changed", async () => {
      const { client, chain } = createAdminMock()
      getAdminClientMock.mockReturnValue(client)

      const existingCustomerId = "existing-customer-2"

      // Found by marketplace_user_id - name differs, phone is null
      chain.maybeSingle.mockResolvedValueOnce({
        data: { id: existingCustomerId, name: "Old Name", email, phone: null, cpf: null },
        error: null,
      })

      // update() returns chain; final .eq().await resolves to chain (no error)
      chain.update.mockReturnValueOnce(chain)

      const result = await ensureMarketplaceCustomer({
        partnerId: partnerA,
        name: "New Name",
        email,
        phone: "11988888888",
        userId,
      })

      expect(result).toBe(existingCustomerId)
      expect(chain.update).toHaveBeenCalled()
      const updatePayload = chain.update.mock.calls[0][0]
      expect(updatePayload.name).toBe("New Name")
      expect(updatePayload.phone).toBe("11988888888")
    })
  })

  describe("purchases in different sellers create different ERP customers", () => {
    it("creates separate customers for different partners", async () => {
      const { client, chain } = createAdminMock()
      getAdminClientMock.mockReturnValue(client)

      // ---- Partner A ----
      chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      chain.single.mockResolvedValueOnce({
        data: { id: "customer-a" },
        error: null,
      })

      const resultA = await ensureMarketplaceCustomer({
        partnerId: partnerA,
        name,
        email,
        phone,
        userId,
      })

      expect(resultA).toBe("customer-a")
      const insertA = chain.insert.mock.calls[0][0]
      expect(insertA.partner_id).toBe(partnerA)
      expect(insertA.marketplace_user_id).toBe(userId)

      // ---- Partner B ----
      chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      chain.single.mockResolvedValueOnce({
        data: { id: "customer-b" },
        error: null,
      })

      const resultB = await ensureMarketplaceCustomer({
        partnerId: partnerB,
        name,
        email,
        phone,
        userId,
      })

      expect(resultB).toBe("customer-b")
      const insertB = chain.insert.mock.calls[1][0]
      expect(insertB.partner_id).toBe(partnerB)
      expect(insertB.marketplace_user_id).toBe(userId)

      expect(resultA).not.toBe(resultB)
    })
  })

  describe("migration preserves history and balances", () => {
    it("looks up by marketplace_user_id scoped to the correct partner", async () => {
      const { client, chain } = createAdminMock()
      getAdminClientMock.mockReturnValue(client)

      const existingCustomerId = "migrated-customer"

      chain.maybeSingle.mockResolvedValueOnce({
        data: { id: existingCustomerId, name, email, phone, cpf: null },
        error: null,
      })

      const result = await ensureMarketplaceCustomer({
        partnerId: partnerA,
        name,
        email,
        phone,
        userId,
      })

      expect(result).toBe(existingCustomerId)
      const eqCalls = chain.eq.mock.calls
      const partnerEq = eqCalls.find((c: any[]) => c[0] === "partner_id" && c[1] === partnerA)
      const userEq = eqCalls.find((c: any[]) => c[0] === "marketplace_user_id" && c[1] === userId)
      expect(partnerEq).toBeDefined()
      expect(userEq).toBeDefined()
    })
  })

  describe("store credit and loyalty remain attached", () => {
    it("reuses existing customer without creating duplicates", async () => {
      const { client, chain } = createAdminMock()
      getAdminClientMock.mockReturnValue(client)

      const existingCustomerId = "store-credit-customer"

      chain.maybeSingle.mockResolvedValueOnce({
        data: { id: existingCustomerId, name, email, phone, cpf: null },
        error: null,
      })

      const result = await ensureMarketplaceCustomer({
        partnerId: partnerA,
        name,
        email,
        phone,
        userId,
      })

      expect(result).toBe(existingCustomerId)
      expect(chain.insert).not.toHaveBeenCalled()
    })
  })
})
