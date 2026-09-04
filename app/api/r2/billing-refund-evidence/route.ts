import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/authorization"
import { generateSignedUploadUrl } from "@/lib/r2/server"
import { DANGEROUS_EXTENSIONS, MAX_FILE_SIZE } from "@/lib/r2/config"
import { validateR2Config } from "@/lib/r2/r2-server-config"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

export const runtime = "nodejs"

const ALLOWED_REFUND_EVIDENCE_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "application/pdf",
] as const

const ALLOWED_REFUND_EVIDENCE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".pdf"] as const
const REFUND_EVIDENCE_MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "application/pdf": "pdf",
}

export async function POST(req: NextRequest) {
    try {
        const rateLimit = await checkRateLimitForAPI(RateLimitCategory.UPLOAD)
        if (rateLimit.limited) {
            return NextResponse.json(
                rateLimit.body || { error: "Muitas requisições. Tente novamente mais tarde." },
                { status: rateLimit.status || 429 }
            )
        }

        const user = await requireUser()
        const configValidation = validateR2Config()
        if (!configValidation.valid) {
            return NextResponse.json({ error: "Configuração do R2 incompleta." }, { status: 500 })
        }

        const body = await req.json()
        const { filename, fileSize } = body
        let contentType = String(body.contentType || "").split(";")[0].trim().toLowerCase()

        if (!filename) {
            return NextResponse.json({ error: "filename e contentType são obrigatórios" }, { status: 400 })
        }

        const ext = String(filename).toLowerCase().substring(String(filename).lastIndexOf("."))
        if (DANGEROUS_EXTENSIONS.includes(ext as any) || !ALLOWED_REFUND_EVIDENCE_EXTENSIONS.includes(ext as any)) {
            return NextResponse.json({ error: "Extensão não permitida." }, { status: 400 })
        }

        // Inferência/normalização caso venha vazio ou application/octet-stream
        if (!contentType || contentType === "application/octet-stream") {
            if (ext === ".pdf") contentType = "application/pdf"
            else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg"
            else if (ext === ".png") contentType = "image/png"
            else if (ext === ".webp") contentType = "image/webp"
            else if (ext === ".avif") contentType = "image/avif"
        }

        if (!ALLOWED_REFUND_EVIDENCE_MIME_TYPES.includes(contentType as any)) {
            return NextResponse.json({ error: "Tipo de arquivo não permitido. Apenas imagens (JPG, PNG, WEBP, AVIF) e documentos PDF são aceitos." }, { status: 400 })
        }

        const expectedExt = Object.entries(REFUND_EVIDENCE_MIME_TO_EXT).find(([k]) => k === contentType)?.[1]
        const normalizedExt = ext === ".jpeg" ? ".jpg" : ext
        if (normalizedExt !== `.${expectedExt}`) {
            return NextResponse.json({ error: "Extensão não corresponde ao tipo do arquivo." }, { status: 400 })
        }

        if (typeof fileSize === "number" && (fileSize <= 0 || fileSize > MAX_FILE_SIZE)) {
            return NextResponse.json({ error: "Tamanho do arquivo inválido." }, { status: 400 })
        }

        const result = await generateSignedUploadUrl({
            fileName: filename,
            fileType: contentType,
            userId: user.id,
            prefix: "billing-refunds/",
            expiresIn: 180,
            allowedMimeTypes: ALLOWED_REFUND_EVIDENCE_MIME_TYPES,
            allowedExtensions: ALLOWED_REFUND_EVIDENCE_EXTENSIONS,
            mimeToExt: REFUND_EVIDENCE_MIME_TO_EXT,
        })

        return NextResponse.json({
            ...result,
            signedUrl: result.uploadUrl,
        })
    } catch (error: any) {
        console.error("[R2 billing refund evidence] Error:", error)
        return NextResponse.json({ error: error?.message || "Erro ao gerar URL de upload" }, { status: 500 })
    }
}
