import { describe, expect, it } from "vitest"
import { isAllowedServerActionOrigin } from "./origin-validation"

describe("isAllowedServerActionOrigin", () => {
  it("accepts configured and canonical production origins", () => {
    expect(isAllowedServerActionOrigin("https://dudit.com.br", "https://dudit.com.br", false)).toBe(true)
    expect(isAllowedServerActionOrigin("https://www.dudit.com.br", "https://dudit.com.br", false)).toBe(true)
    expect(isAllowedServerActionOrigin("https://tenant.example", "https://tenant.example", false)).toBe(true)
  })

  it("does not trust request hosts or lookalike loopback hostnames", () => {
    expect(isAllowedServerActionOrigin("https://evil.example", "https://dudit.com.br", false)).toBe(false)
    expect(isAllowedServerActionOrigin("https://localhost.attacker.example", "https://dudit.com.br", false)).toBe(false)
    expect(isAllowedServerActionOrigin("http://127.0.0.1.attacker.example", "https://dudit.com.br", false)).toBe(false)
  })

  it("allows exact loopback origins only during development", () => {
    expect(isAllowedServerActionOrigin("http://localhost:3000", "https://dudit.com.br", true)).toBe(true)
    expect(isAllowedServerActionOrigin("http://127.0.0.1:3000", "https://dudit.com.br", true)).toBe(true)
    expect(isAllowedServerActionOrigin("http://localhost:3000", "https://dudit.com.br", false)).toBe(false)
  })
})
