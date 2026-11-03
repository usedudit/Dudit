import "server-only"

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { getR2ServerConfig, getR2PublicUrl, getR2BucketNameForKey } from "./r2-server-config"
import { isKeyPrivate } from "./config"
import {
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  DANGEROUS_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_PRESIGNED_URL_EXPIRY,
  DEFAULT_PRESIGNED_URL_EXPIRY,
  MIME_TO_EXT,
  ALL_MIME_TO_EXT,
  R2_PREFIXES,
  UploadKind,
  getUploadValidationRules,
} from "./config"

export interface SignedUrlResponse {
  uploadUrl: string
  publicUrl: string | null
  key: string
  /** Exact Content-Type included in the AWS SigV4 signature - client PUT must use this value. */
  contentType: string
}

export interface UploadConfig {
  fileName: string
  fileType: string
  /** Exact expected size, signed into PUT requests when supplied. */
  contentLength?: number
  /** User ID from requireUser() - REQUIRED for multi-tenant isolation */
  userId: string
  prefix?: string
  key?: string
  expiresIn?: number
  kind?: UploadKind
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
 * Sanitize filename: strip path components, null bytes, control chars, RTL.
 * Returns only the basename with safe characters.
 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/]/g, "")
    .replace(/\.\./g, "")
    .replace(/[\x00-\x1f\x7f\u202e\u202b\u200b]/g, "")
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
  mimeToExt: Record<string, string> = ALL_MIME_TO_EXT
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
  // Resolve validation rules dynamically based on kind or fallbacks
  const resolvedKind = config.kind || "image"
  const defaultRules = getUploadValidationRules(resolvedKind)

  const {
    fileName,
    fileType,
    userId,
    contentLength,
    prefix = R2_PREFIXES.products,
    key: requestedKey,
    expiresIn: requestedExpiry,
    allowedMimeTypes = config.allowedMimeTypes || defaultRules.allowedMimeTypes,
    allowedExtensions = config.allowedExtensions || defaultRules.allowedExtensions,
    mimeToExt = config.mimeToExt || defaultRules.mimeToExt,
  } = config

  // 1. Validate user ID (multi-tenant isolation)
  if (!userId || typeof userId !== "string") {
    throw new Error("userId é obrigatório para upload")
  }

  // 2. Validate MIME type against strict allowlist
  if (!allowedMimeTypes.includes(fileType)) {
    throw new Error("Tipo de arquivo não permitido")
  }
  if (
    contentLength !== undefined &&
    (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > defaultRules.maxSize)
  ) {
    throw new Error("Tamanho de arquivo inválido")
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

  const bucketName = getR2BucketNameForKey(key)
  const client = createR2Client()

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: fileType,
      ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
      // No ACL - R2 access is controlled via bucket settings and presigned URLs
    })

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn,
      signableHeaders: new Set([
        "content-type",
        ...(contentLength !== undefined ? ["content-length"] : []),
      ]),
    })

    return {
      uploadUrl,
      publicUrl: isKeyPrivate(key) ? null : `${getR2PublicUrl().replace(/\/+$/, "")}/${key}`,
      key,
      contentType: fileType,
    }
  } finally {
    client.destroy()
  }
}

/**
 * Generates temporary signed download URL for private files/documents.
 */
export async function generateSignedDownloadUrl(
  key: string,
  expiresIn = 900 // 15 minutes short expiry for security
): Promise<string> {
  // Validate key is not empty and doesn't contain traversal
  if (!key || key.includes("..") || key.startsWith("/")) {
    throw new Error("Chave de arquivo inválida")
  }

  const bucketName = getR2BucketNameForKey(key)
  const client = createR2Client()
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
    return await getSignedUrl(client, command, { expiresIn })
  } finally {
    client.destroy()
  }
}

