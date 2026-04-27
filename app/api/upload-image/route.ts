import { type NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/authorization"
import { validateFile, validateMagicBytes } from "@/lib/security/file-validator"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"
import { generateSignedUploadUrl } from "@/lib/r2/server"
import { validateR2Config } from "@/lib/r2/r2-server-config"
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE, MIME_TO_EXT } from "@/lib/r2/config"
import { moderateImageWithBase64 } from "@/lib/moderation/sightengine-moderation"
import {
  calculateImageHash,
  getImageFromCache,
  cacheImageModeration,
} from "@/lib/moderation/image-cache"
import { decideImageStatus } from "@/lib/moderation/image-decision"
import { Buffer } from "buffer"

const ALLOWED_UPLOAD_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
]

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
    const rateLimit = await checkRateLimitForAPI(RateLimitCategory.UPLOAD)
    if (rateLimit.limited) {
      return NextResponse.json(
        rateLimit.body || { error: "Muitas requisições. Tente novamente mais tarde." },
        { status: rateLimit.status || 429 }
      )
    }

    // =============================
    // Auth - STRICT (throws on failure)
    // =============================
    const user = await requireUser()

    // =============================
    // Parse request - suporta FormData ou JSON
    // =============================
    let buffer: Buffer
    let mimeType: string

    const contentType = request.headers.get("content-type") || ""

    if (contentType.includes("application/json")) {
      // JSON com imageData (base64)
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
      console.warn(`[SECURITY] MIME spoofing attempt detected for user ${user.id}: ${magicBytesValidation.error}`)
      return NextResponse.json(
        { error: magicBytesValidation.error },
        { status: 400 }
      )
    }

    // Extrair extensão segura do MIME type
    const extension = MIME_TO_EXT[mimeType] || "jpg"

    // =============================
    // Hash
    // =============================
    const imageHash = await calculateImageHash(buffer)

    // =============================
    // Moderação (pula se foi aprovada antes)
    // =============================
    let decision = { status: "APPROVED" }
    const cachedResult = await getImageFromCache(imageHash)

    if (cachedResult) {
      decision.status = cachedResult.status
    } else {
      // Fazer moderação nova
      const base64Image = buffer.toString("base64")
      const moderationResult = await moderateImageWithBase64(base64Image)
      decision = decideImageStatus(moderationResult)

      // Guardar resultado em cache
      await cacheImageModeration(
        imageHash,
        moderationResult.riskLevel,
        moderationResult.confidence,
        moderationResult.categories,
        decision.status as "APPROVED" | "FLAGGED" | "BLOCKED",
      )
    }

    // =============================
    // Nome seguro (server-generated, ignoring client name)
    // =============================
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    const filename = `${timestamp}-${random}.${extension}`

    // =============================
    // Determinar prefixo da pasta
    // =============================
    const uploadType = request.nextUrl.searchParams.get("uploadType") || "products"
    const prefix = uploadType === "partner-logo" ? "partner-logos/" : "products/"

    // =============================
    // Signed URL - user-scoped, short expiry
    // =============================
    let signedUrl
    try {
      signedUrl = await generateSignedUploadUrl({
        fileName: filename,
        fileType: mimeType,
        userId: user.id,
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

    // =============================
    // Upload - set correct Content-Type for browser safety
    // if directUpload is requested (or universally for direct upload mode), return the uploadUrl
    // =============================
    const isDirect = request.nextUrl.searchParams.get("directUpload") === "true"

    if (isDirect) {
      // Return the upload URL so the client does the upload directly
      return NextResponse.json({
        success: true,
        uploadUrl: signedUrl.uploadUrl,
        publicUrl: signedUrl.publicUrl,
        key: signedUrl.key,
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
    // It's a PUT to a cryptographically signed URL — no SSRF vector exists.
    const uploadResponse = await fetch(signedUrl.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Length": buffer.length.toString(),
      },
      body: new Uint8Array(buffer),
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
