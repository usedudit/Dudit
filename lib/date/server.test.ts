import { describe, it, expect, vi } from "vitest"
import { getPartnerTimezone } from "./server"

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { timezone: "America/Manaus" } }),
          })),
        })),
      })),
    })),
  })),
}))

describe("lib/date/server", () => {
  it("fetches partner timezone from stores table", async () => {
    const tz = await getPartnerTimezone("p123")
    expect(tz).toBe("America/Manaus")
  })
})