/** Verifies the stored object metadata and computes its SHA-256 without buffering the whole file. */
export async function verifyUploadedObject(
  key: string,
  expectedSize: number,
  expectedContentType: string,
  expectedSha256?: string,
): Promise<{ contentLength: number; sha256: string }> {
  if (!key || key.includes("..") || key.startsWith("/")) {
    throw new Error("Chave de arquivo inválida")
  }
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1) {
    throw new Error("Tamanho de arquivo inválido")
  }
  if (expectedSha256 && !/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    throw new Error("Hash do arquivo inválido")
  }

  const bucketName = getR2BucketNameForKey(key)
  const client = createR2Client()
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }))
    const contentLength = Number(head.ContentLength)
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength !== expectedSize ||
      head.ContentType !== expectedContentType
    ) {
      throw new Error("O arquivo enviado não corresponde aos dados informados.")
    }

    const object = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }))
    if (!object.Body) throw new Error("Objeto enviado não possui conteúdo.")
    const { createHash } = await import("node:crypto")
    const hash = createHash("sha256")
    let bytesRead = 0
    for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
      bytesRead += chunk.byteLength
      hash.update(chunk)
    }
    if (bytesRead !== contentLength) {
      throw new Error("O conteúdo do arquivo mudou durante a validação.")
    }
    const sha256 = hash.digest("hex")
    if (expectedSha256 && expectedSha256.toLowerCase() !== sha256) {
      throw new Error("O hash do arquivo não corresponde ao conteúdo enviado.")
    }
    return { contentLength, sha256 }
  } finally {
    client.destroy()
  }
}

export async function deleteFileFromR2(key: string) {
  // Validate key is not empty and doesn't contain traversal
  if (!key || key.includes("..") || key.startsWith("/")) {
    throw new Error("Chave de arquivo inválida")
  }

  const bucketName = getR2BucketNameForKey(key)
  const client = createR2Client()
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    )
  } finally {
    client.destroy()
  }
}

/**
 * Delete a registered customer object from both configured buckets. Checking
 * both buckets also removes legacy copies left by the public/private split.
 */
export async function deleteManagedFileFromAllBuckets(key: string): Promise<void> {
  const userScopedPath = key?.match(/^users\/[0-9a-f-]{36}\/(.*)$/i)?.[1] || ""
  const isPublishedMedia = ["products/", "services/", "partners/", "community-videos/"]
    .some((prefix) => userScopedPath.startsWith(prefix))
  const isLegacyServiceOrderAttachment = /^users\/[0-9a-f-]{36}\/(?:service-orders[^/]+|serviceOrderAttachments[^/]+)$/i.test(key || "")
  if (
    !key || key.includes("..") || key.startsWith("/") ||
    (!isKeyPrivate(key) && !isPublishedMedia && !isLegacyServiceOrderAttachment)
  ) {
    throw new Error("Chave R2 inválida para limpeza")
  }

  const config = getR2ServerConfig()
  if (!config.bucketName || !config.privateBucketName) {
    throw new Error("Os buckets público e privado precisam estar configurados para a limpeza R2")
  }
  if (config.bucketName === config.privateBucketName) {
    throw new Error("O bucket privado precisa ser diferente do bucket público")
  }

  const client = createR2Client()
  try {
    const results = await Promise.allSettled(
      [...new Set([config.bucketName, config.privateBucketName])].map((Bucket) =>
        client.send(new DeleteObjectCommand({ Bucket, Key: key })),
      ),
    )
    if (results.some((result) => result.status === "rejected")) {
      throw new Error("Falha ao remover o objeto de um dos buckets R2")
    }
  } finally {
    client.destroy()
  }
}

/**
 * Server-side upload of a buffer or string directly to R2 bucket.
 * Used for system-generated files, documents, and imported XMLs.
 */
export async function uploadBufferToR2({
  buffer,
  key,
  contentType = "application/xml",
}: {
  buffer: Buffer | Uint8Array | string
  key: string
  contentType?: string
}): Promise<{ key: string }> {
  if (!key || key.includes("..") || key.startsWith("/")) {
    throw new Error("Chave de upload inválida")
  }

  const bucketName = getR2BucketNameForKey(key)
  const client = createR2Client()
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: typeof buffer === "string" ? Buffer.from(buffer, "utf-8") : buffer,
        ContentType: contentType,
      })
    )

    // This helper is used for private ERP documents (for example NF-e XMLs).
    // Never manufacture or return a public URL for an object in this flow.
    return { key }
  } finally {
    client.destroy()
  }
}

