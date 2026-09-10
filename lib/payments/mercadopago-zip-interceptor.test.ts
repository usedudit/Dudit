import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { installMercadoPagoZipInterceptor } from "./mercadopago-zip-interceptor"

describe("installMercadoPagoZipInterceptor", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("intercepts fetch to mercadolibre zip_codes and redirects to local proxy endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          zip_code: "01005900",
          city: { id: "BR-SP-44", name: "São Paulo" },
          state: { id: "BR-SP", name: "São Paulo" },
          country: { id: "BR", name: "Brasil" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )
    global.fetch = mockFetch

    installMercadoPagoZipInterceptor("test-partner-123")

    const res = await window.fetch("https://api.mercadolibre.com/countries/BR/zip_codes/01005900")
    expect(res.status).toBe(200)

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/mercadopago/zip-code?cep=01005900&partnerId=test-partner-123",
      expect.anything()
    )

    const data = await res.json()
    expect(data.zip_code).toBe("01005900")
    expect(data.city.name).toBe("São Paulo")
  })

  it("does not intercept normal fetch calls", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }))
    global.fetch = mockFetch

    installMercadoPagoZipInterceptor("test-partner-123")

    await window.fetch("https://api.example.com/other")
    expect(mockFetch).toHaveBeenCalledWith("https://api.example.com/other")
  })
})
