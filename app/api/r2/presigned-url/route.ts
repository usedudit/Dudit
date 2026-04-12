import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/authorization"
import { generateSignedUploadUrl } from "@/lib/r2/server"
import {
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  DANGEROUS_EXTENSIONS,
  MAX_FILE_SIZE,
  MIME_TO_EXT,
} from "@/lib/r2/config"
import { validateR2Config } from "@/lib/r2/r2-server-config"

export const runtime = "nodejs"

/**
 * POST /api/r2/presigned-url
 * Generates a presigned URL for direct client-to-R2 upload.
 *
 * SECURITY:
 * - Requires authentication via requireUser()
 * - Keys scoped to users/{userId}/...
 * - Strict MIME type + extension allowlist
 * - File size validated before URL generation
 * - Presigned URL expires in ≤120 seconds
 * - Client-provided filename is NOT used in the key
 */
export async function POST(req: NextRequest) {
  try {
    // 1. AUTHENTICATION - strict, throws on failure
    const user = await requireUser()

    // 2. VALIDATE R2 CONFIG
    const configValidation = validateR2Config()
    if (!configValidation.valid) {
      console.error("[R2 Config Error]", configValidation.errors)
      return NextResponse.json(
        { error: "Configuração do R2 incompleta. Entre em contato com o administrador." },
        { status: 500 }
      )
    }

    // 3. PARSE REQUEST BODY
    const { filename, contentType, fileSize } = await req.json()

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: "filename e contentType são obrigatórios" },
        { status: 400 }
      )
    }

    // 4. VALIDATE MIME TYPE - strict allowlist
    if (!ALLOWED_MIME_TYPES.includes(contentType as any)) {
      return NextResponse.json(
        { error: `Tipo de arquivo não permitido. Permitidos: ${ALLOWED_MIME_TYPES.join(", ")}` },
        { status: 400 }
      )
    }

    // 5. VALIDATE FILE EXTENSION - allowlist + dangerous blocklist
    const ext = filename.toLowerCase().substring(filename.lastIndexOf("."))
    if (DANGEROUS_EXTENSIONS.includes(ext as any)) {
      return NextResponse.json(
        { error: "Extensão de arquivo perigosa bloqueada" },
        { status: 400 }
      )
    }
    if (!ALLOWED_EXTENSIONS.includes(ext as any)) {
      return NextResponse.json(
        { error: `Extensão não permitida. Permitidas: ${ALLOWED_EXTENSIONS.join(", ")}` },
        { status: 400 }
      )
    }

    // 6. CROSS-VALIDATE MIME ↔ EXTENSION
    const expectedExt = MIME_TO_EXT[contentType]
    if (expectedExt) {
      const normalizedExt = ext === ".jpeg" ? ".jpg" : ext
      if (normalizedExt !== `.${expectedExt}`) {
        return NextResponse.json(
          { error: `Extensão ${ext} não corresponde ao tipo ${contentType}` },
          { status: 400 }
        )
      }
    }

    // 7. VALIDATE FILE SIZE - enforce 5MB max
    if (fileSize && typeof fileSize === "number") {
      if (fileSize > MAX_FILE_SIZE) {
        const maxMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)
        return NextResponse.json(
          { error: `Arquivo muito grande. Máximo: ${maxMB}MB` },
          { status: 400 }
        )
      }
      if (fileSize <= 0) {
        return NextResponse.json(
          { error: "Arquivo vazio não é permitido" },
          { status: 400 }
        )
      }
    }

    // 8. GENERATE PRESIGNED URL - user-scoped key, short expiry
    const result = await generateSignedUploadUrl({
      fileName: filename,
      fileType: contentType,
      userId: user.id,
      prefix: "products/",
      expiresIn: 120, // 2 minutes max
    })

    return NextResponse.json({
      uploadUrl: result.uploadUrl,
      key: result.key,
      publicUrl: result.publicUrl,
    })
  } catch (error) {
    console.error("[R2 Presigned URL] Error:", error)

    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido"

    if (errorMessage.includes("Resolved credential object is not valid")) {
      return NextResponse.json(
        { error: "Credenciais do R2 inválidas. Verifique as variáveis de ambiente." },
        { status: 500 }
      )
    }

    // Don't leak internal error details
    return NextResponse.json(
      { error: "Erro ao gerar URL de upload" },
      { status: 500 }
    )
  }
}
