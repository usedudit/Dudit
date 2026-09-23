import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { GET } from "./route"

describe("GET /api/mercadopago/zip-code", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns 400 for invalid CEP", async () => {
    const req = new NextRequest("http://localhost:3000/api/mercadopago/zip-code?cep=123")
    const res = await GET(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("CEP inválido")
  })

  it("returns 200 with Mercado Libre address schema when Edge Function cep-lookup succeeds", async () => {
    const mockCepResponse = {
      cep: "01005-900",
      logradouro: "Praça da Sé",
      bairro: "Sé",
      localidade: "São Paulo",
      uf: "SP",
      ibge: "3550308",
      latitude: -23.5489,
      longitude: -46.6388,
    }

    vi.spyOn(global, "fetch").mockImplementation(async (url: any) => {
      const urlStr = String(url)
      if (urlStr.includes("/functions/v1/cep-lookup") || urlStr.includes("/api/cep")) {
        return new Response(JSON.stringify(mockCepResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      return new Response("Not found", { status: 404 })
    })

    const req = new NextRequest("http://localhost:3000/api/mercadopago/zip-code?cep=01005900")
    const res = await GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.zip_code).toBe("01005900")
    expect(data.street_name).toBe("Praça da Sé")
    expect(data.neighborhood.name).toBe("Sé")
    expect(data.city.name).toBe("São Paulo")
    expect(data.state.name).toBe("SP")
    expect(data.extended_attributes.address).toBe("Praça da Sé")
  })
})
