import { describe, it, expect } from "vitest"
import { sanitizeRichText } from "./rich-text-sanitizer"

describe("Rich Text Sanitizer (Stored XSS Protection)", () => {
  it("should strip <script> tags and payloads", () => {
    const malicious = '<p>Normal text</p><script>alert("XSS")</script>'
    const clean = sanitizeRichText(malicious)
    expect(clean).toBe("<p>Normal text</p>")
    expect(clean).not.toContain("<script>")
    expect(clean).not.toContain("alert")
  })

  it("should strip onerror and inline event handlers from <img> and other tags", () => {
    const malicious = '<img src="invalid.jpg" onerror="alert(1)" alt="test" />'
    const clean = sanitizeRichText(malicious)
    expect(clean).not.toContain("onerror")
    expect(clean).not.toContain("alert")
    expect(clean).toContain('src="invalid.jpg"')
    expect(clean).toContain('alt="test"')
  })

  it("should strip javascript: pseudoprotocol in href and src", () => {
    const malicious = '<a href="javascript:alert(1)">Clique aqui</a>'
    const clean = sanitizeRichText(malicious)
    expect(clean).not.toContain("javascript:")
    expect(clean).toContain("Clique aqui")
  })

  it("should strip iframe and dangerous tags", () => {
    const malicious = '<iframe src="https://evil.com"></iframe><embed src="evil.swf">'
    const clean = sanitizeRichText(malicious)
    expect(clean).not.toContain("<iframe")
    expect(clean).not.toContain("<embed")
  })

  it("should preserve safe rich text tags and styling", () => {
    const safeHtml = '<h1>Título</h1><p style="color: #2563eb;">Texto <strong>negrito</strong> e <em>itálico</em>.</p><ul><li>Item 1</li></ul>'
    const clean = sanitizeRichText(safeHtml)
    expect(clean).toContain("<h1>Título</h1>")
    expect(clean).toContain("<strong>negrito</strong>")
    expect(clean).toContain("<em>itálico</em>")
    expect(clean).toContain("<ul><li>Item 1</li></ul>")
  })

  it("should return empty string for null, undefined or empty input", () => {
    expect(sanitizeRichText(null)).toBe("")
    expect(sanitizeRichText(undefined)).toBe("")
    expect(sanitizeRichText("")).toBe("")
  })
})
