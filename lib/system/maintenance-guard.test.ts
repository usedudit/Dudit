import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { evaluateMaintenanceMode, clearMaintenanceMemoryCache } from "./maintenance-guard"

const mockFetch = vi.fn()
global.fetch = mockFetch

describe("evaluateMaintenanceMode (Edge Guard)", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    clearMaintenanceMemoryCache()
    process.env = {
      ...originalEnv,
      KV_REST_API_URL: "https://mock-redis.upstash.io",
      KV_REST_API_TOKEN: "mock-token",
    }
  })

  it("allows exempt paths immediately without querying Redis", async () => {
    const req = new NextRequest("https://dudit.com.br/ddt-admin/system")
    const result = await evaluateMaintenanceMode(req)
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("allows maintenance page /manutencao without redirect loop", async () => {
    const req = new NextRequest("https://dudit.com.br/manutencao")
    const result = await evaluateMaintenanceMode(req)
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("allows normal traffic when maintenance is disabled in Redis", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: JSON.stringify({ enabled: false }),
      }),
    })

    const req = new NextRequest("https://dudit.com.br/explorar")
    const result = await evaluateMaintenanceMode(req)
    expect(result).toBeNull()
  })

  it("blocks page navigations with 503 rewrite when maintenance is enabled", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: JSON.stringify({
          enabled: true,
          message: "Em manutenção",
          allow_admin_bypass: true,
          bypass_token: "secret_bypass",
        }),
      }),
    })

    const req = new NextRequest("https://dudit.com.br/explorar")
    const result = await evaluateMaintenanceMode(req)
    expect(result).not.toBeNull()
    expect(result?.status).toBe(503)
    expect(result?.headers.get("Retry-After")).toBe("3600")
  })

  it("blocks API and Server Action requests with 503 JSON payload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: JSON.stringify({
          enabled: true,
          message: "API em manutenção",
          allow_admin_bypass: true,
          bypass_token: "secret_bypass",
        }),
      }),
    })

    const req = new NextRequest("https://dudit.com.br/api/products", {
      headers: { "Content-Type": "application/json" },
    })
    const result = await evaluateMaintenanceMode(req)
    expect(result).not.toBeNull()
    expect(result?.status).toBe(503)
    expect(result?.headers.get("Content-Type")).toBe("application/json")
  })

  it("allows requests with valid bypass cookie", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: JSON.stringify({
          enabled: true,
          message: "Em manutenção",
          allow_admin_bypass: true,
          bypass_token: "secret_bypass",
        }),
      }),
    })

    const req = new NextRequest("https://dudit.com.br/explorar", {
      headers: {
        cookie: "ddt_maint_bypass=secret_bypass",
      },
    })
    const result = await evaluateMaintenanceMode(req)
    expect(result).toBeNull()
  })

  it("rejects arbitrary bypass cookies", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: JSON.stringify({
          enabled: true,
          message: "Em manutenção",
          allow_admin_bypass: true,
          bypass_token: "secret_bypass",
        }),
      }),
    })

    const req = new NextRequest("https://dudit.com.br/explorar", {
      headers: {
        cookie: "ddt_maint_bypass=attacker-controlled-value",
      },
    })
    const result = await evaluateMaintenanceMode(req)
    expect(result?.status).toBe(503)
  })

  it("rejects the published legacy bypass token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: JSON.stringify({
          enabled: true,
          message: "Em manutenção",
          allow_admin_bypass: true,
          bypass_token: "dudit_sec_bypass",
        }),
      }),
    })

    const req = new NextRequest("https://dudit.com.br/explorar?bypass=dudit_sec_bypass")
    const result = await evaluateMaintenanceMode(req)
    expect(result?.status).toBe(503)
  })

  it("fails open if Redis fetch fails or times out", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"))

    const req = new NextRequest("https://dudit.com.br/explorar")
    const result = await evaluateMaintenanceMode(req)
    expect(result).toBeNull()
  })
})
