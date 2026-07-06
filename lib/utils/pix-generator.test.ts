import { describe, it, expect } from "vitest"
import { formatPixKey, generateStaticPix } from "./pix-generator"

describe("formatPixKey", () => {
  it("should keep emails unmodified but lowercased", () => {
    expect(formatPixKey("Test@Mail.com", "email")).toBe("test@mail.com")
    expect(formatPixKey("another.test@domain.com.br")).toBe("another.test@domain.com.br")
  })

  it("should keep random EVP keys unmodified", () => {
    const evp = "850c90f2-b88a-4d2b-a080-35327aa49cc7"
    expect(formatPixKey(evp, "random")).toBe(evp)
    expect(formatPixKey("  " + evp + "  ")).toBe(evp)
  })

  it("should format CPFs correctly by removing non-digits", () => {
    expect(formatPixKey("123.456.789-10", "cpf")).toBe("12345678910")
    expect(formatPixKey("12345678910")).toBe("12345678910")
  })

  it("should format CNPJs correctly by removing non-digits", () => {
    expect(formatPixKey("12.345.678/0001-90", "cnpj")).toBe("12345678000190")
    expect(formatPixKey("12345678000190")).toBe("12345678000190")
  })

  it("should format phone numbers correctly with international code +55", () => {
    // Already has +55
    expect(formatPixKey("+5511999998888", "phone")).toBe("+5511999998888")
    expect(formatPixKey("5511999998888", "phone")).toBe("+5511999998888")
    // Needs +55 prepended
    expect(formatPixKey("11999998888", "phone")).toBe("+5511999998888")
    expect(formatPixKey("(11) 99999-8888")).toBe("+5511999998888")
  })
})

describe("generateStaticPix", () => {
  it("should generate a valid BR Code string", () => {
    const payload = generateStaticPix(
      "12345678910", // CPF key
      150.00,
      "Fulano de Tal",
      "Sao Paulo",
      "DUDIT123",
      "cpf"
    )

    // Check payload format indicator
    expect(payload.startsWith("000201")).toBe(true)

    // Check merchant account info tag 26
    expect(payload.includes("26")).toBe(true)
    expect(payload.includes("br.gov.bcb.pix")).toBe(true)

    // Check merchant category code tag 52
    expect(payload.includes("52040000")).toBe(true)

    // Check currency tag 53
    expect(payload.includes("5303986")).toBe(true)

    // Check amount tag 54
    expect(payload.includes("5406150.00")).toBe(true)

    // Check country code tag 58
    expect(payload.includes("5802BR")).toBe(true)

    // Check name tag 59 (accent removed, uppercase, limited length)
    expect(payload.includes("5913FULANO DE TAL")).toBe(true)

    // Check city tag 60 (accent removed, uppercase, limited length)
    expect(payload.includes("6009SAO PAULO")).toBe(true)

    // Check TXID tag 62 (subtag 05)
    expect(payload.includes("62120508DUDIT123")).toBe(true)

    // Check CRC16 indicator tag 63
    expect(payload.includes("6304")).toBe(true)

    // Payload should end with the 4-digit CRC hex
    const payloadWithoutCrc = payload.substring(0, payload.length - 4)
    const crc = payload.substring(payload.length - 4)
    expect(crc).toHaveLength(4)
    expect(/^[0-9A-F]{4}$/.test(crc)).toBe(true)
  })

  it("should omit amount tag if amount is 0", () => {
    const payload = generateStaticPix(
      "test@email.com",
      0,
      "Loja Teste",
      "Rio de Janeiro",
      "DUDIT001",
      "email"
    )

    expect(payload.includes("54")).toBe(false)
  })

  it("should use *** as default txId if not specified or empty", () => {
    const payload = generateStaticPix(
      "test@email.com",
      10.00,
      "Loja Teste",
      "Rio de Janeiro",
      "",
      "email"
    )

    expect(payload.includes("62070503***")).toBe(true)
  })
})
