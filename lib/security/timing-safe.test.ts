import { describe, it, expect } from "vitest"
import { isValidBearerToken, timingSafeStringEqual } from "./timing-safe"

describe("isValidBearerToken (Timing-safe Bearer Authentication)", () => {
  const secret = "my_super_secret_token_12345"

  it("returns true for exact matching Bearer header", () => {
    expect(isValidBearerToken(`Bearer ${secret}`, secret)).toBe(true)
  })

  it("returns false for wrong token", () => {
    expect(isValidBearerToken("Bearer wrong_token_value", secret)).toBe(false)
  })

  it("returns false for token with different prefix or no Bearer prefix", () => {
    expect(isValidBearerToken(secret, secret)).toBe(false)
    expect(isValidBearerToken(`Basic ${secret}`, secret)).toBe(false)
    expect(isValidBearerToken(`bearer ${secret}`, secret)).toBe(false) // case-sensitive RFC standard
  })

  it("returns false for missing or null authHeader", () => {
    expect(isValidBearerToken(null, secret)).toBe(false)
    expect(isValidBearerToken(undefined, secret)).toBe(false)
    expect(isValidBearerToken("", secret)).toBe(false)
  })

  it("returns false if expectedToken is missing or null", () => {
    expect(isValidBearerToken(`Bearer ${secret}`, null)).toBe(false)
    expect(isValidBearerToken(`Bearer ${secret}`, undefined)).toBe(false)
    expect(isValidBearerToken(`Bearer ${secret}`, "")).toBe(false)
  })

  it("safely handles inputs of vastly different lengths without throwing", () => {
    expect(isValidBearerToken("B", secret)).toBe(false)
    expect(isValidBearerToken(`Bearer ${"a".repeat(1000)}`, secret)).toBe(false)
  })
})

describe("timingSafeStringEqual (Constant-time String Comparison)", () => {
  const secret = "shared_webhook_secret_98765"

  it("returns true for exact matching strings", () => {
    expect(timingSafeStringEqual(secret, secret)).toBe(true)
  })

  it("returns false for different strings of same length", () => {
    expect(timingSafeStringEqual("abcdef123456", "abcdef123457")).toBe(false)
  })

  it("returns false for strings of different lengths without throwing", () => {
    expect(timingSafeStringEqual("short", "much_longer_string_value")).toBe(false)
    expect(timingSafeStringEqual("a", "b")).toBe(false)
  })

  it("returns false for empty or nullish values", () => {
    expect(timingSafeStringEqual(null, secret)).toBe(false)
    expect(timingSafeStringEqual(secret, null)).toBe(false)
    expect(timingSafeStringEqual(undefined, secret)).toBe(false)
    expect(timingSafeStringEqual(secret, undefined)).toBe(false)
    expect(timingSafeStringEqual("", secret)).toBe(false)
    expect(timingSafeStringEqual(secret, "")).toBe(false)
    expect(timingSafeStringEqual("", "")).toBe(false)
  })
})

