import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getTrustedClientIP } from "./client-ip"

describe("getTrustedClientIP", () => {
  beforeEach(() => vi.stubEnv("TRUSTED_PROXY_HEADERS", "false"))
  afterEach(() => vi.unstubAllEnvs())

  it("prefers the platform IP", () => {
    expect(getTrustedClientIP(new Headers({ "x-real-ip": "198.51.100.20" }), "203.0.113.10")).toBe("203.0.113.10")
  })

  it("does not trust spoofable headers by default", () => {
    const headers = new Headers({
      "x-forwarded-for": "127.0.0.1",
      "x-real-ip": "127.0.0.1",
      "cf-connecting-ip": "127.0.0.1",
    })
    expect(getTrustedClientIP(headers)).toBe("unknown")
  })

  it("accepts Cloudflare's client IP only when explicitly trusted", () => {
    vi.stubEnv("TRUSTED_PROXY_HEADERS", "true")
    expect(getTrustedClientIP(new Headers({ "cf-connecting-ip": "203.0.113.10" }))).toBe("203.0.113.10")
  })
})
