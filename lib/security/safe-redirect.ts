/**
 * Sanitizes and validates internal redirect paths to prevent Open Redirect attacks.
 * Accepts only relative, same-origin paths starting with a single '/' and devoid of
 * protocol schemes, backslashes, or control characters.
 */
export function getSafeRedirectPath(rawPath: string | null | undefined, fallback = "/"): string {
  if (!rawPath || typeof rawPath !== "string") {
    return fallback
  }

  const trimmed = rawPath.trim()
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.includes("\\") ||
    /[\x00-\x1F\x7F]/.test(trimmed)
  ) {
    return fallback
  }

  // Reject URL-encoded backslashes (%5c or %5C)
  if (/%5c/i.test(trimmed)) {
    return fallback
  }

  try {
    const decoded = decodeURIComponent(trimmed)
    if (decoded.includes("\\") || decoded.startsWith("//")) {
      return fallback
    }
  } catch {
    return fallback
  }

  try {
    const dummyOrigin = "https://dudit.local"
    const parsed = new URL(trimmed, dummyOrigin)

    // Ensure the URL didn't escape to an external host
    if (parsed.origin !== dummyOrigin) {
      return fallback
    }

    // Ensure pathname is valid and still starts with single '/'
    if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) {
      return fallback
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

