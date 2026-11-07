import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  syncUserDefaultAddressToErpCustomers,
  syncDeliveryDriverAddress,
  syncUserDefaultAddressEverywhere,
} from "./customer-address-sync"

const { getAdminClientMock } = vi.hoisted(() => ({
  getAdminClientMock: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: getAdminClientMock,
}))

const { revalidateAddressesMock, revalidateCustomersMock } = vi.hoisted(() => ({
  revalidateAddressesMock: vi.fn(),
  revalidateCustomersMock: vi.fn(),
}))

vi.mock("@/lib/utils/revalidation", () => ({
  revalidateAddresses: revalidateAddressesMock,
  revalidateCustomers: revalidateCustomersMock,
}))

function createMockChain() {
  const chain: Record<string, any> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.or = vi.fn(() => chain)
  chain.in = vi.fn(() => chain)
  chain.is = vi.fn(() => chain)
  chain.insert = vi.fn(() => chain)
  chain.update = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(() => chain)
  chain.single = vi.fn(() => chain)
  return chain
}

function createAdminMock() {
  const customersChain = createMockChain()
  const addressesChain = createMockChain()
  const driversChain = createMockChain()

  const client = {
    from: vi.fn((table: string) => {
      if (table === "customers") return customersChain
      if (table === "addresses") return addressesChain
      if (table === "delivery_drivers") return driversChain
      return createMockChain()
    }),
  }
  return { client, customersChain, addressesChain, driversChain }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("customer-address-sync", () => {
  const userId = "user-abc-123"
  const sampleAddress = {
    zip_code: "01310-100",
    street: "Av. Paulista",
    number: "1000",
    complement: "Apto 101",
    neighborhood: "Bela Vista",
    city: "São Paulo",
    state: "SP",
    country: "BR",
    municipio_codigo_ibge: "3550308",
    latitude: -23.5614,
    longitude: -46.6559,
  }

  describe("syncUserDefaultAddressToErpCustomers", () => {
    it("returns error when userId is missing", async () => {
      const result = await syncUserDefaultAddressToErpCustomers({
        userId: "",
        address: sampleAddress,
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe("userId is required")
    })

    it("returns success with 0 synced when user has no customers in any store", async () => {
      const { client, customersChain } = createAdminMock()
      getAdminClientMock.mockReturnValue(client)

      // Query customers returns empty
      customersChain.is.mockReturnValue({
        or: vi.fn().mockResolvedValue({ data: [], error: null }),
      })

      const result = await syncUserDefaultAddressToErpCustomers({
        userId,
        address: sampleAddress,
      })

      expect(result.success).toBe(true)
      expect(result.syncedCount).toBe(0)
      expect(result.partnerIds).toEqual([])
    })

    it("updates existing customer address in a single store", async () => {
      const { client, customersChain, addressesChain } = createAdminMock()
      getAdminClientMock.mockReturnValue(client)

      const storeCustomer = {
        id: "cust-1",
        partner_id: "partner-1",
        marketplace_user_id: userId,
        user_id: userId,
        email: "user@example.com",
      }

      customersChain.is.mockReturnValue({
        or: vi.fn().mockResolvedValue({ data: [storeCustomer], error: null }),
      })

      // Existing address for cust-1
      addressesChain.in.mockResolvedValueOnce({
        data: [
          {
            id: "addr-cust-1",
            customer_id: "cust-1",
            address_type: "primary",
            is_default: true,
          },
        ],
        error: null,
      })

      // Update call
      addressesChain.in.mockResolvedValueOnce({ error: null })

      const result = await syncUserDefaultAddressToErpCustomers({
        userId,
        address: sampleAddress,
      })

      expect(result.success).toBe(true)
      expect(result.syncedCount).toBe(1)
      expect(result.partnerIds).toEqual(["partner-1"])

      // Verify update was called on addresses with correct data
      expect(addressesChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          zip_code: "01310-100",
          street: "Av. Paulista",
          number: "1000",
          complement: "Apto 101",
          neighborhood: "Bela Vista",
          city: "São Paulo",
          state: "SP",
          address_type: "primary",
          is_default: true,
        })
      )
      expect(addressesChain.in).toHaveBeenCalledWith("id", ["addr-cust-1"])

      // Verify revalidations
      expect(revalidateAddressesMock).toHaveBeenCalledWith("customer", "cust-1")
      expect(revalidateCustomersMock).toHaveBeenCalledWith("partner-1")
    })

    it("inserts address when customer does not have any address in that store", async () => {
      const { client, customersChain, addressesChain } = createAdminMock()
      getAdminClientMock.mockReturnValue(client)

      const storeCustomer = {
        id: "cust-2",
        partner_id: "partner-2",
        marketplace_user_id: userId,
        user_id: userId,
      }

      customersChain.is.mockReturnValue({
        or: vi.fn().mockResolvedValue({ data: [storeCustomer], error: null }),
      })

      // No addresses exist for cust-2
      addressesChain.in.mockResolvedValueOnce({
        data: [],
        error: null,
      })

      addressesChain.insert.mockResolvedValueOnce({ error: null })

      const result = await syncUserDefaultAddressToErpCustomers({
        userId,
        address: sampleAddress,
      })

      expect(result.success).toBe(true)
      expect(result.syncedCount).toBe(1)

      // Should insert a new address record
      expect(addressesChain.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          customer_id: "cust-2",
          street: "Av. Paulista",
          zip_code: "01310-100",
          address_type: "primary",
          is_default: true,
        }),
      ])
    })

    it("syncs address across MULTIPLE stores (Store A, Store B, Store C)", async () => {
      const { client, customersChain, addressesChain } = createAdminMock()
      getAdminClientMock.mockReturnValue(client)

      const customers = [
        { id: "cust-A", partner_id: "partner-A", marketplace_user_id: userId },
        { id: "cust-B", partner_id: "partner-B", marketplace_user_id: userId },
        { id: "cust-C", partner_id: "partner-C", marketplace_user_id: userId },
      ]

      customersChain.is.mockReturnValue({
        or: vi.fn().mockResolvedValue({ data: customers, error: null }),
      })

      // cust-A and cust-B have existing addresses; cust-C has none
      addressesChain.in.mockResolvedValueOnce({
        data: [
          {
            id: "addr-A",
            customer_id: "cust-A",
            address_type: "primary",
            is_default: true,
          },
          {
            id: "addr-B",
            customer_id: "cust-B",
            address_type: "primary",
            is_default: true,
          },
        ],
        error: null,
      })

      // Batch update mock for addr-A and addr-B
      addressesChain.in.mockResolvedValueOnce({ error: null })
      // Batch insert mock for cust-C
      addressesChain.insert.mockResolvedValueOnce({ error: null })

      const result = await syncUserDefaultAddressToErpCustomers({
        userId,
        address: sampleAddress,
      })

      expect(result.success).toBe(true)
      expect(result.syncedCount).toBe(3)
      expect(result.partnerIds).toEqual(["partner-A", "partner-B", "partner-C"])

      // Updates addr-A and addr-B
      expect(addressesChain.update).toHaveBeenCalled()
      expect(addressesChain.in).toHaveBeenCalledWith("id", ["addr-A", "addr-B"])

      // Inserts for cust-C
      expect(addressesChain.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          customer_id: "cust-C",
          street: "Av. Paulista",
        }),
      ])

      // Revalidates all 3 customers and all 3 partners
      expect(revalidateAddressesMock).toHaveBeenCalledWith("customer", "cust-A")
      expect(revalidateAddressesMock).toHaveBeenCalledWith("customer", "cust-B")
      expect(revalidateAddressesMock).toHaveBeenCalledWith("customer", "cust-C")
      expect(revalidateCustomersMock).toHaveBeenCalledWith("partner-A")
      expect(revalidateCustomersMock).toHaveBeenCalledWith("partner-B")
      expect(revalidateCustomersMock).toHaveBeenCalledWith("partner-C")
    })

    it("does not overwrite billing address when customer only has billing address", async () => {
      const { client, customersChain, addressesChain } = createAdminMock()
      getAdminClientMock.mockReturnValue(client)

      const storeCustomer = {
        id: "cust-billing-only",
        partner_id: "partner-X",
        marketplace_user_id: userId,
      }

      customersChain.is.mockReturnValue({
        or: vi.fn().mockResolvedValue({ data: [storeCustomer], error: null }),
      })

      // Customer only has a billing address
      addressesChain.in.mockResolvedValueOnce({
        data: [
          {
            id: "billing-addr-1",
            customer_id: "cust-billing-only",
            address_type: "billing",
            is_default: false,
          },
        ],
        error: null,
      })

      addressesChain.insert.mockResolvedValueOnce({ error: null })

      const result = await syncUserDefaultAddressToErpCustomers({
        userId,
        address: sampleAddress,
      })

      expect(result.success).toBe(true)
      // Should NOT update billing-addr-1
      expect(addressesChain.update).not.toHaveBeenCalled()
      // Should insert a new primary address instead
      expect(addressesChain.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          customer_id: "cust-billing-only",
          address_type: "primary",
          is_default: true,
        }),
      ])
    })
  })

  describe("syncDeliveryDriverAddress", () => {
    it("updates driver table with normalized location", async () => {
      const { client, driversChain } = createAdminMock()
      getAdminClientMock.mockReturnValue(client)
      driversChain.eq.mockResolvedValue({ error: null })

      await syncDeliveryDriverAddress(userId, sampleAddress)

      expect(driversChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          city: "São Paulo",
          neighborhood: "Bela Vista",
          street: "Av. Paulista",
          number: "1000",
          state: "SP",
          zip_code: "01310-100",
        })
      )
      expect(driversChain.eq).toHaveBeenCalledWith("user_id", userId)
    })
  })

  describe("syncUserDefaultAddressEverywhere", () => {
    it("delegates to both customer sync and driver sync", async () => {
      const { client, customersChain, addressesChain, driversChain } = createAdminMock()
      getAdminClientMock.mockReturnValue(client)

      customersChain.is.mockReturnValue({
        or: vi.fn().mockResolvedValue({ data: [], error: null }),
      })
      driversChain.eq.mockResolvedValue({ error: null })

      const result = await syncUserDefaultAddressEverywhere({
        userId,
        address: sampleAddress,
      })

      expect(result.success).toBe(true)
      expect(driversChain.update).toHaveBeenCalled()
    })
  })
})