/**
 * Server-side copy of an object within the same bucket.
 * Used to give duplicated products/services their own independent files,
 * so deleting the original's image/video doesn't break the duplicates.
 */
export async function copyFileInR2(sourceKey: string, destinationKey: string): Promise<void> {
  if (!sourceKey || sourceKey.includes("..") || sourceKey.startsWith("/")) {
    throw new Error("Chave de origem inválida")
  }
  if (!destinationKey || destinationKey.includes("..") || destinationKey.startsWith("/")) {
    throw new Error("Chave de destino inválida")
  }

  const sourceBucket = getR2BucketNameForKey(sourceKey)
  const destinationBucket = getR2BucketNameForKey(destinationKey)
  if (sourceBucket !== destinationBucket) {
    throw new Error("Não é permitido copiar arquivos entre buckets público e privado")
  }
  const client = createR2Client()
  try {
    await client.send(
      new CopyObjectCommand({
        Bucket: destinationBucket,
        Key: destinationKey,
        CopySource: `${sourceBucket}/${sourceKey}`,
      })
    )
  } finally {
    client.destroy()
  }
}

export async function getFileMetadataFromR2(key: string) {
  if (!key || key.includes("..") || key.startsWith("/")) {
    throw new Error("Chave de arquivo inválida")
  }

  const bucketName = getR2BucketNameForKey(key)
  const client = createR2Client()
  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
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

export interface CloneMediaInput {
  images?: string[] | null
  video_type?: string | null
  video_url?: string | null
  video_thumbnail?: string | null
}

export interface CloneMediaOutput {
  images: string[] | null
  video_url: string | null
  video_thumbnail: string | null
}

/**
 * Copies stored media (R2-hosted images and uploaded videos) to fresh,
 * user-owned keys so duplicated items don't share files with the original.
 * External URLs (YouTube, Vimeo, third-party CDNs) are kept unchanged.
 * Best-effort: if a copy fails, the original reference is kept.
 *
 * When `options.itemId` is provided, uploaded videos are cloned to the
 * canonical item-scoped keys (`users/{userId}/{prefix}{itemId}.*` and
 * `{itemId}-thumbnail.jpg`) expected by the video ownership checks.
 */
export async function cloneMediaForDuplicate(
  input: CloneMediaInput,
  userId: string,
  prefix: string,
  options?: { itemId?: string }
): Promise<CloneMediaOutput> {
  const itemId = options?.itemId

  const cloneOne = async (
    value: string | null | undefined,
    mode: "image" | "video" | "thumbnail"
  ): Promise<string | null> => {
    if (!value || !value.trim()) return value || null
    try {
      const sourceKey = value.startsWith("http") ? extractKeyFromR2Url(value) : value
      if (!sourceKey.startsWith("users/")) return value

      const ext = sourceKey.match(/\.([a-zA-Z0-9]+)$/)?.[1] || (mode === "image" ? "jpg" : "mp4")
      const destinationKey =
        mode !== "image" && itemId
          ? mode === "thumbnail"
            ? `users/${userId}/${prefix}${itemId}-thumbnail.jpg`
            : `users/${userId}/${prefix}${itemId}.${ext}`
          : `users/${userId}/${prefix}${Date.now()}-${crypto.randomUUID()}.${ext}`

      if (!validateKeyOwnership(destinationKey, userId)) return value

      await copyFileInR2(sourceKey, destinationKey)
      return `${getR2PublicUrl().replace(/\/+$/, "")}/${destinationKey}`
    } catch (e) {
      console.error("[cloneMediaForDuplicate] falha ao copiar mídia:", value, e)
      return value
    }
  }

  const [images, videoUrl, videoThumbnail] = await Promise.all([
    input.images?.length
      ? Promise.all(input.images.map((url) => cloneOne(url, "image")))
      : Promise.resolve<(string | null)[] | null>(null),
    cloneOne(input.video_url, "video"),
    cloneOne(input.video_thumbnail, "thumbnail"),
  ])

  return {
    images: images ? (images.filter((u): u is string => typeof u === "string") as string[]) : null,
    video_url: videoUrl,
    video_thumbnail: videoThumbnail,
  }
}
