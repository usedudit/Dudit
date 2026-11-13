import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock server-only
vi.mock("server-only", () => ({}))

// Mock supabase/admin
const mockFrom = vi.fn()
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    from: mockFrom,
  }),
}))

// Mock image cache
vi.mock("@/lib/moderation/image-cache", () => ({
  getImageUrlStatus: vi.fn().mockResolvedValue(null),
  cacheImageUrlStatus: vi.fn().mockResolvedValue(undefined),
}))

// Mock sightengine
vi.mock("@/lib/moderation/sightengine-moderation", () => ({
  moderateImageWithUrl: vi.fn(),
}))

describe("Recurring Plan Moderation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("runDeferredImageModeration marks recurring_plan as flagged when inappropriate image detected", async () => {
    const { runDeferredImageModeration } = await import("@/lib/moderation/deferred-image-moderation")
    const { moderateImageWithUrl } = await import("@/lib/moderation/sightengine-moderation")

    // Mock recurring_plan row in Supabase
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "plan-123",
              moderation_status: "approved",
              moderation_reason: null,
              images: ["plans/bad-image.webp"],
            },
            error: null,
          }),
        }),
      }),
      update: mockUpdate,
    })

    // Mock Sightengine returning flagged
    vi.mocked(moderateImageWithUrl).mockResolvedValueOnce({
      riskLevel: "high",
      confidence: 0.98,
      categories: [{ name: "Nudity/Adult Content", confidence: 0.98 }],
      rawResponse: null,
    })

    const result = await runDeferredImageModeration({
      entityType: "recurring_plan",
      entityId: "plan-123",
      partnerId: "partner-abc",
      images: ["plans/bad-image.webp"],
    })

    expect(result.status).toBe("flagged")
    expect(result.flaggedCount).toBe(1)
    expect(mockFrom).toHaveBeenCalledWith("recurring_plans")
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        moderation_status: "flagged",
      })
    )
  })

  it("runDeferredImageModeration skips already rejected recurring_plan", async () => {
    const { runDeferredImageModeration } = await import("@/lib/moderation/deferred-image-moderation")

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "plan-rejected",
              moderation_status: "rejected",
              images: ["plans/img.webp"],
            },
            error: null,
          }),
        }),
      }),
    })

    const result = await runDeferredImageModeration({
      entityType: "recurring_plan",
      entityId: "plan-rejected",
      partnerId: "partner-abc",
      images: ["plans/img.webp"],
    })

    expect(result.status).toBe("skipped")
    expect(result.flaggedCount).toBe(0)
  })
})

