import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import crypto from "crypto"
import {
  collectComplianceIntegrationSnapshot,
  hashNormalizedValue,
  maskEmailAddress,
  maskTaxDocument,
  recordIntegrationConnected,
  recordIntegrationDisconnected,
  safeDecryptCompliancePii,
  safeEncryptCompliancePii,
} from "./integration-history"

vi.mock("@/lib/secure-logger", () => ({
  SecureLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe("compliance integration-history", () => {
  const testMasterKey = crypto.randomBytes(32).toString("base64")

  beforeEach(() => {
    vi.stubEnv("MASTER_KEY_V3", testMasterKey)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it("masks emails and tax documents safely", () => {
    expect(maskEmailAddress("Vendedor@Empresa.com")).toBe("v***r@empresa.com")
    expect(maskEmailAddress("ab@x.com")).toBe("a***@x.com")
    expect(maskEmailAddress(null)).toBeNull()

    expect(maskTaxDocument("12.345.678/0001-99")).toEqual({
      type: "cnpj",
      digits: "12345678000199",
      masked: "12.***.***/****-99",
    })
    expect(maskTaxDocument("123.456.789-01")).toEqual({
      type: "cpf",
      digits: "12345678901",
      masked: "123.***.***-01",
    })
  })

  it("encrypts and decrypts compliance PII under the compliance domain", () => {
    const encrypted = safeEncryptCompliancePii("fraude@teste.com")
    expect(encrypted).toBeTruthy()
    expect(encrypted?.startsWith("v3:")).toBe(true)
    expect(safeDecryptCompliancePii(encrypted)).toBe("fraude@teste.com")
  })

  it("records connection and disconnect history with legacy fallback", async () => {
    const inserted: any[] = []
    const admin = {
      from: vi.fn(() => {
        const chain: any = {}
        chain.select = vi.fn().mockReturnValue(chain)
        chain.eq = vi.fn().mockReturnValue(chain)
        chain.is = vi.fn().mockReturnValue(chain)
        chain.update = vi.fn().mockReturnValue(chain)
        chain.insert = vi.fn((payload: any) => {
          inserted.push(payload)
          return Promise.resolve({ data: [payload], error: null })
        })
        chain.then = (resolve: any) => resolve({ data: [], error: null })
        return chain
      }),
    }

    await recordIntegrationConnected(admin, {
      partnerId: "partner-1",
      providerSlug: "mercadopago",
      externalAccountId: "123456789",
      externalAccountEmail: "Seller@MP.com",
      externalAccountLabel: "LOJAMP",
    })

    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      partner_id: "partner-1",
      provider_slug: "mercadopago",
      external_account_id: "123456789",
      external_account_email_hash: hashNormalizedValue("seller@mp.com"),
      external_account_email_masked: "s***r@mp.com",
      external_account_label: "LOJAMP",
      disconnected_at: null,
    })

    // Legacy disconnect fallback when no open history row existed
    await recordIntegrationDisconnected(admin, {
      partnerId: "partner-1",
      providerSlug: "superfrete",
      fallbackAccountId: "sf-999",
      fallbackAccountEmail: "frete@loja.com",
    })

    expect(inserted).toHaveLength(2)
    expect(inserted[1]).toMatchObject({
      partner_id: "partner-1",
      provider_slug: "superfrete",
      external_account_id: "sf-999",
      external_account_email_hash: hashNormalizedValue("frete@loja.com"),
    })
    expect(inserted[1].disconnected_at).toBeTruthy()
  })

  it("merges current and historical integrations without duplicates", async () => {
    const mpHash = hashNormalizedValue("mp@loja.com")
    const sfHash = hashNormalizedValue("sf@loja.com")

    const admin = {
      from: vi.fn((table: string) => {
        const chain: any = {}
        chain.select = vi.fn().mockReturnValue(chain)
        chain.eq = vi.fn().mockReturnValue(chain)
        chain.order = vi.fn().mockReturnValue(chain)
        chain.then = (resolve: any) => {
          if (table === "partner_integrations") {
            return resolve({
              data: [
                {
                  provider_slug: "mercadopago",
                  status: "connected",
                  account_id: "mp-111",
                  account_email: "mp@loja.com",
                  connected_at: "2026-01-01T00:00:00Z",
                  disconnected_at: null,
                },
              ],
              error: null,
            })
          }
          return resolve({
            data: [
              // Duplicate of current MP row
              {
                provider_slug: "mercadopago",
                external_account_id: "mp-111",
                external_account_email_masked: "m***p@loja.com",
                external_account_email_hash: mpHash,
                external_account_email_encrypted: safeEncryptCompliancePii("mp@loja.com"),
                external_account_label: "LOJA",
                connected_at: "2026-01-01T00:00:00Z",
                disconnected_at: null,
              },
              // Previously disconnected SuperFrete row
              {
                provider_slug: "superfrete",
                external_account_id: "sf-222",
                external_account_email_masked: "s***f@loja.com",
                external_account_email_hash: sfHash,
                external_account_email_encrypted: safeEncryptCompliancePii("sf@loja.com"),
                external_account_label: null,
                connected_at: "2025-05-01T00:00:00Z",
                disconnected_at: "2026-02-01T00:00:00Z",
              },
            ],
            error: null,
          })
        }
        return chain
      }),
    }

    const res = await collectComplianceIntegrationSnapshot(admin, "partner-1")
    expect(res.snapshot).toHaveLength(2)
    expect(res.accountIds).toEqual(["mp-111", "sf-222"])
    expect(res.emailHashes).toEqual([mpHash, sfHash])
    expect(res.snapshot[1].status_at_deletion).toBe("disconnected")
  })
})
