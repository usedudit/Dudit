import "server-only"

type HeaderReader = {
  get(name: string): string | null
}

function normalizeCandidate(value: string | null): string | null {
  const candidate = value?.trim()
  if (!candidate || candidate.length > 64 || /[\r\n]/.test(candidate)) {
    return null
  }
  return candidate
}

/** Resolve IPs only from the platform or an explicitly trusted proxy. */
export function getTrustedClientIP(
  headers: HeaderReader,
  platformIP?: string | null,
): string {
  const platformCandidate = normalizeCandidate(platformIP || null)
  if (platformCandidate) {
    return platformCandidate
  }

  if (process.env.TRUSTED_PROXY_HEADERS !== "true") {
    return "unknown"
  }

  // Cloudflare overwrites this header at the trusted edge. X-Forwarded-For
  // and X-Real-IP are intentionally not accepted because clients can supply them.
  return normalizeCandidate(headers.get("cf-connecting-ip")) || "unknown"
}
