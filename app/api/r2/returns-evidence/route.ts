import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/authorization"
import { generateSignedUploadUrl } from "@/lib/r2/server"
import { DANGEROUS_EXTENSIONS, MAX_FILE_SIZE } from "@/lib/r2/config"
import { validateR2Config } from "@/lib/r2/r2-server-config"

export const runtime = "nodejs"

const ALLOWED_RETURN_EVIDENCE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const

const ALLOWED_RETURN_EVIDENCE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"] as const
const RETURN_EVIDENCE_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    const configValidation = validateR2Config()
    if (!configValidation.valid) {
      return NextResponse.json({ error: "Configuracao do R2 incompleta." }, { status: 500 })
    }

    const { filename, contentType, fileSize } = await req.json()
    if (!filename || !contentType) {
      return NextResponse.json({ error: "filename e contentType sao obrigatorios" }, { status: 400 })
    }

    if (!ALLOWED_RETURN_EVIDENCE_MIME_TYPES.includes(contentType)) {
      return NextResponse.json({ error: "Tipo de arquivo nao permitido." }, { status: 400 })
    }

    const ext = String(filename).toLowerCase().substring(String(filename).lastIndexOf("."))
    if (DANGEROUS_EXTENSIONS.includes(ext as any) || !ALLOWED_RETURN_EVIDENCE_EXTENSIONS.includes(ext as any)) {
      return NextResponse.json({ error: "Extensao nao permitida." }, { status: 400 })
    }

    const expectedExt = Object.entries(RETURN_EVIDENCE_MIME_TO_EXT).find(([k]) => k === contentType)?.[1]
    const normalizedExt = ext === ".jpeg" ? ".jpg" : ext
    if (normalizedExt !== `.${expectedExt}`) {
      return NextResponse.json({ error: "Extensao nao corresponde ao tipo do arquivo." }, { status: 400 })
    }

    if (typeof fileSize === "number" && (fileSize <= 0 || fileSize > MAX_FILE_SIZE)) {
      return NextResponse.json({ error: "Tamanho do arquivo invalido." }, { status: 400 })
    }

    const result = await generateSignedUploadUrl({
      fileName: filename,
      fileType: contentType,
      userId: user.id,
      prefix: "returns/",
      expiresIn: 120,
      allowedMimeTypes: ALLOWED_RETURN_EVIDENCE_MIME_TYPES,
      allowedExtensions: ALLOWED_RETURN_EVIDENCE_EXTENSIONS,
      mimeToExt: RETURN_EVIDENCE_MIME_TO_EXT,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[R2 returns evidence] Error:", error)
    return NextResponse.json({ error: "Erro ao gerar URL de upload" }, { status: 500 })
  }
}
