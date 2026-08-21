/**
 * File validation utilities for security.
 * Production-grade: strict whitelisting, double extension block, magic byte validation,
 * path traversal protection, unicode/control char blocks, and plain text script safety scanning.
 */

import {
  ALL_ALLOWED_MIME_TYPES,
  ALL_ALLOWED_EXTENSIONS,
  DANGEROUS_EXTENSIONS,
  MAX_FILE_SIZE,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_VIDEO_EXTENSIONS,
  ALLOWED_DOCUMENT_EXTENSIONS,
  getUploadKindFromMimeType,
  getUploadValidationRules,
  UploadKind,
} from "@/lib/r2/config"

export interface FileValidationResult {
  valid: boolean
  error?: string
}

// ─── Magic Bytes Signatures ──────────────────────────────────────────────────

const MAGIC_BYTES: Record<string, number[][]> = {
  "image/jpeg": [
    [0xff, 0xd8, 0xff], // JPEG/JFIF
  ],
  "image/png": [
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
  ],
  "image/webp": [
    [0x52, 0x49, 0x46, 0x46], // RIFF (WebP container)
  ],
  // Documents
  "application/pdf": [
    [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  ],
  "application/msword": [
    [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // CFBF (.doc)
  ],
  "application/vnd.ms-excel": [
    [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // CFBF (.xls)
  ],
  "application/vnd.ms-powerpoint": [
    [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // CFBF (.ppt)
  ],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    [0x50, 0x4b, 0x03, 0x04], // ZIP (.docx)
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    [0x50, 0x4b, 0x03, 0x04], // ZIP (.xlsx)
  ],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    [0x50, 0x4b, 0x03, 0x04], // ZIP (.pptx)
  ],
  "application/vnd.oasis.opendocument.text": [
    [0x50, 0x4b, 0x03, 0x04], // ZIP (.odt)
  ],
}

/**
 * Helper to check if a file or filename is a GIF file.
 * GIF files are not allowed anywhere in the system.
 */
export function isGifFile(file: File | { type?: string; name?: string } | string | null | undefined): boolean {
  if (!file) return false
  if (typeof file === "string") {
    const lower = file.toLowerCase()
    return lower.endsWith(".gif") || lower.includes("image/gif")
  }
  const type = String(file.type || "").toLowerCase()
  const name = String(file.name || "").toLowerCase()
  return type === "image/gif" || /\.gif$/i.test(name)
}

/**
 * Validates file type by MIME type against strict whitelist.
 */
export function validateFileType(
  file: File,
  allowedTypes: readonly string[] = ALL_ALLOWED_MIME_TYPES
): FileValidationResult {
  if (isGifFile(file)) {
    return {
      valid: false,
      error: "Arquivos GIF não são permitidos no sistema.",
    }
  }
  if (!file.type || !allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Tipo de arquivo não permitido.`,
    }
  }
  return { valid: true }
}

/**
 * Validates file size with strict enforcement.
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
 * Validates file extension against whitelist AND dangerous blocklist.
 * Includes double extension protection check.
 */
export function validateFileExtension(
  fileName: string,
  allowedExtensions: readonly string[] = ALL_ALLOWED_EXTENSIONS
): FileValidationResult {
  const normalizedName = fileName.toLowerCase()
  const dotIndex = normalizedName.lastIndexOf(".")
  const extension = dotIndex >= 0 ? normalizedName.substring(dotIndex) : ""

  // 1. Check dangerous blocklist
  if (DANGEROUS_EXTENSIONS.includes(extension as any)) {
    return {
      valid: false,
      error: `Extensão de arquivo perigosa bloqueada: ${extension}`,
    }
  }

  // 2. Check allowlist
  if (!allowedExtensions.includes(extension)) {
    return {
      valid: false,
      error: `Extensão de arquivo não permitida.`,
    }
  }

  // 3. Double extension protection
  const parts = normalizedName.split(".")
  if (parts.length > 2) {
    const intermediateParts = parts.slice(1, -1)
    const allKnownExtensions = [
      ...DANGEROUS_EXTENSIONS,
      ...ALLOWED_IMAGE_EXTENSIONS,
      ...ALLOWED_VIDEO_EXTENSIONS,
      ...ALLOWED_DOCUMENT_EXTENSIONS,
    ]
    for (const part of intermediateParts) {
      const extWithDot = `.${part}`
      if (allKnownExtensions.includes(extWithDot as any)) {
        return {
          valid: false,
          error: `Nome de arquivo suspeito (possível dupla extensão): ${fileName}`,
        }
      }
    }
  }

  return { valid: true }
}

/**
 * Validates file name for path traversal attacks, null bytes, unicode spoofing, and control characters.
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
      error: "Nome de arquivo inválido (tentativa de path traversal)",
    }
  }

  // Prevent null bytes
  if (fileName.includes("\0")) {
    return {
      valid: false,
      error: "Nome de arquivo inválido (null byte)",
    }
  }

  // Prevent control characters (0x00-0x1F, 0x7F) and unicode RTLO / spoof characters
  if (/[\x00-\x1f\x7f\u202e\u202b\u200b]/.test(fileName)) {
    return {
      valid: false,
      error: "Nome de arquivo contém caracteres unicode ou de controle inválidos",
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
 * Validates file magic bytes (file signature) to prevent Content-Type spoofing.
 */
export function validateMagicBytes(
  buffer: Buffer | Uint8Array,
  declaredMimeType: string
): FileValidationResult {
  if (buffer.length === 0) {
    return { valid: false, error: "Arquivo vazio" }
  }

  // 1. Block known executable signatures globally (MZ, ELF, Java CAFEBABE)
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { valid: false, error: "Arquivo executável bloqueado (MZ signature)" }
  }
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return { valid: false, error: "Arquivo executável bloqueado (ELF signature)" }
  }
  if (buffer.length >= 4 && buffer[0] === 0xca && buffer[1] === 0xfe && buffer[2] === 0xba && buffer[3] === 0xbe) {
    return { valid: false, error: "Arquivo classe Java bloqueado (CAFEBABE signature)" }
  }

  // 2. Plain Text & CSV Validation: Scan contents to reject HTML, XML, SVG, JS scripts
  if (declaredMimeType === "text/plain" || declaredMimeType === "text/csv") {
    try {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer)
      const lowerText = text.toLowerCase()
      const maliciousPatterns = [
        "<script",
        "javascript:",
        "<html",
        "<svg",
        "<?xml",
        "onload=",
        "onerror=",
        "<body",
        "<iframe>",
      ]
      for (const pattern of maliciousPatterns) {
        if (lowerText.includes(pattern)) {
          return {
            valid: false,
            error: `Conteúdo de texto suspeito ou malicioso detectado (${pattern})`,
          }
        }
      }
      return { valid: true }
    } catch {
      return {
        valid: false,
        error: "Falha ao decodificar conteúdo de texto",
      }
    }
  }

  // 2.1 XML Validation: Scan contents to reject scripts and dangerous HTML tags
  if (declaredMimeType === "application/xml" || declaredMimeType === "text/xml") {
    try {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer)
      const lowerText = text.toLowerCase()
      const maliciousPatterns = [
        "<script",
        "javascript:",
        "<html",
        "onload=",
        "onerror=",
        "<iframe>",
      ]
      for (const pattern of maliciousPatterns) {
        if (lowerText.includes(pattern)) {
          return {
            valid: false,
            error: `Conteúdo XML suspeito ou malicioso detectado (${pattern})`,
          }
        }
      }
      return { valid: true }
    } catch {
      return {
        valid: false,
        error: "Falha ao decodificar conteúdo XML",
      }
    }
  }

  // 3. AVIF check: bytes 4-7 should be "ftyp"
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

  // 4. MP4 / MOV checks: bytes 4-7 should be "ftyp"
  if (declaredMimeType === "video/mp4" || declaredMimeType === "video/quicktime") {
    if (buffer.length >= 8) {
      const ftyp = String.fromCharCode(buffer[4], buffer[5], buffer[6], buffer[7])
      if (ftyp === "ftyp") {
        return { valid: true }
      }
    }
    return {
      valid: false,
      error: "Arquivo não é um vídeo MP4/MOV válido",
    }
  }

  // 5. WebM check: starts with [0x1a, 0x45, 0xdf, 0xa3] (EBML header)
  if (declaredMimeType === "video/webm") {
    if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      return { valid: true }
    }
    return {
      valid: false,
      error: "Arquivo não é um vídeo WebM válido",
    }
  }

  // 6. Look up static signature lists
  const signatures = MAGIC_BYTES[declaredMimeType]
  if (!signatures || signatures.length === 0) {
    return {
      valid: false,
      error: `Validação de assinatura não configurada para o tipo: ${declaredMimeType}`,
    }
  }

  const isValid = signatures.some((sig) => {
    if (buffer.length < sig.length) return false
    return sig.every((byte, i) => buffer[i] === byte)
  })

  if (!isValid) {
    return {
      valid: false,
      error: `Conteúdo do arquivo não corresponde ao tipo declarado (${declaredMimeType}).`,
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

// ─── Unified Request Validation ──────────────────────────────────────────────

export interface ValidatedUploadRequest {
  kind: UploadKind
  rules: ReturnType<typeof getUploadValidationRules>
  extension: string
  canonicalMime: string
}

/**
 * Single entrypoint to validate upload request parameters.
 */
export function validateUploadRequest(
  filename: string,
  contentType: string,
  fileSize?: number
): { success: true; data: ValidatedUploadRequest } | { success: false; error: string } {
  // 0. GIF Check
  if (isGifFile(filename) || isGifFile(contentType)) {
    return { success: false, error: "Arquivos GIF não são permitidos no sistema." }
  }

  // 1. Filename validation
  const nameVal = validateFileName(filename)
  if (!nameVal.valid) {
    return { success: false, error: nameVal.error || "Nome de arquivo inválido" }
  }

  // 2. Check supported kind
  const kind = getUploadKindFromMimeType(contentType)
  if (!kind) {
    return { success: false, error: "Tipo de arquivo não permitido." }
  }

  const rules = getUploadValidationRules(kind)

  // 3. Extension validations (incorporates double-extension checking)
  const extVal = validateFileExtension(filename, rules.allowedExtensions)
  if (!extVal.valid) {
    return { success: false, error: extVal.error || "Extensão não permitida" }
  }

  // 4. Cross validate Extension with MIME
  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."))
  const expectedExt = rules.mimeToExt[contentType]
  if (expectedExt) {
    const normalizedExt = ext === ".jpeg" ? ".jpg" : ext
    if (normalizedExt !== `.${expectedExt}`) {
      return { success: false, error: `Extensão ${ext} não corresponde ao tipo ${contentType}` }
    }
  }

  // 5. Size validation
  if (fileSize && typeof fileSize === "number") {
    if (fileSize > rules.maxSize) {
      const maxMB = (rules.maxSize / (1024 * 1024)).toFixed(0)
      return { success: false, error: `Arquivo muito grande. Máximo: ${maxMB}MB` }
    }
    if (fileSize <= 0) {
      return { success: false, error: "Arquivo vazio não é permitido" }
    }
  }

  return {
    success: true,
    data: {
      kind,
      rules,
      extension: ext,
      canonicalMime: contentType,
    },
  }
}

// ─── Future Malware Scanning Prep Hook ──────────────────────────────────────────

/**
 * Placeholder interface for future asynchronous/synchronous malware scanning.
 * This can be connected to ClamAV, a scanner microservice, or R2 Object Scanning
 * without changing the rest of the application's code.
 */
export async function scanFileForMalware(
  key: string,
  buffer?: Buffer | Uint8Array
): Promise<{ clean: boolean; error?: string }> {
  // FUTURE INTEGRATION POINT:
  // e.g. Call ClamAV REST api or execute local clamscan process:
  // const scannerResult = await clamav.scanBuffer(buffer)
  // if (!scannerResult.clean) return { clean: false, error: "Ameaça ou vírus de computador detectado." }
  return { clean: true }
}

// ─── Legacy Wrappers ─────────────────────────────────────────────────────────

export function validateFile(
  file: File,
  options?: {
    allowedTypes?: readonly string[]
    maxSize?: number
    allowedExtensions?: readonly string[]
  }
): FileValidationResult {
  const nameVal = validateFileName(file.name)
  if (!nameVal.valid) return nameVal

  const typeVal = validateFileType(file, options?.allowedTypes)
  if (!typeVal.valid) return typeVal

  const extVal = validateFileExtension(file.name, options?.allowedExtensions)
  if (!extVal.valid) return extVal

  const sizeVal = validateFileSize(file, options?.maxSize)
  if (!sizeVal.valid) return sizeVal

  return { valid: true }
}

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

  if (!/^data:image\/(jpeg|jpg|png|webp|avif);base64,/.test(base64Data)) {
    return {
      valid: false,
      error: "Formato de imagem não suportado. Permitidos: JPEG, PNG, WebP, AVIF",
    }
  }

  const sizeInMB = (base64Data.length * 0.75) / (1024 * 1024)
  if (sizeInMB > maxSizeMB) {
    return {
      valid: false,
      error: `Imagem muito grande (${sizeInMB.toFixed(2)}MB). Tamanho máximo: ${maxSizeMB}MB`,
    }
  }

  return { valid: true }
}
