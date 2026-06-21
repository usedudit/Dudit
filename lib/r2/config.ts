// ─── Allowed File Types (strict allowlist) ──────────────────────────────────

/** Only allow safe, non-executable image formats */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const

export const ALLOWED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
] as const

export const ALLOWED_VIDEO_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".mov",
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

/** Maximum video size after client-side compression */
export const MAX_VIDEO_FILE_SIZE = 25 * 1024 * 1024

export const MIN_VIDEO_DURATION_SECONDS = 10
export const MAX_VIDEO_DURATION_SECONDS = 60

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

export const VIDEO_MIME_TO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
}

// ─── R2 Prefixes ────────────────────────────────────────────────────────────

export const R2_PREFIXES = {
  products: "products/",
  services: "services/",
  partners: "partners/",
  customers: "customers/",
  orders: "orders/",
  temp: "temp/",
  serviceOrders: "service-orders/",
  serviceOrderSignatures: "service-orders/signatures/",
  serviceOrderAttachments: "service-orders/attachments/",
  serviceOrderPdfs: "service-orders/pdfs/",
} as const
