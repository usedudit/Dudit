import { describe, expect, it, vi, beforeEach } from "vitest"
import { EvolutionWhatsappClient } from "./evolution-client"

vi.mock("node:dns", () => ({
  default: {
    promises: {
      lookup: async () => ({ address: "93.184.216.34", family: 4 }) // example.com IP
    }
  }
}))

describe("EvolutionWhatsappClient URL Validation", () => {
  it("allows valid public URLs", () => {
    const client = new EvolutionWhatsappClient({
      apiUrl: "https://api.evolution.example.com",
      apiKey: "test-api-key",
      instanceName: "test-instance",
    })
    expect(client).toBeDefined()
  })

  it("auto-prepends https:// when protocol is missing", () => {
    const client = new EvolutionWhatsappClient({
      apiUrl: "api.evolution.example.com",
      apiKey: "test-api-key",
      instanceName: "test-instance",
    })
    expect(client).toBeDefined()
  })

  it("throws on empty URL", () => {
    expect(() => {
      new EvolutionWhatsappClient({
        apiUrl: "",
        apiKey: "test-api-key",
        instanceName: "test-instance",
      })
    }).toThrow("URL da Evolution API inválida")
  })

  it("throws on blocked hostnames for security (localhost, local IP, private ranges)", () => {
    expect(() => {
      new EvolutionWhatsappClient({
        apiUrl: "http://localhost:8080",
        apiKey: "test-api-key",
        instanceName: "test-instance",
      })
    }).toThrow("URL não permitida por segurança")

    expect(() => {
      new EvolutionWhatsappClient({
        apiUrl: "http://127.0.0.1",
        apiKey: "test-api-key",
        instanceName: "test-instance",
      })
    }).toThrow("URL não permitida por segurança")

    expect(() => {
      new EvolutionWhatsappClient({
        apiUrl: "http://192.168.1.1",
        apiKey: "test-api-key",
        instanceName: "test-instance",
      })
    }).toThrow("URL não permitida (rede privada)")

    expect(() => {
      new EvolutionWhatsappClient({
        apiUrl: "http://127.0.0.2",
        apiKey: "test-api-key",
        instanceName: "test-instance",
      })
    }).toThrow("URL não permitida por segurança")

    expect(() => {
      new EvolutionWhatsappClient({
        apiUrl: "http://[fd00::1]",
        apiKey: "test-api-key",
        instanceName: "test-instance",
      })
    }).toThrow("URL não permitida por segurança")
  })
})

describe("EvolutionWhatsappClient Requests", () => {
  const config = {
    apiUrl: "https://api.evolution.example.com",
    apiKey: "test-api-key",
    instanceName: "test-instance",
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("sends text messages to correct endpoint with apikey header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => (name === "content-type" ? "application/json" : null),
      },
      json: async () => ({
        key: { id: "msg-12345" },
      }),
    } as Response)

    const client = new EvolutionWhatsappClient(config)
    const result = await client.sendText({
      to: "5511999999999",
      body: "Hello world",
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.evolution.example.com/message/sendText/test-instance",
      expect.objectContaining({
        method: "POST",
        headers: {
          apikey: "test-api-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          number: "5511999999999",
          text: "Hello world",
        }),
      })
    )
    expect(result).toEqual({
      providerMessageId: "msg-12345",
      raw: { key: { id: "msg-12345" } },
    })
  })
})
