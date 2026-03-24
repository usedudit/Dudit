/**
 * Moderation types and interfaces
 * Central place for type definitions used across the moderation pipeline
 */

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ProcessedImage {
  /** RGBA pixel data as uint8 array */
  array: number[]
  /** Width of resized image (typically 256) */
  width: number
  /** Height of resized image (typically 256) */
  height: number
  /** MIME type (always "image/rgba") */
  mimeType: string
}

// ═══════════════════════════════════════════════════════════════════════════
// MODERATION PAYLOAD TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ModerationPayload {
  /** Texts to moderate (max 5, each ≤ 5000 chars) */
  texts: string[]
  /** Image arrays to moderate (max 2, each ≤ 500KB) */
  imageArrays: number[][]
}

// ═══════════════════════════════════════════════════════════════════════════
// MODERATION RESPONSE TYPES (from Edge API)
// ═══════════════════════════════════════════════════════════════════════════

export interface FlaggedText {
  /** The flagged text */
  text: string
  /** Safety categories violated (e.g., ["Violência", "Discurso de ódio"]) */
  categories: string[]
}

export interface FlaggedImage {
  /** Index of flagged image in request */
  index: number
  /** Category of violation (e.g., "Conteúdo sexual") */
  category: string
}

export interface ModerationResponse {
  /** Whether content passed moderation */
  passed: boolean
  /** Human-readable reason if rejected */
  reason?: string
  /** Flagged texts with categories */
  flaggedTexts?: FlaggedText[]
  /** Flagged images with categories */
  flaggedImages?: FlaggedImage[]
}

// ═══════════════════════════════════════════════════════════════════════════
// MODERATION RESULT TYPE (from moderateProductContent)
// ═══════════════════════════════════════════════════════════════════════════

export interface ModerationResult {
  /** Whether product content is valid to create/update */
  valid: boolean
  /** Error message if invalid (for displaying to user) */
  error?: string
  /** True if moderation could not run due to infra failure (Cloudflare down, timeout, etc) */
  infraFailure?: boolean
  /** Flagged texts (optional detail) */
  flaggedTexts?: FlaggedText[]
  /** Flagged images (optional detail) */
  flaggedImages?: FlaggedImage[]
}

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE PROCESSING TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ImageValidationResult {
  /** Whether image passed validation */
  valid: boolean
  /** Error message if invalid */
  error?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVER ACTION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateProductData {
  /** Product partner ID */
  partnerId: string
  /** Store ID */
  storeId: string
  /** Product name (moderated) */
  name: string
  /** Product description (moderated) */
  description?: string
  /** Original image URLs (for storage) */
  images?: string[]
  /** Processed images (from client, for moderation) */
  processedImages?: ProcessedImage[]
  /** Primary image index */
  primaryImageIndex?: number
  /** Product price */
  price: number
  /** Product SKU */
  sku?: string
  /** GTIN */
  gtin?: string
  /** Brand */
  brand?: string
  /** Category */
  category?: string
  /** Subcategory */
  subcategory?: string
  /** Condition */
  condition?: string
  /** Unit */
  unit?: string | null
  /** Product type */
  productType?: string
  /** Location */
  location?: string
  /** Cost price */
  costPrice?: number
  /** Promotional price */
  promotionalPrice?: number | null
  /** Minimum stock */
  minStock?: number
  /** Maximum stock */
  maxStock?: number
  /** Stock quantity */
  stockQuantity: number
  /** Is active */
  isActive?: boolean
  /** Is on promotion */
  isOnPromotion?: boolean
  /** Promotion type */
  promotionType?: string | null
  /** Promotion value */
  promotionValue?: number | null
  /** Show price in store */
  showPriceInStore?: boolean
  /** NCM */
  ncm?: string | null
  /** CEST */
  cest?: string | null
  /** Origin */
  origin?: number
  /** Item type */
  item_type?: string
  /** CFOP internal */
  cfop_internal?: string
  /** CFOP external */
  cfop_external?: string
  /** CSOSN */
  csosn?: string
  /** Tax percentage */
  tax_percentage?: number | null
  /** PIS CST */
  pis_cst?: string
  /** PIS rate */
  pis_rate?: number
  /** COFINS CST */
  cofins_cst?: string
  /** COFINS rate */
  cofins_rate?: number
  /** IPI CST */
  ipi_cst?: string
  /** IPI code */
  ipi_code?: string | null
  /** Product situation */
  product_situation?: string
  /** Código de benefício fiscal */
  c_benef?: string | null
  /** Informação adicional do produto */
  inf_ad_prod?: string | null
  /** Gross weight */
  weight_gross?: number
  /** Net weight */
  weight_net?: number
  /** Width */
  width?: number
  /** Height */
  height?: number
  /** Length */
  length?: number
  /** FCI code */
  fciCode?: string | null
  /** Packaging type */
  packagingType?: string | null
  /** Preparation days */
  preparationDays?: number | null
  /** Allow sell without stock */
  allow_sell_without_stock?: boolean
  /** Tags */
  tags?: string[]
  /** CSRF token */
  csrf_token?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION RESPONSE TYPE
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionResponse<T> {
  /** Whether action succeeded */
  success: boolean
  /** Data returned on success */
  data?: T
  /** Error message on failure */
  error?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface UseImageModerationResult {
  /** Process images from URLs and return ProcessedImage[] */
  processImages: (imageUrls: string[] | undefined) => Promise<ProcessedImage[]>
  /** Is currently processing images */
  isProcessing: boolean
  /** Error message if processing failed */
  error: string | null
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a successful action response
 */
export function createSuccessResponse<T>(data: T): ActionResponse<T> {
  return { success: true, data }
}

/**
 * Create an error action response
 */
export function createErrorResponse(error: string): ActionResponse<never> {
  return { success: false, error }
}

/**
 * Create a moderation result that passed
 */
export function createPassedModeration(): ModerationResult {
  return { valid: true }
}

/**
 * Create a moderation result that failed
 */
export function createFailedModeration(
  error: string,
  flaggedTexts?: FlaggedText[],
  flaggedImages?: FlaggedImage[]
): ModerationResult {
  return {
    valid: false,
    error,
    flaggedTexts,
    flaggedImages,
  }
}

/**
 * Type guard for ModerationResponse
 */
export function isModerationResponse(
  data: unknown
): data is ModerationResponse {
  if (!data || typeof data !== "object") return false
  const obj = data as Record<string, unknown>
  return typeof obj.passed === "boolean"
}

/**
 * Type guard for ProcessedImage
 */
export function isProcessedImage(data: unknown): data is ProcessedImage {
  if (!data || typeof data !== "object") return false
  const obj = data as Record<string, unknown>
  return (
    Array.isArray(obj.array) &&
    typeof obj.width === "number" &&
    typeof obj.height === "number" &&
    typeof obj.mimeType === "string"
  )
}
