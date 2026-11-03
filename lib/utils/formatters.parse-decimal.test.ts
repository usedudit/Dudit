import { describe, it, expect } from "vitest"
import { formatDecimalInput, parseDecimalInput } from "./formatters"

describe("parseDecimalInput", () => {
  it("parses comma and dot decimal separators", () => {
    expect(parseDecimalInput("1,5")).toBe(1.5)
    expect(parseDecimalInput("1.5")).toBe(1.5)
  })

  it("parses thousands separators", () => {
    expect(parseDecimalInput("1.500,50")).toBe(1500.5)
    expect(parseDecimalInput("1,500.50")).toBe(1500.5)
  })

  it("returns 0 for empty or invalid input", () => {
    expect(parseDecimalInput("")).toBe(0)
    expect(parseDecimalInput(null)).toBe(0)
    expect(parseDecimalInput(undefined)).toBe(0)
    expect(parseDecimalInput("abc")).toBe(0)
    expect(parseDecimalInput(",")).toBe(0)
  })

  it("keeps numbers untouched", () => {
    expect(parseDecimalInput(2.25)).toBe(2.25)
    expect(parseDecimalInput(0)).toBe(0)
  })
})

describe("formatDecimalInput", () => {
  it("renders zero as empty so the placeholder is visible", () => {
    expect(formatDecimalInput(0)).toBe("")
    expect(formatDecimalInput(null)).toBe("")
    expect(formatDecimalInput(undefined)).toBe("")
  })

  it("renders decimal numbers with a comma", () => {
    expect(formatDecimalInput(1.5)).toBe("1,5")
  })

  it("keeps raw strings typed by the user", () => {
    expect(formatDecimalInput("0")).toBe("0")
    expect(formatDecimalInput("1,")).toBe("1,")
  })
})
