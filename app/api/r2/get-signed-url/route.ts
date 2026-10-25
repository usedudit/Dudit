import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/authorization"
import { generateSignedUploadUrl } from "@/lib/r2/server"
import { validateUploadRequest } from "@/lib/security/file-validator"
import {
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

    // 4. UNIFIED FILE VALIDATION
    const valResult = validateUploadRequest(fileName, fileType)
    if (!valResult.success) {
      return NextResponse.json(
        { error: valResult.error },
        { status: 400 }
      )
    }

    const { kind } = valResult.data

    // 5. GENERATE SIGNED URL - user-scoped, short expiry
    const result = await generateSignedUploadUrl({
      fileName,
      fileType,
      userId: user.id,
      prefix,
      kind,
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

    return NextResponse.json({ error: "Não foi possível gerar a URL de upload." }, { status: 400 })
  }
}
