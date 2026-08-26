import { beforeEach, describe, expect, it, vi } from "vitest"
import { AiGeneratorService } from "./ai-generator.service"
import { redis } from "@/lib/redis"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { getAdminClient } from "@/lib/supabase/admin"

// Mock de dependências
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
  },
}))

vi.mock("@/lib/services/subscription.service", () => ({
  getPartnerPlan: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(),
}))

describe("AiGeneratorService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENROUTER_API_KEY = "test-openrouter-key"
    process.env.AI_PRODUCT_PROVIDER = "openrouter"
    process.env.AI_PRODUCT_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1"
  })

  it("should fail when plan is free (limit is 0)", async () => {
    vi.mocked(getPartnerPlan).mockResolvedValue({ slug: "free" } as any)

    const result = await AiGeneratorService.generateProductDetails("partner-123", "user-456", {
      title: "Samsung Galaxy S24",
      itemType: "product",
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe("plan_blocked")
  })

  it("should fail when daily limit is exceeded", async () => {
    vi.mocked(getPartnerPlan).mockResolvedValue({ slug: "crescer" } as any)
    vi.mocked(redis.get).mockResolvedValue(10) // Já gerou 10 vezes

    const result = await AiGeneratorService.generateProductDetails("partner-123", "user-456", {
      title: "Samsung Galaxy S24",
      itemType: "product",
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe("limit_exceeded")
  })

  it("should return cached details if available", async () => {
    vi.mocked(getPartnerPlan).mockResolvedValue({ slug: "crescer" } as any)

    const mockDetails = {
      brand: "Samsung",
      description: "Smartphone Samsung Galaxy S24 Ultra",
      tags: ["smartphone", "samsung"],
      specs: { Cor: "Preto" },
      category: { id: "cat-123", confidence: 0.95 },
    }

    vi.mocked(redis.get)
      .mockResolvedValueOnce(0) // usage
      .mockResolvedValueOnce(mockDetails) // cache hit

    const result = await AiGeneratorService.generateProductDetails("partner-123", "user-456", {
      title: "Samsung Galaxy S24",
      itemType: "product",
    })

    expect(result.success).toBe(true)
    expect(result.cached).toBe(true)
    expect(result.data).toEqual(mockDetails)
  })

  it("should run fallback chain if first model fails and second succeeds", async () => {
    vi.mocked(getPartnerPlan).mockResolvedValue({ slug: "crescer" } as any)
    vi.mocked(redis.get)
      .mockResolvedValueOnce(0) // usage
      .mockResolvedValueOnce(null) // cache miss

    const mockCategories = [
      { id: "cat-123", name: "Celulares", parent_id: null },
    ]
    const dbMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(function (onFulfilled) {
        return Promise.resolve({ data: mockCategories, error: null }).then(onFulfilled)
      })
    }
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(dbMock),
    } as any)

    // Primeiro fetch falha, segundo fetch funciona
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error("Timeout error from primary model"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  description: "Samsung Galaxy S24 Ultra Titanium Gray",
                  brand: "Samsung",
                  tags: ["samsung", "galaxy"],
                  specs: { Armazenamento: "256GB" },
                  category: { id: "cat-123", confidence: 0.9 },
                }),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
      })

    global.fetch = mockFetch

    const result = await AiGeneratorService.generateProductDetails("partner-123", "user-456", {
      title: "Samsung Galaxy S24 Ultra 256GB Titanium Gray",
      itemType: "product",
    })

    expect(result.success).toBe(true)
    expect(result.data?.brand).toBe("Samsung")
    expect(result.data?.category.id).toBe("cat-123")
    expect(result.data?.specs["Armazenamento"]).toBe("256GB")
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it("should discard category if confidence is below 0.85", async () => {
    vi.mocked(getPartnerPlan).mockResolvedValue({ slug: "crescer" } as any)
    vi.mocked(redis.get)
      .mockResolvedValueOnce(0) // usage
      .mockResolvedValueOnce(null) // cache miss

    const mockCategories = [
      { id: "cat-123", name: "Celulares", parent_id: null },
    ]
    const dbMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(function (onFulfilled) {
        return Promise.resolve({ data: mockCategories, error: null }).then(onFulfilled)
      })
    }
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(dbMock),
    } as any)

    // IA retorna confiança 0.50
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: "Samsung Galaxy S24 Ultra Titanium Gray",
                brand: "Samsung",
                tags: ["samsung", "galaxy"],
                specs: {},
                category: { id: "cat-123", confidence: 0.5 },
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
    })

    global.fetch = mockFetch

    const result = await AiGeneratorService.generateProductDetails("partner-123", "user-456", {
      title: "Samsung Galaxy S24",
      itemType: "product",
    })

    expect(result.success).toBe(true)
    expect(result.data?.category.id).toBeNull() // Descartado
  })

  it("should execute simple local regex fallback if all AI models fail", async () => {
    vi.mocked(getPartnerPlan).mockResolvedValue({ slug: "crescer" } as any)
    vi.mocked(redis.get)
      .mockResolvedValueOnce(0) // usage
      .mockResolvedValueOnce(null) // cache miss

    const mockCategories: any[] = []
    const dbMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(function (onFulfilled) {
        return Promise.resolve({ data: mockCategories, error: null }).then(onFulfilled)
      })
    }
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(dbMock),
    } as any)

    // Todos os 3 modelos na cadeia falham
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error("Model 1 failed"))
      .mockRejectedValueOnce(new Error("Model 2 failed"))
      .mockRejectedValueOnce(new Error("Model 3 failed"))

    global.fetch = mockFetch

    const result = await AiGeneratorService.generateProductDetails("partner-123", "user-456", {
      title: "Secador Mondial 2000W 220V",
      itemType: "product",
    })

    // Retorna success: true e dados preenchidos via regex básica
    expect(result.success).toBe(true)
    expect(result.message).toContain("IA temporariamente indisponível")
    expect(result.data?.specs["Potência"]).toBe("2000W")
    expect(result.data?.specs["Voltagem"]).toBe("220V")
    expect(result.data?.brand).toBe("Mondial")
    expect(result.data?.category.id).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })
})
