/**
 * File validation utilities for security
 * Production-grade: strict allowlist, dangerous extension blocklist, magic byte validation
 */

import {
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  DANGEROUS_EXTENSIONS,
  MAX_FILE_SIZE,
} from "@/lib/r2/config"

export interface FileValidationResult {
  valid: boolean
  error?: string
}

// ─── Magic Bytes for Image Format Verification ──────────────────────────────

const IMAGE_MAGIC_BYTES: Record<string, number[][]> = {
  "image/jpeg": [
    [0xff, 0xd8, 0xff], // JPEG/JFIF
  ],
  "image/png": [
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
  ],
  "image/webp": [
    [0x52, 0x49, 0x46, 0x46], // RIFF (WebP container)
  ],
  "image/avif": [
    // AVIF uses ISOBMFF — magic at offset 4: "ftyp"
    // We check bytes 4-7 for "ftyp" (0x66, 0x74, 0x79, 0x70)
  ],
}

/**
 * Validates file type by MIME type against strict allowlist
 */
export function validateFileType(
  file: File,
  allowedTypes: readonly string[] = ALLOWED_MIME_TYPES
): FileValidationResult {
  if (!file.type || !allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Tipo de arquivo não permitido. Tipos permitidos: ${allowedTypes.join(", ")}`,
    }
  }
  return { valid: true }
}

/**
 * Validates file size with strict enforcement
 */
export function validateFileSize(
  file: File,
  maxSize: number = MAX_FILE_SIZE
): FileValidationResult {
  if (file.size > maxSize) {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(2)
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2)
    return {
      valid: false,
      error: `Arquivo muito grande (${fileSizeMB}MB). Tamanho máximo: ${maxSizeMB}MB`,
    }
  }
  if (file.size === 0) {
    return {
      valid: false,
      error: "Arquivo vazio não é permitido",
    }
  }
  return { valid: true }
}

/**
 * Validates file extension against allowlist AND dangerous blocklist
 */
export function validateFileExtension(
  fileName: string,
  allowedExtensions: readonly string[] = ALLOWED_EXTENSIONS
): FileValidationResult {
  const extension = fileName.toLowerCase().substring(fileName.lastIndexOf("."))

  // First: check dangerous blocklist
  if (DANGEROUS_EXTENSIONS.includes(extension as any)) {
    return {
      valid: false,
      error: `Extensão de arquivo perigosa bloqueada: ${extension}`,
    }
  }

  // Then: check allowlist
  if (!allowedExtensions.includes(extension)) {
    return {
      valid: false,
      error: `Extensão de arquivo não permitida. Extensões permitidas: ${allowedExtensions.join(", ")}`,
    }
  }
  return { valid: true }
}

/**
 * Validates file name for path traversal attacks, null bytes, and control characters
 */
export function validateFileName(fileName: string): FileValidationResult {
  // Prevent path traversal
  if (
    fileName.includes("..") ||
    fileName.includes("/") ||
    fileName.includes("\\")
  ) {
    return {
      valid: false,
      error: "Nome de arquivo inválido",
    }
  }

  // Prevent null bytes
  if (fileName.includes("\0")) {
    return {
      valid: false,
      error: "Nome de arquivo inválido",
    }
  }

  // Prevent control characters (0x00-0x1F, 0x7F)
  if (/[\x00-\x1f\x7f]/.test(fileName)) {
    return {
      valid: false,
      error: "Nome de arquivo contém caracteres inválidos",
    }
  }

  // Limit filename length
  if (fileName.length > 255) {
    return {
      valid: false,
      error: "Nome de arquivo muito longo",
    }
  }

  return { valid: true }
}

/**
 * Validates image magic bytes (file signature) to prevent MIME spoofing.
 * Call this with the first few bytes of the file buffer.
 */
export function validateMagicBytes(
  buffer: Buffer | Uint8Array,
  declaredMimeType: string
): FileValidationResult {
  // AVIF check: bytes 4-7 should be "ftyp"
  if (declaredMimeType === "image/avif") {
    if (buffer.length >= 8) {
      const ftyp = String.fromCharCode(buffer[4], buffer[5], buffer[6], buffer[7])
      if (ftyp === "ftyp") {
        return { valid: true }
      }
    }
    return {
      valid: false,
      error: "Arquivo não é uma imagem AVIF válida",
    }
  }

  const signatures = IMAGE_MAGIC_BYTES[declaredMimeType]
  if (!signatures || signatures.length === 0) {
    return {
      valid: false,
      error: `Tipo MIME não suportado para validação: ${declaredMimeType}`,
    }
  }

  const isValid = signatures.some((sig) => {
    if (buffer.length < sig.length) return false
    return sig.every((byte, i) => buffer[i] === byte)
  })

  if (!isValid) {
    return {
      valid: false,
      error: `Conteúdo do arquivo não corresponde ao tipo declarado (${declaredMimeType}). Possível arquivo malicioso.`,
    }
  }

  // WebP extra check: bytes 8-11 should be "WEBP"
  if (declaredMimeType === "image/webp" && buffer.length >= 12) {
    const webpMarker = String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11])
    if (webpMarker !== "WEBP") {
      return {
        valid: false,
        error: "Arquivo não é uma imagem WebP válida",
      }
    }
  }

  return { valid: true }
}

/**
 * Comprehensive file validation (all checks combined)
 */
export function validateFile(
  file: File,
  options?: {
    allowedTypes?: readonly string[]
    maxSize?: number
    allowedExtensions?: readonly string[]
  }
): FileValidationResult {
  // Validate file name
  const nameValidation = validateFileName(file.name)
  if (!nameValidation.valid) {
    return nameValidation
  }

  // Validate file type
  const typeValidation = validateFileType(file, options?.allowedTypes)
  if (!typeValidation.valid) {
    return typeValidation
  }

  // Validate file extension (allowlist + dangerous blocklist)
  const extensionValidation = validateFileExtension(
    file.name,
    options?.allowedExtensions
  )
  if (!extensionValidation.valid) {
    return extensionValidation
  }

  // Validate file size
  const sizeValidation = validateFileSize(file, options?.maxSize)
  if (!sizeValidation.valid) {
    return sizeValidation
  }

  return { valid: true }
}

/**
 * Validates base64 image data
 */
export function validateBase64Image(
  base64Data: string,
  maxSizeMB: number = 5
): FileValidationResult {
  if (!base64Data || typeof base64Data !== "string") {
    return {
      valid: false,
      error: "Dados de imagem inválidos",
    }
  }

  // Check if it's a valid base64 string with allowed MIME types only
  if (!/^data:image\/(jpeg|jpg|png|webp|avif);base64,/.test(base64Data)) {
    return {
      valid: false,
      error: "Formato de imagem não suportado. Permitidos: JPEG, PNG, WebP, AVIF",
    }
  }

  // Calculate size (base64 is ~1.37x larger than binary)
  const sizeInMB = (base64Data.length * 0.75) / (1024 * 1024)
  if (sizeInMB > maxSizeMB) {
    return {
      valid: false,
      error: `Imagem muito grande (${sizeInMB.toFixed(2)}MB). Tamanho máximo: ${maxSizeMB}MB`,
    }
  }

  return { valid: true }
}
