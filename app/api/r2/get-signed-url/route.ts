import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/authorization"
import { generateSignedUploadUrl } from "@/lib/r2/server"
import { validateUploadRequest } from "@/lib/security/file-validator"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import {
  MAX_PRESIGNED_URL_EXPIRY,
  R2_PREFIXES,
} from "@/lib/r2/config"

export async function GET(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimitForAPI(RateLimitCategory.UPLOAD)
    if (rateLimit.limited) {
      return NextResponse.json(
        rateLimit.body || { error: "Muitas requisições. Tente novamente mais tarde." },
        { status: rateLimit.status || 429 },
      )
    }
    // 1. STRICT AUTHENTICATION
    const user = await requireUser()

    // 2. PARSE PARAMETERS
    const searchParams = request.nextUrl.searchParams
    const fileName = searchParams.get("fileName")
    const fileType = searchParams.get("fileType")
    const requestedPrefix = searchParams.get("prefix")
    const fileSize = Number(searchParams.get("fileSize"))

    // 3. VALIDATE REQUIRED PARAMS
    if (!fileName || !fileType || !Number.isSafeInteger(fileSize) || fileSize < 1) {
      return NextResponse.json(
        { error: "fileName, fileType e fileSize válidos são obrigatórios" },
        { status: 400 }
      )
    }

    // Validate custom prefix if provided
    let prefix: string = "products/"
    if (requestedPrefix) {
      // This legacy generic route serves only record media. Private ERP files
      // must go through their scoped Server Actions.
      const allowedPrefixes: readonly string[] = [
        R2_PREFIXES.products,
        R2_PREFIXES.suppliers,
        R2_PREFIXES.customers,
      ]
      if (!allowedPrefixes.includes(requestedPrefix)) {
        return NextResponse.json(
          { error: "Prefixo de upload inválido ou não permitido" },
          { status: 400 }
        )
      }
      prefix = requestedPrefix
    }

    // 4. UNIFIED FILE VALIDATION
    const valResult = validateUploadRequest(fileName, fileType, fileSize)
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
      contentLength: fileSize,
      userId: user.id,
      prefix,
      kind,
      expiresIn: MAX_PRESIGNED_URL_EXPIRY, // Capped at 120s
    })

    return NextResponse.json(result, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    })
  } catch (error) {
    console.error("[API] Erro em /api/r2/get-signed-url:", error)

    return NextResponse.json({ error: "Não foi possível gerar a URL de upload." }, { status: 400 })
  }
}
