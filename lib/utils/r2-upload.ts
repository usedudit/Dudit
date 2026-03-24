/**
 * Utilitário para fazer upload em R2 sem expor credentials
 * Usa endpoint backend para gerar presigned URLs
 *
 * SECURITY:
 * - Client-side type validation (defense-in-depth, server is authoritative)
 * - Server enforces all validation via /api/r2/presigned-url
 */

const CLIENT_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"]
const CLIENT_MAX_SIZE = 5 * 1024 * 1024 // 5MB

export async function getPresignedUploadUrl(
  filename: string,
  contentType: string,
  fileSize?: number
): Promise<{ uploadUrl: string; key: string; publicUrl: string } | null> {
  try {
    // Client-side pre-validation (defense-in-depth)
    if (!CLIENT_ALLOWED_TYPES.includes(contentType)) {
      console.error("[R2] Tipo de arquivo não permitido:", contentType)
      return null
    }

    if (fileSize && fileSize > CLIENT_MAX_SIZE) {
      console.error("[R2] Arquivo muito grande:", fileSize)
      return null
    }

    const res = await fetch("/api/r2/presigned-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, contentType, fileSize }),
    })

    if (!res.ok) {
      console.error("[R2] Error getting presigned URL:", res.status)
      return null
    }

    return res.json()
  } catch (err) {
    console.error("[R2] Error:", err)
    return null
  }
}

export async function uploadToR2(
  file: File,
  presignedData: { uploadUrl: string; key: string; publicUrl: string }
): Promise<string | null> {
  try {
    // Client-side pre-validation
    if (!CLIENT_ALLOWED_TYPES.includes(file.type)) {
      console.error("[R2] Tipo de arquivo não permitido:", file.type)
      return null
    }

    if (file.size > CLIENT_MAX_SIZE) {
      console.error("[R2] Arquivo muito grande:", file.size)
      return null
    }

    const res = await fetch(presignedData.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    })

    if (!res.ok) {
      console.error("[R2] Upload failed:", res.status)
      return null
    }

    return presignedData.publicUrl
  } catch (err) {
    console.error("[R2] Upload error:", err)
    return null
  }
}
