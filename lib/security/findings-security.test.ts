import { describe, it, expect } from "vitest"
import { sanitizeRichText } from "@/lib/security/rich-text-sanitizer"
import { requireScope } from "@/lib/auth/admin-authorization"
import type { AdminUser } from "@/lib/admin/types"

describe("Security Audit Findings Remediation Tests", () => {
  describe("Finding 1: Stored XSS Prevention in Rich Text", () => {
    it("should neutralize script tags, event handlers and javascript: URLs", () => {
      const dirty = `<p>Test</p><script>window.location='http://evil.com'</script><img src="x" onerror="alert(1)"><a href="javascript:alert(2)">Link</a>`
      const clean = sanitizeRichText(dirty)
      expect(clean).not.toContain("<script>")
      expect(clean).not.toContain("evil.com")
      expect(clean).not.toContain("onerror")
      expect(clean).not.toContain("javascript:")
      expect(clean).toContain("<p>Test</p>")
      expect(clean).toContain('<img src="x">')
      expect(clean).toContain("<a>Link</a>")
    })
  })

  describe("Finding 4: Supabase Client Fail-Fast Validation", () => {
    it("should throw error when client-side admin client creation is attempted in browser environment", async () => {
      const { createAdminClient } = await import("@/lib/supabase/server")
      expect(() => createAdminClient()).toThrow("createAdminClient must only be used on the server")
    })

    it("should throw explicit error when SUPABASE env vars are missing in browser client", async () => {
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      const { createClient } = await import("@/lib/supabase/client")
      expect(() => createClient()).toThrow("Missing Supabase browser environment variables")

      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey
    })
  })

  describe("Admin privilege isolation", () => {
    const moderator: AdminUser = {
      userId: "moderator-id",
      role: "moderator",
      email: "moderator@example.com",
      isProtected: false,
      scopes: ["moderation", "audit_access"],
    }

    it("should allow moderation but deny financial control to a moderator", () => {
      expect(() => requireScope(moderator, "moderation")).not.toThrow()
      expect(() => requireScope(moderator, "billing_control")).toThrow("billing_control")
      expect(() => requireScope(moderator, "user_enforcement")).toThrow("user_enforcement")
    })
  })
})
