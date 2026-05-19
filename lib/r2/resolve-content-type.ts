import {
  ALLOWED_VIDEO_MIME_TYPES,
  VIDEO_MIME_TO_EXT,
} from "@/lib/r2/config"

/**
 * Canonical Content-Type for R2 presigned PUT.
 * Must match exactly what the client sends in the Content-Type header.
 */
export function resolveVideoUploadContentType(contentType: string, filename: string): string {
  const trimmed = (contentType || "").trim()
  if (ALLOWED_VIDEO_MIME_TYPES.includes(trimmed as (typeof ALLOWED_VIDEO_MIME_TYPES)[number])) {
    return trimmed
  }

  const dot = filename.lastIndexOf(".")
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : ""
  for (const [mime, extension] of Object.entries(VIDEO_MIME_TO_EXT)) {
    if (`.${extension}` === ext) return mime
  }

  return trimmed
}
