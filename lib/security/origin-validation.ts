import "server-only"

const PRODUCTION_ORIGINS = [
  "https://dudit.com.br",
  "https://www.dudit.com.br",
]

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"])

/** Validate Server Action origins without trusting Host or X-Forwarded-Host. */
export function isAllowedServerActionOrigin(
  rawOrigin: string,
  appUrl: string,
  isDevelopment: boolean,
): boolean {
  let originUrl: URL
  try {
    originUrl = new URL(rawOrigin)
  } catch {
    return false
  }

  const allowedOrigins = new Set(PRODUCTION_ORIGINS)
  try {
    allowedOrigins.add(new URL(appUrl).origin)
  } catch {
    // The caller supplies a safe production fallback when appUrl is invalid.
  }

  if (allowedOrigins.has(originUrl.origin)) {
    return true
  }

  // Keep local development working, but never allow loopback origins in prod.
  return (
    isDevelopment &&
    originUrl.protocol === "http:" &&
    LOOPBACK_HOSTNAMES.has(originUrl.hostname)
  )
}
