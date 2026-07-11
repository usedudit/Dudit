/**
 * API Route: GET /api/r2/get-signed-url
 * Generates a signed URL for direct client-to-R2 upload.
 *
 * SECURITY:
 * - Authentication via requireUser() (strict)
 * - MIME type + extension validation
 * - User-scoped keys (multi-tenant isolation)
 * - Expiry capped at 120 seconds
 * - Client cannot control storage prefix
 */

import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/authorization"
import { generateSignedUploadUrl } from "@/lib/r2/server"
import {
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  DANGEROUS_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_PRESIGNED_URL_EXPIRY,
  R2_PREFIXES,
} from "@/lib/r2/config"

export async function GET(request: NextRequest) {
  try {
    // 1. STRICT AUTHENTICATION
    const user = await requireUser()

    // 2. PARSE PARAMETERS
    const searchParams = request.nextUrl.searchParams
    const fileName = searchParams.get("fileName")
    const fileType = searchParams.get("fileType")
    const requestedPrefix = searchParams.get("prefix")

    // 3. VALIDATE REQUIRED PARAMS
    if (!fileName || !fileType) {
      return NextResponse.json(
        { error: "fileName e fileType são obrigatórios" },
        { status: 400 }
      )
    }

    // Validate custom prefix if provided
    let prefix: string = "products/"
    if (requestedPrefix) {
      const allowedPrefixes = Object.values(R2_PREFIXES) as string[]
      if (!allowedPrefixes.includes(requestedPrefix)) {
        return NextResponse.json(
          { error: "Prefixo de upload inválido ou não permitido" },
          { status: 400 }
        )
      }
      prefix = requestedPrefix
    }

    // 4. VALIDATE MIME TYPE - strict allowlist
    if (!ALLOWED_MIME_TYPES.includes(fileType as any)) {
      return NextResponse.json(
        { error: `Tipo de arquivo não permitido. Permitidos: ${ALLOWED_MIME_TYPES.join(", ")}` },
        { status: 400 }
      )
    }

    // 5. VALIDATE EXTENSION - allowlist + dangerous blocklist
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf("."))
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

    // 6. GENERATE SIGNED URL - user-scoped, short expiry
    const result = await generateSignedUploadUrl({
      fileName,
      fileType,
      userId: user.id,
      prefix,
      expiresIn: MAX_PRESIGNED_URL_EXPIRY, // Capped at 120s
    })

    return NextResponse.json(result, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, must-revalidate",
      },
    })
  } catch (error) {
    console.error("[API] Erro em /api/r2/get-signed-url:", error)

    const message =
      error instanceof Error ? error.message : "Erro ao gerar signed URL"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
