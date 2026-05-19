import { NextRequest, NextResponse } from "next/server"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
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
} from "@/lib/r2/config"

export const runtime = "nodejs"

type ItemType = "product" | "service"

const TABLE_BY_TYPE: Record<ItemType, string> = {
  product: "products",
  service: "services",
}

function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status })
}

function validateUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
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

async function verifyItemAccess(itemType: ItemType, itemId: string, user: any) {
  const admin = getAdminClient()
  const table = TABLE_BY_TYPE[itemType]
  const { data, error } = await admin.from(table).select("id, partner_id").eq("id", itemId).maybeSingle()

  if (error) throw new Error("Erro ao validar propriedade do item")
  if (!data) return

  await requirePartnerAccessWithPermission(data.partner_id, itemType === "product" ? "products" : "services", "edit", user)
}

export async function POST(req: NextRequest) {
  try {
    await requireRateLimit(RateLimitCategory.UPLOAD)
    const user = await requireUser()
    const body = await req.json()

    const itemType = body.itemType as ItemType
    const itemId = body.itemId
    const filename = String(body.filename || "")
    const contentType = resolveVideoUploadContentType(String(body.contentType || ""), filename)
    const fileSize = Number(body.fileSize || 0)
    const duration = Number(body.duration || 0)
    const firstBytesBase64 = String(body.firstBytesBase64 || "")

    if (itemType !== "product" && itemType !== "service") return jsonError("Tipo de item inválido")
    if (!validateUuid(itemId)) return jsonError("ID do item inválido")
    if (!filename || !contentType) return jsonError("Arquivo inválido")
    if (!ALLOWED_VIDEO_MIME_TYPES.includes(contentType as any)) return jsonError("Formato não suportado")
    if (!ALLOWED_VIDEO_EXTENSIONS.includes(getExt(filename) as any)) return jsonError("Formato não suportado")
    if (fileSize <= 0) return jsonError("Arquivo vazio não é permitido")
    if (fileSize > MAX_VIDEO_FILE_SIZE) return jsonError("Vídeo excede limite")
    if (!Number.isFinite(duration) || duration < 10 || duration > 60) return jsonError("Vídeo deve ter entre 10 e 60 segundos")
    if (!validateFirstBytes(contentType, firstBytesBase64)) return jsonError("Arquivo de vídeo inválido")

    await verifyItemAccess(itemType, itemId, user)

    const ext = VIDEO_MIME_TO_EXT[contentType]
    const folder = itemType === "product" ? "products" : "services"
    const videoKey = `users/${user.id}/${folder}/${itemId}.${ext}`
    const thumbnailKey = `users/${user.id}/${folder}/${itemId}-thumbnail.jpg`

    const signedVideoContentType = contentType
    const signedThumbnailContentType = "image/jpeg"

    const [video, thumbnail] = await Promise.all([
      generateSignedUploadUrl({
        fileName: `${itemId}.${ext}`,
        fileType: signedVideoContentType,
        userId: user.id,
        key: videoKey,
        allowedMimeTypes: ALLOWED_VIDEO_MIME_TYPES,
        allowedExtensions: ALLOWED_VIDEO_EXTENSIONS,
        mimeToExt: VIDEO_MIME_TO_EXT,
        expiresIn: 120,
      }),
      generateSignedUploadUrl({
        fileName: `${itemId}-thumbnail.jpg`,
        fileType: signedThumbnailContentType,
        userId: user.id,
        key: thumbnailKey,
        expiresIn: 120,
      }),
    ])

    console.info("[R2 Video Upload] Presigned URLs geradas", {
      videoKey,
      thumbnailKey,
      signedVideoContentType,
      signedThumbnailContentType,
    })

    return NextResponse.json({
      video,
      thumbnail,
      signedVideoContentType,
      signedThumbnailContentType,
      maxThumbnailSize: MAX_FILE_SIZE,
    })
  } catch (error: any) {
    console.error("[Video Upload] Error:", error)
    return jsonError(error?.message || "Erro ao gerar URL de upload", 500)
  }
}

