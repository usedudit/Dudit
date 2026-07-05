import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { generateSignedUploadUrl } from "@/lib/r2/server"
import { resolveVideoUploadContentType } from "@/lib/r2/resolve-content-type"
import {
  ALLOWED_VIDEO_EXTENSIONS,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_FILE_SIZE,
  MAX_FILE_SIZE,
  VIDEO_MIME_TO_EXT,
  R2_PREFIXES,
} from "@/lib/r2/config"

export const runtime = "nodejs"

function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status })
}

function getExt(filename: string) {
  const dot = filename.lastIndexOf(".")
  return dot >= 0 ? filename.slice(dot).toLowerCase() : ""
}

function validateFirstBytes(contentType: string, firstBytesBase64: string) {
  const bytes = Buffer.from(firstBytesBase64 || "", "base64")
  if (bytes.length < 8) return false
  if (contentType === "video/webm") {
    return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
  }
  return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
}

export async function POST(req: NextRequest) {
  try {
    await requireRateLimit(RateLimitCategory.COMMUNITY_VIDEO_UPLOAD)
    const user = await requireUser()
    const body = await req.json()

    const filename = String(body.filename || "")
    const contentType = resolveVideoUploadContentType(String(body.contentType || ""), filename)
    const fileSize = Number(body.fileSize || 0)
    const duration = Number(body.duration || 0)
    const firstBytesBase64 = String(body.firstBytesBase64 || "")

    if (!filename || !contentType) return jsonError("Arquivo inválido")
    if (!ALLOWED_VIDEO_MIME_TYPES.includes(contentType as any)) return jsonError("Formato não suportado")
    if (!ALLOWED_VIDEO_EXTENSIONS.includes(getExt(filename) as any)) return jsonError("Formato não suportado")
    if (fileSize <= 0) return jsonError("Arquivo vazio não é permitido")
    if (fileSize > MAX_VIDEO_FILE_SIZE) return jsonError("Vídeo excede limite de 25MB")
    if (!Number.isFinite(duration) || duration < 10 || duration > 60) return jsonError("Vídeo deve ter entre 10 e 60 segundos")
    if (!validateFirstBytes(contentType, firstBytesBase64)) return jsonError("Arquivo de vídeo inválido")

    const ext = Object.entries(VIDEO_MIME_TO_EXT).find(([k]) => k === contentType)?.[1]
    if (!ext) return jsonError("Formato não suportado")

    const videoId = crypto.randomUUID()
    const prefix = R2_PREFIXES.communityVideos
    const videoKey = `users/${user.id}/${prefix}${videoId}.${ext}`
    const thumbnailKey = `users/${user.id}/${prefix}${videoId}-thumbnail.jpg`

    const [video, thumbnail] = await Promise.all([
      generateSignedUploadUrl({
        fileName: `${videoId}.${ext}`,
        fileType: contentType,
        userId: user.id,
        key: videoKey,
        allowedMimeTypes: ALLOWED_VIDEO_MIME_TYPES,
        allowedExtensions: ALLOWED_VIDEO_EXTENSIONS,
        mimeToExt: VIDEO_MIME_TO_EXT,
        expiresIn: 120,
      }),
      generateSignedUploadUrl({
        fileName: `${videoId}-thumbnail.jpg`,
        fileType: "image/jpeg",
        userId: user.id,
        key: thumbnailKey,
        expiresIn: 120,
      }),
    ])

    return NextResponse.json({
      video,
      thumbnail,
      videoId,
      signedVideoContentType: contentType,
      maxThumbnailSize: MAX_FILE_SIZE,
    })
  } catch (error: any) {
    return jsonError(error?.message || "Erro ao gerar URL de upload", 500)
  }
}
