import DOMPurify from "isomorphic-dompurify"

/**
 * Whitelist of safe HTML tags and attributes for rendering rich text descriptions.
 * Prevents Stored XSS while allowing valid formatting from the rich text editor (TipTap/Quill/custom).
 */
const ALLOWED_TAGS = [
  "p", "br", "b", "strong", "i", "em", "u", "s", "strike",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "th", "td",
  "span", "div", "img", "a", "font", "blockquote", "code", "pre", "hr"
]

const ALLOWED_ATTR = [
  "style", "class", "className", "src", "alt", "width", "height",
  "href", "target", "rel", "color", "align", "title"
]

/**
 * Sanitizes an untrusted HTML string for safe use in `dangerouslySetInnerHTML`.
 * Strips `<script>`, `<iframe>`, `javascript:` URLs, event handlers (`onload`, `onerror`), etc.
 */
export function sanitizeRichText(dirtyHtml?: string | null): string {
  if (!dirtyHtml || typeof dirtyHtml !== "string") return ""

  return DOMPurify.sanitize(dirtyHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
  })
}
