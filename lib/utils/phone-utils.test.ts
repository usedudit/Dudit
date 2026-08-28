import { describe, it, expect } from "vitest"
import {
  extractCleanPhoneDigits,
  formatBrazilPhone,
  cleanAndFormatPhone,
  sanitizeAddressComplement,
  isValidBrazilMobile,
  isValidBrazilLandline,
  normalizePhoneToE164,
} from "./phone-utils"

describe("phone-utils", () => {
  describe("extractCleanPhoneDigits", () => {
    it("should strip leading zeros from cell phone with multiple leading zeros", () => {
      expect(extractCleanPhoneDigits("0011949820472")).toBe("11949820472")
      expect(extractCleanPhoneDigits("011949820472")).toBe("11949820472")
      expect(extractCleanPhoneDigits("00011949820472")).toBe("11949820472")
    })

    it("should strip DDI 55 when 12 or 13 digits", () => {
      expect(extractCleanPhoneDigits("5511949820472")).toBe("11949820472")
      expect(extractCleanPhoneDigits("+5511949820472")).toBe("11949820472")
      expect(extractCleanPhoneDigits("551133334444")).toBe("1133334444")
    })

    it("should preserve 0800 numbers without stripping the zero", () => {
      expect(extractCleanPhoneDigits("08007771234")).toBe("08007771234")
      expect(extractCleanPhoneDigits("03001234567")).toBe("03001234567")
    })

    it("should return empty string for all zeros or empty input", () => {
      expect(extractCleanPhoneDigits("00000000000")).toBe("")
      expect(extractCleanPhoneDigits("0")).toBe("")
      expect(extractCleanPhoneDigits("")).toBe("")
      expect(extractCleanPhoneDigits(null)).toBe("")
    })
  })

  describe("formatBrazilPhone & cleanAndFormatPhone", () => {
    it("should format cell phone with leading zeros from XML correctly", () => {
      expect(formatBrazilPhone("0011949820472")).toBe("(11) 94982-0472")
      expect(cleanAndFormatPhone("0011949820472")).toBe("(11) 94982-0472")
    })

    it("should format regular 11-digit mobile", () => {
      expect(formatBrazilPhone("11949820472")).toBe("(11) 94982-0472")
      expect(cleanAndFormatPhone("11949820472")).toBe("(11) 94982-0472")
    })

    it("should format regular 10-digit landline", () => {
      expect(formatBrazilPhone("1133334444")).toBe("(11) 3333-4444")
      expect(formatBrazilPhone("001133334444")).toBe("(11) 3333-4444")
    })

    it("should format 0800 numbers", () => {
      expect(formatBrazilPhone("08007771234")).toBe("0800 777 1234")
    })

    it("should return null for cleanAndFormatPhone on invalid/zero strings", () => {
      expect(cleanAndFormatPhone("00000000000")).toBeNull()
      expect(cleanAndFormatPhone("")).toBeNull()
      expect(cleanAndFormatPhone(null)).toBeNull()
    })
  })

  describe("sanitizeAddressComplement", () => {
    it("should filter out placeholder / dummy complement strings", () => {
      expect(sanitizeAddressComplement("Nao consta")).toBeNull()
      expect(sanitizeAddressComplement("nao consta")).toBeNull()
      expect(sanitizeAddressComplement("Não consta")).toBeNull()
      expect(sanitizeAddressComplement("NÃO CONSTA")).toBeNull()
      expect(sanitizeAddressComplement("Sem complemento")).toBeNull()
      expect(sanitizeAddressComplement("Nao possui")).toBeNull()
      expect(sanitizeAddressComplement("S/C")).toBeNull()
      expect(sanitizeAddressComplement("S/N")).toBeNull()
      expect(sanitizeAddressComplement("-")).toBeNull()
      expect(sanitizeAddressComplement(".")).toBeNull()
      expect(sanitizeAddressComplement("")).toBeNull()
      expect(sanitizeAddressComplement(null)).toBeNull()
    })

    it("should preserve valid complements", () => {
      expect(sanitizeAddressComplement("Apto 101")).toBe("Apto 101")
      expect(sanitizeAddressComplement("Bloco B, Sala 12")).toBe("Bloco B, Sala 12")
      expect(sanitizeAddressComplement("Galpão 3")).toBe("Galpão 3")
      expect(sanitizeAddressComplement("Fundos")).toBe("Fundos")
      expect(sanitizeAddressComplement("Casa 2")).toBe("Casa 2")
    })
  })
})
