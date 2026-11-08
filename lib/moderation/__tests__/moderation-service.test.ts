import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"

// ─── Mocks de infraestrutura (hoisted) ──────────────────────────────────────
const h = vi.hoisted(() => {
  const store = new Map<string, unknown>()
  return { store }
})

vi.mock("@/lib/redis", () => ({
  redis: {
    get: async (key: string) => h.store.get(key) ?? null,
    setex: async (key: string, _ttl: number, value: unknown) => {
      h.store.set(key, value)
      return "OK"
    },
  },
}))

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {}
    }
    async limit() {
      return { success: true }
    }
  },
}))

type ModerationModule = typeof import("../moderation-service")
let mod: ModerationModule

const aiResponse = (response: string) =>
  new Response(JSON.stringify({ result: { response }, success: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })

beforeAll(async () => {
  process.env.CLOUDFLARE_ACCOUNT_ID = "test-account"
  process.env.CLOUDFLARE_AI_TOKEN = "test-token"
  mod = await import("../moderation-service")
})

beforeEach(() => {
  h.store.clear()
  vi.restoreAllMocks()
})

describe("checkLocalBlocklist (camada local pt-BR)", () => {
  it.each([
    ["preto imundo"],
    ["seu viado"],
    ["VIADO DE MERDA"],
    ["v1ado de merda"],
    ["judeu sujo"],
    ["lugar de mulher é na cozinha"],
    ["mulher só serve pra lavar louça"],
  ])("bloqueia: %s", (text) => {
    const verdict = mod.checkLocalBlocklist(text)
    expect(verdict.blocked).toBe(true)
  })

  it.each([
    ["Camiseta branca tamanho M"],
    ["Sapata de concreto para obra"],
    ["Kit 10 camisas pretas"],
    ["Computador usado, funciona bem"],
    ["Serviço de pintura residencial"],
  ])("não bloqueia: %s", (text) => {
    const verdict = mod.checkLocalBlocklist(text)
    expect(verdict.blocked).toBe(false)
  })
})

describe("checkTextSafety", () => {
  it("bloqueia sem chamar a IA quando a blocklist local pega", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const result = await mod.checkTextSafety(["preto imundo"])

    expect(result.passed).toBe(false)
    expect(result.reason).toContain("Discurso de ódio")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("usa a IA quando a blocklist local não pega e respeita o veredito unsafe", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(aiResponse("\n\nunsafe\nS10"))

    const result = await mod.checkTextSafety(["nordestino é tudo preguiçoso"])

    expect(result.passed).toBe(false)
    expect(result.flaggedTexts?.[0].categories).toContain("Discurso de ódio")
  })

  it("mapeia S1..S14 corretamente (S12 = Conteúdo sexual)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(aiResponse("unsafe\nS12"))

    const result = await mod.checkTextSafety(["conteudo adulto explicito"])

    expect(result.passed).toBe(false)
    expect(result.reason).toContain("Conteúdo sexual")
  })

  it("deixa passar conteúdo legítimo", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(aiResponse("safe"))

    const result = await mod.checkTextSafety(["Camiseta branca tamanho M"])

    expect(result.passed).toBe(true)
    expect(result.degraded).toBeUndefined()
  })

  it("marca degraded quando a Cloudflare falha (sem bloquear o usuário)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unauthorized", { status: 403 })
    )

    const result = await mod.checkTextSafety(["um texto qualquer"])

    expect(result.passed).toBe(true)
    expect(result.degraded).toBe(true)
  })

  it("não grava cache quando a resposta é degradada", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("boom", { status: 500 }))

    await mod.checkTextSafety(["texto cacheavel"])

    expect(h.store.size).toBe(0)
  })

  it("reaproveita o cache por texto (não chama a IA duas vezes)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(aiResponse("unsafe\nS10"))

    await mod.checkTextSafety(["mesmo texto ofensivo"])
    await mod.checkTextSafety(["mesmo texto ofensivo"])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("combina vários textos em uma única chamada quando estão fora do cache", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(aiResponse("safe"))

    const result = await mod.checkTextSafety(["Nome do produto", "Descrição do produto"])

    expect(result.passed).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("re-checa individualmente quando o conjunto é unsafe, para atribuir o campo", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(aiResponse("unsafe\nS10")) // conjunto
      .mockResolvedValueOnce(aiResponse("safe")) // nome
      .mockResolvedValueOnce(aiResponse("unsafe\nS10")) // descrição

    const result = await mod.checkTextSafety(["nome ok", "descricao ruim"])

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(result.passed).toBe(false)
    expect(result.flaggedTexts).toHaveLength(1)
    expect(result.flaggedTexts?.[0].text).toContain("descricao ruim")
  })

  it("em asyncMode: true retorna degraded sem chamar a IA para textos fora do cache", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    const result = await mod.checkTextSafety(["Produto novo em folha"], undefined, { asyncMode: true })

    expect(result.passed).toBe(true)
    expect(result.degraded).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("em asyncMode: true ainda bloqueia na hora se a blocklist local identificar termo proibido", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    const result = await mod.checkTextSafety(["preto imundo"], undefined, { asyncMode: true })

    expect(result.passed).toBe(false)
    expect(result.reason).toContain("Discurso de ódio")
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
