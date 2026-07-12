// ─── Upload Kind Definition ─────────────────────────────────────────────────

export type UploadKind = "image" | "video" | "document"

// ─── Allowed File Types (strict allowlists) ──────────────────────────────────

/** Only allow safe, non-executable image formats */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const

/** Backward-compatible alias */
export const ALLOWED_MIME_TYPES = ALLOWED_IMAGE_MIME_TYPES

export const ALLOWED_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
] as const

/** Backward-compatible alias */
export const ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const

export const ALLOWED_VIDEO_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".mov",
] as const

/** Document types strict whitelist */
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "text/csv",
  "text/plain",
  "application/vnd.oasis.opendocument.text", // .odt
  "application/vnd.ms-powerpoint", // .ppt
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
] as const

export const ALLOWED_DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".odt",
  ".ppt",
  ".pptx",
] as const

/** Combined lists for all supported uploads */
export const ALL_ALLOWED_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_VIDEO_MIME_TYPES,
  ...ALLOWED_DOCUMENT_MIME_TYPES,
] as const

export const ALL_ALLOWED_EXTENSIONS = [
  ...ALLOWED_IMAGE_EXTENSIONS,
  ...ALLOWED_VIDEO_EXTENSIONS,
  ...ALLOWED_DOCUMENT_EXTENSIONS,
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

/** Maximum file size: 5MB for images */
export const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024
export const MAX_FILE_SIZE = MAX_IMAGE_FILE_SIZE // legacy fallback

/** Maximum video size after client-side compression: 100MB */
export const MAX_VIDEO_FILE_SIZE = 100 * 1024 * 1024

/** Maximum document size: 10MB */
export const MAX_DOCUMENT_FILE_SIZE = 10 * 1024 * 1024

export const MIN_VIDEO_DURATION_SECONDS = 10
export const MAX_VIDEO_DURATION_SECONDS = 60

// ─── Presigned URL Expiry ───────────────────────────────────────────────────

/** Default presigned URL expiry: 60 seconds */
export const DEFAULT_PRESIGNED_URL_EXPIRY = 60

/** Maximum presigned URL expiry: 120 seconds (hard cap) */
export const MAX_PRESIGNED_URL_EXPIRY = 120

// ─── MIME ↔ Extension Mapping ───────────────────────────────────────────────

export const IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
}
export const MIME_TO_EXT = IMAGE_MIME_TO_EXT // legacy fallback

export const VIDEO_MIME_TO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
}

export const DOCUMENT_MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "text/plain": "txt",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
}

export const ALL_MIME_TO_EXT: Record<string, string> = {
  ...IMAGE_MIME_TO_EXT,
  ...VIDEO_MIME_TO_EXT,
  ...DOCUMENT_MIME_TO_EXT,
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
  
  // Specific private document structures
  erpAttachments: "erp/attachments/",
  erpContracts: "erp/contracts/",
  erpInvoices: "erp/invoices/",
  customerDocuments: "customers/documents/",
  orderAttachments: "orders/attachments/",
  serviceOrderAttachments: "service-orders/attachments/",
  serviceOrderSignatures: "service-orders/signatures/",
  serviceOrderPdfs: "service-orders/pdfs/",
  
  communityVideos: "community-videos/",
} as const

// ─── Privacy Rules ──────────────────────────────────────────────────────────

/**
 * List of prefixes that are strictly private.
 * Files in these directories must never be accessed via direct public links.
 */
export const PRIVATE_PREFIXES = [
  "erp/attachments/",
  "erp/contracts/",
  "erp/invoices/",
  "customers/documents/",
  "orders/attachments/",
  "service-orders/attachments/",
  "service-orders/signatures/",
  "service-orders/pdfs/",
  "temp/",
] as const

/**
 * Helper to determine if a key or path belongs to a private folder.
 */
export function isKeyPrivate(key: string): boolean {
  return PRIVATE_PREFIXES.some(prefix => key.includes(prefix))
}

// ─── Unified Dynamic Rules Helpers ──────────────────────────────────────────

export function getUploadKindFromMimeType(mimeType: string): UploadKind | null {
  const normalized = mimeType.trim().toLowerCase()
  if (ALLOWED_IMAGE_MIME_TYPES.includes(normalized as any)) return "image"
  if (ALLOWED_VIDEO_MIME_TYPES.includes(normalized as any)) return "video"
  if (ALLOWED_DOCUMENT_MIME_TYPES.includes(normalized as any)) return "document"
  return null
}

export interface ValidationRules {
  allowedMimeTypes: readonly string[]
  allowedExtensions: readonly string[]
  mimeToExt: Record<string, string>
  maxSize: number
}

export function getUploadValidationRules(kind: UploadKind): ValidationRules {
  switch (kind) {
    case "image":
      return {
        allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
        allowedExtensions: ALLOWED_IMAGE_EXTENSIONS,
        mimeToExt: IMAGE_MIME_TO_EXT,
        maxSize: MAX_IMAGE_FILE_SIZE,
      }
    case "video":
      return {
        allowedMimeTypes: ALLOWED_VIDEO_MIME_TYPES,
        allowedExtensions: ALLOWED_VIDEO_EXTENSIONS,
        mimeToExt: VIDEO_MIME_TO_EXT,
        maxSize: MAX_VIDEO_FILE_SIZE,
      }
    case "document":
      return {
        allowedMimeTypes: ALLOWED_DOCUMENT_MIME_TYPES,
        allowedExtensions: ALLOWED_DOCUMENT_EXTENSIONS,
        mimeToExt: DOCUMENT_MIME_TO_EXT,
        maxSize: MAX_DOCUMENT_FILE_SIZE,
      }
  }
}
