import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ───────────────────────────────────────────────────────────────────
const mockMaybeSingle = vi.fn()
const mockUpdate = vi.fn()
let lastChain: any = null

// A chain do Supabase é encadeável e "awaitable": o `await` do builder resolve
// para a resposta da query.
const mockAdmin = {
  from: vi.fn().mockImplementation(() => {
    const chain: any = {}
    lastChain = chain
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.neq = vi.fn().mockReturnValue(chain)
    chain.gt = vi.fn().mockReturnValue(chain)
    chain.lte = vi.fn().mockReturnValue(chain)
    chain.in = vi.fn().mockReturnValue(chain)
    chain.update = mockUpdate
    chain.maybeSingle = mockMaybeSingle
    chain.then = (resolve: (value: unknown) => unknown) => resolve({ error: null })
    return chain
  }),
}

mockUpdate.mockImplementation(() => lastChain)

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => mockAdmin,
}))

vi.mock("@/lib/auth/server-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: "user-1" }),
}))

vi.mock("@/lib/auth/partner-context", () => ({
  getCurrentPartnerContext: vi.fn().mockResolvedValue({ partnerId: "partner-1" }),
}))

vi.mock("@/lib/permissions/can", () => ({
  can: vi.fn().mockReturnValue(true),
}))

vi.mock("@/lib/services/recurring/limits", () => ({
  countActiveRecurringPlans: vi.fn().mockResolvedValue(0),
  countActiveRecurringSubscriptions: vi.fn().mockResolvedValue(0),
  pauseAllMarketplaceSubscriptions: vi.fn(),
}))

vi.mock("@/lib/delivery/order-cache", () => ({
  invalidateDeliveryContextCache: vi.fn(),
  invalidateStoreCapabilityCache: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

import { updateSystemResourcesAction } from "@/app/actions/erp/system-resources"

/**
 * Reproduz o cenário reportado: o parceiro concluiu o Guia de Configuração,
 * desativa alguns recursos em "Gerenciar recursos" e, ao voltar para a home,
 * o botão do guia volta a aparecer porque a flag de onboarding foi apagada.
 */
describe("updateSystemResourcesAction - onboarding state", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
  })

  it("keeps onboardingCompleted when resources are saved", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        business_info: {
          mode: "erp",
          activeResources: ["orders", "products", "services"],
          resourcesVersion: 9,
          onboardingCompleted: true,
          onboardingGoals: ["products", "services"],
          onboardingCompletedAt: "2026-11-02T10:00:00.000Z",
        },
      },
      error: null,
    })

    const result = await updateSystemResourcesAction(["orders", "services"])

    expect(result.success).toBe(true)

    const writtenBusinessInfo = mockUpdate.mock.calls[0][0].business_info
    expect(writtenBusinessInfo.onboardingCompleted).toBe(true)
    expect(writtenBusinessInfo.onboardingGoals).toEqual(["products", "services"])
    expect(writtenBusinessInfo.onboardingCompletedAt).toBe("2026-11-02T10:00:00.000Z")
    expect(writtenBusinessInfo.activeResources).toEqual(["orders", "services"])
  })

  it("keeps onboardingCompleted when business_info arrives as a JSON string", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        business_info: JSON.stringify({
          mode: "erp",
          activeResources: ["orders"],
          onboardingCompleted: true,
        }),
      },
      error: null,
    })

    const result = await updateSystemResourcesAction(["orders"])

    expect(result.success).toBe(true)
    expect(mockUpdate.mock.calls[0][0].business_info.onboardingCompleted).toBe(true)
  })

  it("does not invent an onboarding state for partners that never completed the guide", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        business_info: {
          mode: "erp",
          activeResources: ["orders", "products"],
        },
      },
      error: null,
    })

    const result = await updateSystemResourcesAction(["orders"])

    expect(result.success).toBe(true)
    expect(mockUpdate.mock.calls[0][0].business_info.onboardingCompleted).toBeUndefined()
  })

  it("preserves unrelated business_info keys", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        business_info: {
          mode: "erp",
          activeResources: ["orders"],
          salesSettings: { receipt: { show: true } },
          customField: "keep-me",
        },
      },
      error: null,
    })

    const result = await updateSystemResourcesAction(["orders"])

    expect(result.success).toBe(true)
    const writtenBusinessInfo = mockUpdate.mock.calls[0][0].business_info
    expect(writtenBusinessInfo.customField).toBe("keep-me")
    expect(writtenBusinessInfo.salesSettings).toEqual({ receipt: { show: true } })
  })
})
