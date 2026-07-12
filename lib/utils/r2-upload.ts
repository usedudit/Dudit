/**
 * Utilitário para fazer upload em R2 sem expor credentials
 * Usa endpoint backend para gerar presigned URLs
 *
 * SECURITY:
 * - Client-side validation (defense-in-depth, server is authoritative)
 * - Load dynamic validation rules from config
 */

import {
  ALL_ALLOWED_MIME_TYPES,
  getUploadKindFromMimeType,
  getUploadValidationRules,
} from "@/lib/r2/config"

export async function getPresignedUploadUrl(
  filename: string,
  contentType: string,
  fileSize?: number
): Promise<{ uploadUrl: string; key: string; publicUrl: string; contentType: string } | null> {
  try {
    // Client-side pre-validation (defense-in-depth)
    const kind = getUploadKindFromMimeType(contentType)
    if (!kind || !ALL_ALLOWED_MIME_TYPES.includes(contentType as any)) {
      console.error("[R2] Tipo de arquivo não permitido:", contentType)
      return null
    }

    const rules = getUploadValidationRules(kind)
    if (fileSize && fileSize > rules.maxSize) {
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
  presignedData: { uploadUrl: string; key: string; publicUrl: string; contentType: string }
): Promise<string | null> {
  try {
    const signedContentType = presignedData.contentType || file.type

    // Client-side pre-validation
    const kind = getUploadKindFromMimeType(signedContentType)
    if (!kind || !ALL_ALLOWED_MIME_TYPES.includes(signedContentType as any)) {
      console.error("[R2] Tipo de arquivo não permitido:", signedContentType)
      return null
    }

    const rules = getUploadValidationRules(kind)
    if (file.size > rules.maxSize) {
      console.error("[R2] Arquivo muito grande:", file.size)
      return null
    }

    console.log("[R2UploadDebug] before PUT", {
      fileName: file.name,
      fileType: file.type,
      signedExpectedContentType: signedContentType,
      actualContentType: file.type,
      uploadUrl: presignedData.uploadUrl.split("?")[0],
    })

    const res = await fetch(presignedData.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": signedContentType },
      body: file,
    })

    console.log("[R2UploadDebug] after PUT", {
      fileName: file.name,
      status: res.status,
      statusText: res.statusText,
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
