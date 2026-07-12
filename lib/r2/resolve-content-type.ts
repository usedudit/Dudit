import {
  ALL_ALLOWED_MIME_TYPES,
  ALL_MIME_TO_EXT,
  UploadKind,
  getUploadValidationRules,
} from "./config"

/**
 * Resolves safe/canonical Content-Type based on filename and requested/actual type.
 */
export function resolveUploadContentType(
  contentType: string,
  filename: string,
  kind?: UploadKind
): string {
  const trimmed = (contentType || "").trim()

  if (kind) {
    const rules = getUploadValidationRules(kind)
    if (rules.allowedMimeTypes.includes(trimmed as any)) {
      return trimmed
    }
    const dot = filename.lastIndexOf(".")
    const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : ""
    for (const [mime, extension] of Object.entries(rules.mimeToExt)) {
      if (`.${extension}` === ext) return mime
    }
  } else {
    if (ALL_ALLOWED_MIME_TYPES.includes(trimmed as any)) {
      return trimmed
    }
    const dot = filename.lastIndexOf(".")
    const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : ""
    for (const [mime, extension] of Object.entries(ALL_MIME_TO_EXT)) {
      if (`.${extension}` === ext) return mime
    }
  }

  return trimmed
}

/**
 * Backward-compatible helper for videos.
 */
export function resolveVideoUploadContentType(contentType: string, filename: string): string {
  return resolveUploadContentType(contentType, filename, "video")
}
