import { describe, it, expect } from "vitest"
import serverDOMPurify from "./dompurify-server"

const ALLOWED_TAGS = [
  "p", "br", "b", "strong", "i", "em", "u", "s", "strike",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "th", "td",
  "span", "div", "img", "a", "font", "blockquote", "code", "pre", "hr",
]

const ALLOWED_ATTR = [
  "style", "class", "className", "src", "alt", "width", "height",
  "href", "target", "rel", "color", "align", "title",
]

function sanitize(dirty: string): string {
  return serverDOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
  })
}

describe("Server DOMPurify (DOMPurify + linkedom)", () => {
  it("strips script tags and their payloads", () => {
    const clean = sanitize('<p>Normal text</p><script>alert("XSS")</script>')
    expect(clean).not.toContain("<script>")
    expect(clean).not.toContain("alert")
    expect(clean).toContain("<p>Normal text</p>")
  })

  it("strips inline event handlers", () => {
    const clean = sanitize('<img src="invalid.jpg" onerror="alert(1)" alt="test" />')
    expect(clean).not.toContain("onerror")
    expect(clean).not.toContain("alert")
    expect(clean).toContain('src="invalid.jpg"')
    expect(clean).toContain('alt="test"')
  })

  it("strips javascript: protocols", () => {
    const clean = sanitize('<a href="javascript:alert(1)">Clique aqui</a>')
    expect(clean).not.toContain("javascript:")
    expect(clean).toContain("Clique aqui")
  })

  it("strips dangerous embedded content", () => {
    const clean = sanitize('<iframe src="https://evil.com"></iframe><embed src="evil.swf">')
    expect(clean).not.toContain("<iframe")
    expect(clean).not.toContain("<embed")
  })

  it("keeps safe rich text tags and inline styling", () => {
    const clean = sanitize(
      '<h1>Titulo</h1><p style="color: #2563eb;">Texto <strong>negrito</strong> e <em>italico</em>.</p><ul><li>Item 1</li></ul>',
    )
    expect(clean).toContain("<h1>Titulo</h1>")
    expect(clean).toContain("<strong>negrito</strong>")
    expect(clean).toContain("<em>italico</em>")
    expect(clean).toContain("<ul><li>Item 1</li></ul>")
    expect(clean).toContain('style="color: #2563eb;"')
  })

  it("reports support with the linkedom window", () => {
    expect(serverDOMPurify.isSupported).toBe(true)
  })
})
