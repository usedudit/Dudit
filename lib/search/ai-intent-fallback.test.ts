import { describe, it, expect, vi, beforeEach } from "vitest"
import { parseSearchIntent } from "./intent-parser"
import { resolveAiSearchIntent, __clearAiIntentMemoryCacheForTests } from "./ai-intent-fallback"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
  },
}))

describe("resolveAiSearchIntent", () => {
  beforeEach(() => {
    __clearAiIntentMemoryCacheForTests()
  })

  it("não chama IA para buscas simples já resolvidas por regras", async () => {
    const generate = vi.fn()
    const rule = parseSearchIntent("pneu aro 15")
    const res = await resolveAiSearchIntent("pneu aro 15", rule, {
      deps: { generate, isEnabled: () => true },
    })

    expect(generate).not.toHaveBeenCalled()
    expect(res.source).toBe("rules")
  })

  it("chama IA para problema natural e cacheia no Redis + RAM", async () => {
    const cacheStore = new Map<string, any>()
    const generate = vi.fn().mockResolvedValue(
      JSON.stringify({
        intent: "service",
        searchTerms: ["eletricista", "troca chuveiro"],
        categories: ["eletrica", "hidraulica"],
      }),
    )

    const rule = parseSearchIntent("meu chuveiro queimou hoje")
    const first = await resolveAiSearchIntent("meu chuveiro queimou hoje", rule, {
      deps: {
        isEnabled: () => true,
        generate,
        getCache: async (k) => cacheStore.get(k) ?? null,
        setCache: async (k, v) => {
          cacheStore.set(k, v)
        },
      },
    })

    expect(generate).toHaveBeenCalledTimes(1)
    expect(first.source).toBe("ai")
    expect(first.intent).toBe("service")
    expect(first.cleanQuery).toBe("eletricista")
    expect(first.aiSuggestedTerms).toEqual(["eletricista", "troca chuveiro"])

    // Segunda chamada deve vir do cache em RAM sem chamar IA novamente
    const second = await resolveAiSearchIntent("meu chuveiro queimou hoje", rule, {
      deps: {
        isEnabled: () => true,
        generate,
        getCache: async (k) => cacheStore.get(k) ?? null,
      },
    })

    expect(generate).toHaveBeenCalledTimes(1)
    expect(second.source).toBe("ai_cache")
    expect(second.cleanQuery).toBe("eletricista")
  })

  it("faz fallback silencioso para regras se a IA falhar", async () => {
    const rule = parseSearchIntent("meu chuveiro queimou")
    const res = await resolveAiSearchIntent("meu chuveiro queimou", rule, {
      deps: {
        isEnabled: () => true,
        generate: async () => {
          throw new Error("timeout")
        },
      },
    })

    expect(res.source).toBe("rules")
    expect(res.cleanQuery).toBe(rule.cleanQuery)
  })
})
