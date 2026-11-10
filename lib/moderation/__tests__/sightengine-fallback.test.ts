import { describe, it, expect, vi, beforeEach } from "vitest"
import { moderateImageWithUrl } from "@/lib/moderation/sightengine-moderation"

// Mock server-only
vi.mock("server-only", () => ({}))

// Mock ssrf-guard
vi.mock("@/lib/security/ssrf-guard", () => ({
  validateImageUrl: vi.fn().mockReturnValue({ valid: true }),
  safeFetch: vi.fn(),
  SSRFError: class extends Error {},
}))

// Mock r2/server
vi.mock("@/lib/r2/server", () => ({
  getFileBufferFromR2: vi.fn(),
}))

describe("moderateImageWithUrl fallback and internal storage bypass", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SIGHTENGINE_API_USER = "test-user"
    process.env.SIGHTENGINE_API_SECRET = "test-secret"
  })

  it("should bypass CDN URL check and use direct R2 buffer when image is from dudit CDN or R2 path", async () => {
    const { getFileBufferFromR2 } = await import("@/lib/r2/server")
    const { safeFetch } = await import("@/lib/security/ssrf-guard")

    const mockBuffer = Buffer.from("fake-image-bytes")
    vi.mocked(getFileBufferFromR2).mockResolvedValue(mockBuffer)

    // Mock Sightengine check.json response for multipart POST
    vi.mocked(safeFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "success",
        nudity: { raw: 0.95 },
      }),
    } as any)

    const result = await moderateImageWithUrl("https://img.dudit.com.br/users/123/products/abc.webp")

    // Verify it used direct buffer fetch
    expect(getFileBufferFromR2).toHaveBeenCalledWith("https://img.dudit.com.br/users/123/products/abc.webp")
    // Verify safeFetch called Sightengine check.json with POST (FormData)
    expect(safeFetch).toHaveBeenCalledWith("https://api.sightengine.com/1.0/check.json", expect.objectContaining({
      method: "POST",
    }))
    expect(result.riskLevel).toBe("high")
    expect(result.categories).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Nudity/Adult Content" })])
    )
  })

  it("should fallback to direct R2 buffer when Sightengine returns non-success or media error", async () => {
    const { getFileBufferFromR2 } = await import("@/lib/r2/server")
    const { safeFetch } = await import("@/lib/security/ssrf-guard")

    // First call (GET check.json?url=...) fails with media_error 403 Forbidden
    vi.mocked(safeFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "failure",
        error: { type: "media_error", code: 12, message: "Could not download media. 403 Forbidden" },
      }),
    } as any)

    // Fallback getFileBufferFromR2 succeeds
    const mockBuffer = Buffer.from("fake-fallback-bytes")
    vi.mocked(getFileBufferFromR2).mockResolvedValue(mockBuffer)

    // Second call (POST check.json with FormData) succeeds
    vi.mocked(safeFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "success",
        nudity: { raw: 0.01 },
      }),
    } as any)

    const result = await moderateImageWithUrl("https://allowed-cdn.example.com/image.jpg")

    expect(getFileBufferFromR2).toHaveBeenCalledWith("https://allowed-cdn.example.com/image.jpg")
    expect(result.riskLevel).toBe("low")
    expect(result.categories).toHaveLength(0)
  })
})
