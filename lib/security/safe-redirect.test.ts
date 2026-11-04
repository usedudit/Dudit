import { describe, it, expect } from "vitest"
import { getSafeRedirectPath } from "./safe-redirect"

describe("getSafeRedirectPath", () => {
  it("allows valid relative paths and queries", () => {
    expect(getSafeRedirectPath("/dashboard")).toBe("/dashboard")
    expect(getSafeRedirectPath("/erp/pedidos?id=123&status=active")).toBe("/erp/pedidos?id=123&status=active")
    expect(getSafeRedirectPath("/perfil#seguranca")).toBe("/perfil#seguranca")
    expect(getSafeRedirectPath("/")).toBe("/")
  })

  it("blocks protocol-relative URLs", () => {
    expect(getSafeRedirectPath("//evil.com")).toBe("/")
    expect(getSafeRedirectPath("///evil.com")).toBe("/")
    expect(getSafeRedirectPath("//evil.com/path")).toBe("/")
  })

  it("blocks backslash open-redirect evasions", () => {
    expect(getSafeRedirectPath("/\\evil.com")).toBe("/")
    expect(getSafeRedirectPath("/\\\\evil.com")).toBe("/")
    expect(getSafeRedirectPath("/path\\evil.com")).toBe("/")
    expect(getSafeRedirectPath("/%5cevil.com")).toBe("/")
    expect(getSafeRedirectPath("/%5Cevil.com")).toBe("/")
  })

  it("blocks absolute URLs and other schemes", () => {
    expect(getSafeRedirectPath("https://evil.com")).toBe("/")
    expect(getSafeRedirectPath("http://evil.com")).toBe("/")
    expect(getSafeRedirectPath("javascript:alert(1)")).toBe("/")
    expect(getSafeRedirectPath("data:text/html,evil")).toBe("/")
  })

  it("blocks control characters and whitespace tricks", () => {
    expect(getSafeRedirectPath("/\tevil.com")).toBe("/")
    expect(getSafeRedirectPath("/\nevil.com")).toBe("/")
    expect(getSafeRedirectPath("/\revil.com")).toBe("/")
  })

  it("handles null, undefined and non-string inputs with fallback", () => {
    expect(getSafeRedirectPath(null)).toBe("/")
    expect(getSafeRedirectPath(undefined)).toBe("/")
    expect(getSafeRedirectPath("")).toBe("/")
    expect(getSafeRedirectPath("   ")).toBe("/")
    expect(getSafeRedirectPath("invalid", "/fallback")).toBe("/fallback")
  })
})

