import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/authorization"
import { generateSignedUploadUrl } from "@/lib/r2/server"
import { validateUploadRequest } from "@/lib/security/file-validator"
import { validateR2Config } from "@/lib/r2/r2-server-config"

export const runtime = "nodejs"

/**
 * POST /api/r2/presigned-url
 * Generates a presigned URL for direct client-to-R2 upload.
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

    // 4. UNIFIED FILE VALIDATION
    const valResult = validateUploadRequest(filename, contentType, fileSize)
    if (!valResult.success) {
      return NextResponse.json(
        { error: valResult.error },
        { status: 400 }
      )
    }

    const { kind } = valResult.data

    // 5. GENERATE PRESIGNED URL - user-scoped key, short expiry
    const result = await generateSignedUploadUrl({
      fileName: filename,
      fileType: contentType,
      userId: user.id,
      prefix: "products/",
      kind,
      expiresIn: 120, // 2 minutes max
    })

    return NextResponse.json({
      uploadUrl: result.uploadUrl,
      key: result.key,
      publicUrl: result.publicUrl,
      contentType: result.contentType,
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
