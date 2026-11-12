import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Mock dependencies
vi.mock("@/app/actions/erp/recurring-subscriptions", () => ({
  sweepExpiredPriceChangeWindowsAction: vi.fn().mockResolvedValue({ success: true, data: { frozen: 1 } }),
  runDueRecurringSubscriptionsAction: vi.fn().mockResolvedValue({
    success: true,
    data: { claimed: 2, completed: 2, failed: 0, deferred: 0 },
  }),
}))

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn().mockReturnValue({
    rpc: vi.fn().mockResolvedValue({ data: 0, error: null }),
  }),
}))

describe("Recurring Subscriptions Cron Route (/api/cron/recurring-subscriptions)", () => {
  const CRON_SECRET = "test_cron_secret_abc123"

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET)
  })

  it("returns 401 when no authorization is provided", async () => {
    const { GET } = await import("./route")
    const req = new NextRequest("http://localhost:3000/api/cron/recurring-subscriptions")
    const res = await GET(req)
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toBe("Unauthorized")
  })

  it("returns 401 when wrong token is provided in Authorization header", async () => {
    const { GET } = await import("./route")
    const req = new NextRequest("http://localhost:3000/api/cron/recurring-subscriptions", {
      headers: { Authorization: "Bearer wrong_token" },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it("authenticates successfully with valid Bearer token", async () => {
    const { GET } = await import("./route")
    const req = new NextRequest("http://localhost:3000/api/cron/recurring-subscriptions", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.completed).toBe(2)
  })

  it("authenticates successfully with x-cron-secret header", async () => {
    const { GET } = await import("./route")
    const req = new NextRequest("http://localhost:3000/api/cron/recurring-subscriptions", {
      headers: { "x-cron-secret": CRON_SECRET },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it("authenticates successfully with ?key= query parameter (cron-job.org style)", async () => {
    const { GET } = await import("./route")
    const req = new NextRequest(`http://localhost:3000/api/cron/recurring-subscriptions?key=${CRON_SECRET}`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it("authenticates successfully with ?secret= query parameter", async () => {
    const { GET } = await import("./route")
    const req = new NextRequest(`http://localhost:3000/api/cron/recurring-subscriptions?secret=${CRON_SECRET}`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it("accepts POST requests identically to GET requests", async () => {
    const { POST } = await import("./route")
    const req = new NextRequest("http://localhost:3000/api/cron/recurring-subscriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })
})

