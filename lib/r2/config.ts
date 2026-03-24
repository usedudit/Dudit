// ─── Allowed File Types (strict allowlist) ──────────────────────────────────

/** Only allow safe, non-executable image formats */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const

export const ALLOWED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
] as const

/** Extensions that MUST be rejected regardless of MIME type */
export const DANGEROUS_EXTENSIONS = [
  ".exe", ".dll", ".bat", ".cmd", ".sh", ".ps1", ".msi",
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".html", ".htm", ".xhtml", ".svg",
  ".php", ".py", ".rb", ".pl", ".cgi",
  ".jar", ".class", ".war",
  ".asp", ".aspx", ".jsp",
  ".com", ".scr", ".pif", ".vbs", ".vbe", ".wsf", ".wsh",
] as const

// ─── File Size Limits ───────────────────────────────────────────────────────

/** Maximum file size: 5MB (production safe default for images) */
export const MAX_FILE_SIZE = 5 * 1024 * 1024

// ─── Presigned URL Expiry ───────────────────────────────────────────────────

/** Default presigned URL expiry: 60 seconds */
export const DEFAULT_PRESIGNED_URL_EXPIRY = 60

/** Maximum presigned URL expiry: 120 seconds (hard cap) */
export const MAX_PRESIGNED_URL_EXPIRY = 120

// ─── MIME ↔ Extension Mapping ───────────────────────────────────────────────

export const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
}

// ─── R2 Prefixes ────────────────────────────────────────────────────────────

export const R2_PREFIXES = {
  products: "products/",
  partners: "partners/",
  customers: "customers/",
  orders: "orders/",
  temp: "temp/",
} as const
