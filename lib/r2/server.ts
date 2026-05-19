import "server-only"

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { getR2ServerConfig, getR2PublicUrl } from "./r2-server-config"
import {
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  DANGEROUS_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_PRESIGNED_URL_EXPIRY,
  DEFAULT_PRESIGNED_URL_EXPIRY,
  MIME_TO_EXT,
  R2_PREFIXES,
} from "./config"

export interface SignedUrlResponse {
  uploadUrl: string
  publicUrl: string
  key: string
  /** Exact Content-Type included in the AWS SigV4 signature — client PUT must use this value. */
  contentType: string
}

export interface UploadConfig {
  fileName: string
  fileType: string
  /** User ID from requireUser() - REQUIRED for multi-tenant isolation */
  userId: string
  prefix?: string
  key?: string
  expiresIn?: number
  allowedMimeTypes?: readonly string[]
  allowedExtensions?: readonly string[]
  mimeToExt?: Record<string, string>
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function createR2Client(): S3Client {
  const serverConfig = getR2ServerConfig()

  if (!serverConfig.accessKeyId || !serverConfig.secretAccessKey) {
    throw new Error(
      "Credenciais do R2 não configuradas. Verifique as variáveis de ambiente: CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY"
    )
  }

  return new S3Client({
    region: "auto",
    credentials: {
      accessKeyId: serverConfig.accessKeyId,
      secretAccessKey: serverConfig.secretAccessKey,
    },
    endpoint: `https://${serverConfig.accountId}.r2.cloudflarestorage.com`,
  })
}

/**
 * Sanitize filename: strip path components, null bytes, control chars.
 * Returns only the basename with safe characters.
 */
function sanitizeFileName(name: string): string {
  // Remove path separators, null bytes, control characters
  return name
    .replace(/[\\/]/g, "")
    .replace(/\.\./g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[<>:"|?*]/g, "")
    .trim()
}

/**
 * Validate file extension against allowlist and dangerous blocklist.
 * Returns the safe extension (without dot) or throws.
 */
function validateAndGetExtension(
  fileName: string,
  mimeType: string,
  allowedExtensions: readonly string[] = ALLOWED_EXTENSIONS,
  mimeToExt: Record<string, string> = MIME_TO_EXT
): string {
  const sanitized = sanitizeFileName(fileName)
  const dotIndex = sanitized.lastIndexOf(".")
  const extension = dotIndex >= 0 ? sanitized.substring(dotIndex).toLowerCase() : ""

  // Block dangerous extensions
  if (DANGEROUS_EXTENSIONS.includes(extension as any)) {
    throw new Error(`Extensão de arquivo bloqueada: ${extension}`)
  }

  // Verify extension is in allowlist
  if (!allowedExtensions.includes(extension)) {
    throw new Error(
      `Extensão não permitida: ${extension}. Permitidas: ${allowedExtensions.join(", ")}`
    )
  }

  // Cross-validate: extension must match MIME type
  const expectedExt = mimeToExt[mimeType]
  if (!expectedExt) {
    throw new Error(`Tipo MIME não permitido: ${mimeType}`)
  }

  // Allow jpg/jpeg interchangeability
  const normalizedExt = extension === ".jpeg" ? ".jpg" : extension
  const normalizedExpected = `.${expectedExt}`
  if (normalizedExt !== normalizedExpected && !(normalizedExt === ".jpg" && normalizedExpected === ".jpg")) {
    throw new Error(
      `Extensão ${extension} não corresponde ao tipo MIME ${mimeType}`
    )
  }

  return expectedExt
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function generateSignedUploadUrl(
  config: UploadConfig
): Promise<SignedUrlResponse> {
  const {
    fileName,
    fileType,
    userId,
    prefix = R2_PREFIXES.products,
    key: requestedKey,
    expiresIn: requestedExpiry,
    allowedMimeTypes = ALLOWED_MIME_TYPES,
    allowedExtensions = ALLOWED_EXTENSIONS,
    mimeToExt = MIME_TO_EXT,
  } = config

  // 1. Validate user ID (multi-tenant isolation)
  if (!userId || typeof userId !== "string") {
    throw new Error("userId é obrigatório para upload")
  }

  // 2. Validate MIME type against strict allowlist
  if (!allowedMimeTypes.includes(fileType)) {
    throw new Error("Tipo de arquivo não permitido")
  }

  if (fileType === "text/html" || fileType === "image/svg+xml" || fileType === "application/javascript") {
    throw new Error("Formato de arquivo inseguro rejeitado")
  }

  // 3. Validate and get safe extension (cross-validates MIME ↔ extension)
  const safeExt = validateAndGetExtension(fileName, fileType, allowedExtensions, mimeToExt)

  // 4. Cap expiry to maximum allowed
  const expiresIn = Math.min(
    requestedExpiry ?? DEFAULT_PRESIGNED_URL_EXPIRY,
    MAX_PRESIGNED_URL_EXPIRY
  )

  // 5. Generate user-scoped key. Routes may pass a deterministic key after validating ownership.
  const key = requestedKey || `users/${userId}/${prefix}${Date.now()}-${crypto.randomUUID()}.${safeExt}`
  if (!validateKeyOwnership(key, userId) || key.includes("..") || key.startsWith("/")) {
    throw new Error("Chave de upload inválida")
  }

  const serverConfig = getR2ServerConfig()
  const client = createR2Client()

  try {
    const command = new PutObjectCommand({
      Bucket: serverConfig.bucketName,
      Key: key,
      ContentType: fileType,
      // No ACL - R2 access is controlled via bucket settings and presigned URLs
    })

    const uploadUrl = await getSignedUrl(client, command, { expiresIn })

    const baseUrl = getR2PublicUrl().replace(/\/+$/, "")
    return {
      uploadUrl,
      publicUrl: `${baseUrl}/${key}`,
      key,
      contentType: fileType,
    }
  } finally {
    client.destroy()
  }
}

export async function deleteFileFromR2(key: string) {
  // Validate key is not empty and doesn't contain traversal
  if (!key || key.includes("..") || key.startsWith("/")) {
    throw new Error("Chave de arquivo inválida")
  }

  const serverConfig = getR2ServerConfig()
  const client = createR2Client()
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: serverConfig.bucketName,
        Key: key,
      })
    )
  } finally {
    client.destroy()
  }
}

export async function getFileMetadataFromR2(key: string) {
  if (!key || key.includes("..") || key.startsWith("/")) {
    throw new Error("Chave de arquivo invÃ¡lida")
  }

  const serverConfig = getR2ServerConfig()
  const client = createR2Client()
  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: serverConfig.bucketName,
        Key: key,
      })
    )
    return {
      contentType: result.ContentType || null,
      contentLength: result.ContentLength || 0,
    }
  } finally {
    client.destroy()
  }
}

/**
 * Validate that a key belongs to a specific user.
 * Multi-tenant isolation: users can only access their own files.
 */
export function validateKeyOwnership(key: string, userId: string): boolean {
  return key.startsWith(`users/${userId}/`)
}

export function extractKeyFromR2Url(publicUrl: string): string {
  try {
    const urlObj = new URL(publicUrl)
    return urlObj.pathname.replace(/^\/+/, "")
  } catch {
    throw new Error("URL inválida")
  }
}
