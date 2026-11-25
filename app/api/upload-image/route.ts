import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/authorization"
import { validateFile, validateMagicBytes } from "@/lib/security/file-validator"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"
import { generateSignedUploadUrl } from "@/lib/r2/server"
import { validateR2Config } from "@/lib/r2/r2-server-config"
import { MAX_FILE_SIZE, MIME_TO_EXT } from "@/lib/r2/config"
import { moderateImageWithBase64 } from "@/lib/moderation/sightengine-moderation"
import {
  calculateImageHash,
  calculatePerceptualHash,
  findSimilarImageInCache,
  getImageFromCache,
  cacheImageModeration,
  cacheImageUrlStatus,
} from "@/lib/moderation/image-cache"
import { decideImageStatus } from "@/lib/moderation/image-decision"
import { Buffer } from "buffer"
import sharp from "sharp"

const ALLOWED_UPLOAD_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
]

const MIME_TO_EXT_MAP = new Map<string, string>(Object.entries(MIME_TO_EXT))

async function handleUpload(request: NextRequest) {
  try {
    // =============================
    // Validar config R2
    // =============================
    const configValidation = validateR2Config()
    if (!configValidation.valid) {
      console.error("R2 config inválida")
      return NextResponse.json(
        { error: "Erro interno de configuração." },
        { status: 500 }
      )
    }

    // =============================
    // Rate limit (UPLOAD category: 20 req/hour per user)
    // =============================
    const uploadType = request.nextUrl.searchParams.get("uploadType") || "products"
    const user = await getCurrentUser()
    const platformIP = (request as NextRequest & { ip?: string }).ip
    const rateLimit = await checkRateLimitForAPI(
      !user && uploadType === "partner-logo"
        ? RateLimitCategory.PARTNER_LOGO_UPLOAD
        : RateLimitCategory.UPLOAD,
      "image-upload",
      platformIP,
    )
    if (rateLimit.limited) {
      return NextResponse.json(
        rateLimit.body || { error: "Muitas requisições. Tente novamente mais tarde." },
        { status: rateLimit.status || 429 }
      )
    }

    // =============================
    // Auth - Permite partner-logo durante cadastro mesmo sem sessão logada
    // =============================
    if (!user && uploadType !== "partner-logo") {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      )
    }

    const userId = user ? user.id : "unauthenticated"

    // =============================
    // Parse request - suporta FormData ou JSON
    // =============================
    let buffer: Buffer
    let mimeType: string

    const contentType = request.headers.get("content-type") || ""

    if (contentType.includes("application/json")) {
      // JSON com imageData (base64)
      const contentLength = Number(request.headers.get("content-length") || 0)
      if (contentLength > MAX_FILE_SIZE * 2) {
        return NextResponse.json({ error: "Requisição muito grande." }, { status: 413 })
      }

      const body = await request.json()
      if (!body.imageData) {
        return NextResponse.json(
          { error: "Nenhuma imagem fornecida." },
          { status: 400 }
        )
      }

      // Decodificar base64
      const base64Data = body.imageData.split(",")[1] || body.imageData
      buffer = Buffer.from(base64Data, "base64")
      mimeType = body.imageData.split(";")[0]?.replace("data:", "") || "image/jpeg"

      // SECURITY FIX (LOW-02): Gate debug logs behind development mode
      if (process.env.NODE_ENV === 'development') {
        console.log("=== JSON UPLOAD DEBUG ===")
        console.log("imageData prefix:", body.imageData.slice(0, 50))
        console.log("detected mimeType:", mimeType)
        console.log("first bytes:", buffer.slice(0, 12))
      }

      // SECURITY: Validate buffer size (5MB max)
      if (buffer.length > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `Imagem muito grande. Máximo: ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB` },
          { status: 400 }
        )
      }

      if (buffer.length === 0) {
        return NextResponse.json(
          { error: "Arquivo vazio não é permitido." },
          { status: 400 }
        )
      }
    } else {
      // FormData com arquivo
      const formData = await request.formData()
      const file = formData.get("file") as File

      if (!file) {
        return NextResponse.json(
          { error: "Nenhum arquivo fornecido." },
          { status: 400 }
        )
      }

      // =============================
      // Comprehensive file validation (name, type, extension, size)
      // =============================
      const validation = validateFile(file, {
        maxSize: MAX_FILE_SIZE,
        allowedTypes: ALLOWED_UPLOAD_MIME_TYPES,
      })

      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        )
      }

      buffer = Buffer.from(await file.arrayBuffer())
      mimeType = file.type || "application/octet-stream"

      if (process.env.NODE_ENV === 'development') {
        console.log("=== FORMDATA UPLOAD DEBUG ===")
        console.log("file.name:", file.name)
        console.log("file.type:", file.type)
        console.log("detected mimeType:", mimeType)
        console.log("first bytes:", buffer.slice(0, 12))
      }
    }

    // =============================
    // VALIDATE MIME TYPE - strict allowlist
    // =============================
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: "Formato de imagem não permitido." },
        { status: 400 }
      )
    }

    // =============================
    // MAGIC BYTES VALIDATION - prevent MIME spoofing
    // =============================

    if (process.env.NODE_ENV === 'development') {
      console.log("=== MAGIC BYTES CHECK ===")
      console.log("Declared MIME:", mimeType)
      console.log("First 8 bytes:", buffer.slice(0, 8))
    }

    const magicBytesValidation = validateMagicBytes(buffer, mimeType)
    if (!magicBytesValidation.valid) {
      console.warn(`[SECURITY] MIME spoofing attempt detected for user ${userId}: ${magicBytesValidation.error}`)
      return NextResponse.json(
        { error: magicBytesValidation.error },
        { status: 400 }
      )
    }

    // Extrair extensão segura do MIME type
    const extension = MIME_TO_EXT_MAP.get(mimeType) || "jpg"

    // =============================
    // Hashes (SHA-256 para exato + dHash para similaridade visual)
    // =============================
    const [imageHash, imagePHash] = await Promise.all([
      calculateImageHash(buffer),
      calculatePerceptualHash(buffer),
    ])

    // =============================
    // Moderação (Camada 1: SHA256 -> Camada 2: Visual pHash para FLAGGED -> Camada 3: Sightengine)
    // =============================
    let cachedModeration = await getImageFromCache(imageHash)

    // Camada 2 (pHash): Se miss no SHA-256 exato, APENAS reutiliza se bater com imagem FLAGGED conhecida (blacklist)
    // NUNCA auto-aprova imagem nova desconhecida por similaridade visual dHash para evitar falso-positivo em fundos planos
    if (!cachedModeration && imagePHash) {
      const visualMatch = await findSimilarImageInCache(imagePHash)
      if (visualMatch && visualMatch.cached.status === "FLAGGED") {
        cachedModeration = visualMatch.cached
      }
    }

    let decision: ReturnType<typeof decideImageStatus>
    let moderationUnavailable = false

    if (cachedModeration) {
      // Trata status legado BLOCKED como FLAGGED para nunca bloquear upload
      const effectiveStatus = cachedModeration.status === "BLOCKED" ? "FLAGGED" : cachedModeration.status
      decision = {
        status: effectiveStatus,
        message: effectiveStatus === "FLAGGED"
          ? "Imagem encaminhada para revisão."
          : "Imagem aprovada.",
        shouldSaveToR2: true,
      }
    } else {
      // Moderação direta com Sightengine via base64 (bytes crus na memória)
      const base64Payload = buffer.toString("base64")
      const analysis = await moderateImageWithBase64(base64Payload)

      if (analysis.isUnavailable) {
        // Fallback resiliente: se Sightengine estiver temporariamente indisponível, não bloqueia o lojista
        // mas NÃO grava no cache do Redis como APPROVED para permitir re-checagem futura
        moderationUnavailable = true
        decision = {
          status: "APPROVED",
          message: "Imagem enviada.",
          shouldSaveToR2: true,
        }
      } else {
        const sightDecision = decideImageStatus(analysis)
        const status = sightDecision.status === "FLAGGED" ? "FLAGGED" : "APPROVED"
        decision = {
          status,
          message: status === "FLAGGED"
            ? "Imagem encaminhada para revisão."
            : "Imagem aprovada.",
          shouldSaveToR2: true,
        }

        // Cacheia decisão no Redis apenas quando a moderação de fato foi executada
        await cacheImageModeration(
          imageHash,
          analysis.riskLevel,
          analysis.confidence,
          analysis.categories,
          status,
          imagePHash,
        )
      }
    }

    if (!decision.shouldSaveToR2) {
      return NextResponse.json({ error: decision.message }, { status: 400 })
    }

    const isDirect = request.nextUrl.searchParams.get("directUpload") === "true"

    // =============================
    // Otimização server-side com sharp (WebP + redimensionamento por tipo)
    // Reduz peso no R2 sem consumir cota de transformações da Cloudflare.
    // Mantém o buffer original intacto em directUpload (o cliente faz o PUT direto).
    // =============================
    let uploadBuffer = buffer
    let uploadMimeType = mimeType
    let uploadExtension = extension

    if (!isDirect) {
      const resizeLimits: Record<string, { width: number; height: number }> = {
        "partner-logo": { width: 256, height: 256 },
        "partner-banner": { width: 1200, height: 400 },
        "products": { width: 1200, height: 1200 },
      }
      const limits = resizeLimits[uploadType] || resizeLimits.products
      try {
        uploadBuffer = await sharp(buffer)
          .rotate()
          .resize(limits.width, limits.height, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 82 })
          .toBuffer()
        uploadMimeType = "image/webp"
        uploadExtension = "webp"
      } catch (optError) {
        console.warn("[upload-image] Falha ao otimizar com sharp, mantendo original:", optError)
      }
    }

    // =============================
    // Nome seguro (server-generated, ignoring client name)
    // =============================
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    const filename = `${timestamp}-${random}.${uploadExtension}`

    // =============================
    // Determinar prefixo da pasta
    // =============================
    const prefixMap: Record<string, string> = {
      "partner-logo": "partner-logos/",
      "partner-banner": "partner-banners/",
      "products": "products/",
    }
    const prefix = prefixMap[uploadType] || "products/"

    // =============================
    // Signed URL - user-scoped, short expiry
    // =============================
    let signedUrl
    try {
      signedUrl = await generateSignedUploadUrl({
        fileName: filename,
        fileType: uploadMimeType,
        userId: userId,
        prefix: prefix,
        expiresIn: 120, // 2 minutes - enough for server-side upload
      })
    } catch (error) {
      console.error("Erro ao gerar signed URL", error)
      return NextResponse.json(
        { error: "Falha ao processar upload." },
        { status: 500 }
      )
    }

    // Registra status da imagem em cache de chave/URL (apenas se moderação foi executada com sucesso)
    if (!moderationUnavailable) {
      const finalModerationStatus = decision.status === "FLAGGED" ? "FLAGGED" : "APPROVED"
      await cacheImageUrlStatus(signedUrl.key, finalModerationStatus)
      if (signedUrl.publicUrl) await cacheImageUrlStatus(signedUrl.publicUrl, finalModerationStatus)
    }

    if (isDirect) {
      // Return the upload URL so the client does the upload directly
      return NextResponse.json({
        success: true,
        uploadUrl: signedUrl.uploadUrl,
        publicUrl: signedUrl.publicUrl,
        key: signedUrl.key,
        contentType: signedUrl.contentType,
        fileName: filename,
        imageHash,
        moderation: {
          status: decision.status,
        },
      })
    }

    // SSRF NOTE: This fetch is intentionally NOT wrapped in safeFetch.
    // Justification: The uploadUrl is 100% server-generated by generateSignedUploadUrl()
    // (domain: <accountId>.r2.cloudflarestorage.com from env config, not user input).
    // It's a PUT to a cryptographically signed URL - no SSRF vector exists.
    const uploadResponse = await fetch(signedUrl.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": signedUrl.contentType,
        "Content-Length": uploadBuffer.length.toString(),
      },
      body: new Uint8Array(uploadBuffer),
    })

    if (!uploadResponse.ok) {
      console.error("Falha no upload para R2", {
        status: uploadResponse.status,
      })
      return NextResponse.json(
        { error: "Falha ao enviar arquivo." },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      publicUrl: signedUrl.publicUrl,
      key: signedUrl.key,
      fileName: filename,
      imageHash,
      moderation: {
        status: decision.status,
      },
    })
  } catch (error) {
    console.error("Erro na rota de upload", error)
    return NextResponse.json(
      { error: "Erro interno ao processar upload." },
      { status: 500 }
    )
  }
}

export const POST = withCSRFProtection(handleUpload)
