import { describe, it, expect } from "vitest"
import { calculatePasswordScore } from "@/lib/utils"
import { getSafeRedirectPath } from "./safe-redirect"

describe("Auth Security Rules", () => {
  describe("Password Policy & Input Integrity (CWE-20 Mangling Prevention)", () => {
    function validatePasswordInput(password: unknown, confirm: unknown): { valid: boolean; error?: string } {
      if (typeof password !== "string" || typeof confirm !== "string") {
        return { valid: false, error: "Dados inválidos" }
      }
      if (!password || password.length < 8) {
        return { valid: false, error: "A nova senha deve ter pelo menos 8 caracteres" }
      }
      if (password.length > 128) {
        return { valid: false, error: "A nova senha deve ter no máximo 128 caracteres" }
      }
      if (calculatePasswordScore(password) < 2) {
        return { valid: false, error: "Sua nova senha deve ter força Média ou Forte" }
      }
      if (password !== confirm) {
        return { valid: false, error: "As senhas não coincidem" }
      }
      return { valid: true }
    }

    it("accepts complex passwords with HTML special characters without mangling", () => {
      const complexPass = "Str0ng&P@ss<w0rd>!#"
      const result = validatePasswordInput(complexPass, complexPass)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it("rejects passwords under 8 characters", () => {
      const shortPass = "Ab1!"
      const result = validatePasswordInput(shortPass, shortPass)
      expect(result.valid).toBe(false)
      expect(result.error).toContain("pelo menos 8 caracteres")
    })

    it("rejects passwords exceeding 128 characters (DoS prevention)", () => {
      const longPass = "A1!" + "a".repeat(130)
      const result = validatePasswordInput(longPass, longPass)
      expect(result.valid).toBe(false)
      expect(result.error).toContain("no máximo 128 caracteres")
    })

    it("rejects weak passwords with score < 2", () => {
      const weakPass = "abcdefgh" // all lowercase letters
      const result = validatePasswordInput(weakPass, weakPass)
      expect(result.valid).toBe(false)
      expect(result.error).toContain("força Média ou Forte")
    })

    it("rejects password when confirmation does not match", () => {
      const pass = "Str0ng&P@ssw0rd!"
      const result = validatePasswordInput(pass, "DifferentP@ssw0rd1")
      expect(result.valid).toBe(false)
      expect(result.error).toContain("não coincidem")
    })

    it("rejects non-string inputs", () => {
      expect(validatePasswordInput(null, null).valid).toBe(false)
      expect(validatePasswordInput(12345678, 12345678).valid).toBe(false)
    })
  })

  describe("Open Redirect Protection (CWE-601)", () => {
    it("blocks backslash open redirects", () => {
      expect(getSafeRedirectPath("/\\evil.com")).toBe("/")
      expect(getSafeRedirectPath("/\\/evil.com")).toBe("/")
      expect(getSafeRedirectPath("/%5cevil.com")).toBe("/")
      expect(getSafeRedirectPath("/%5Cevil.com")).toBe("/")
    })

    it("blocks protocol-relative URLs", () => {
      expect(getSafeRedirectPath("//evil.com")).toBe("/")
      expect(getSafeRedirectPath("///evil.com")).toBe("/")
    })

    it("blocks absolute URLs to third-party domains", () => {
      expect(getSafeRedirectPath("https://evil.com")).toBe("/")
      expect(getSafeRedirectPath("http://evil.com/phish")).toBe("/")
      expect(getSafeRedirectPath("javascript:alert(1)")).toBe("/")
    })

    it("preserves valid relative paths with query and hash", () => {
      expect(getSafeRedirectPath("/dashboard")).toBe("/dashboard")
      expect(getSafeRedirectPath("/erp/pedidos?status=open&page=2#top")).toBe("/erp/pedidos?status=open&page=2#top")
    })
  })
})

