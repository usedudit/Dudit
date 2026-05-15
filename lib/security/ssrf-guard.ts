/**
 * Production-grade SSRF (Server-Side Request Forgery) protection module.
 *
 * Defense-in-depth layers:
 * 1. URL parsing via `new URL()` - catches malformed/smuggled URLs
 * 2. Protocol enforcement - only http: and https:
 * 3. Credential rejection - no user:pass in URLs
 * 4. Hostname allowlist - strict allowlist of known API domains
 * 5. Raw IP detection - blocks decimal, hex, octal IP bypasses
 * 6. DNS resolution - resolves hostname and validates resolved IP
 * 7. Private IP blocking - blocks loopback, link-local, RFC1918, metadata
 * 8. Manual redirect following - re-validates every redirect target
 * 9. Timeout enforcement - AbortController-based hard timeout
 * 10. Response size cap - prevents streaming/memory abuse
 *
 * @module ssrf-guard
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024 // 10 MB
const DEFAULT_MAX_REDIRECTS = 5

/**
 * Strict hostname allowlist of all external APIs the application communicates with.
 * Any fetch to a hostname NOT in this list is blocked.
 *
 * WHY: This is the strongest single SSRF defense. Even if an attacker controls
 * a URL parameter, they cannot reach arbitrary hosts.
 */
const ALLOWED_HOSTNAMES: ReadonlySet<string> = new Set([
  // ── Payment (Mercado Pago) ──
  "api.mercadopago.com",

  // ── Email (Unosend) ──
  "api.unosend.co",

  // ── Fiscal (Nuvem Fiscal, ViaCEP, CNPJA) ──
  "auth.nuvemfiscal.com.br",
  "api.nuvemfiscal.com.br",
  "viacep.com.br",
  "open.cnpja.com",

  // ── AI / Moderation ──
  "api.cloudflare.com",
  "api.sightengine.com",
  "generativelanguage.googleapis.com",

  // ── Geocoding / Maps ──
  "api.mapbox.com",
  "nominatim.openstreetmap.org",
  "router.project-osrm.org",

  // ── Our CDN (R2 image hosting) ──
  "img.dudit.com.br",
])

/**
 * Hostnames allowed specifically for image URL moderation (Sightengine).
 * Only our own CDN domain - never allow arbitrary external image URLs.
 */
const IMAGE_URL_ALLOWED_HOSTNAMES: ReadonlySet<string> = new Set([
  "img.dudit.com.br",
])

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class SSRFError extends Error {
  constructor(message: string) {
    super(`[SSRF_GUARD] ${message}`)
    this.name = "SSRFError"
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRIVATE IP DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if an IPv4 address is in a private/reserved range.
 *
 * Blocked ranges:
 * - 0.0.0.0/8        - "This network"
 * - 10.0.0.0/8       - Private (RFC 1918)
 * - 127.0.0.0/8      - Loopback
 * - 169.254.0.0/16   - Link-local (includes AWS metadata 169.254.169.254)
 * - 172.16.0.0/12    - Private (RFC 1918)
 * - 192.168.0.0/16   - Private (RFC 1918)
 * - 224.0.0.0/4      - Multicast
 * - 240.0.0.0/4      - Reserved
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".")
  if (parts.length !== 4) return false

  const nums = parts.map(Number)
  if (nums.some((n) => isNaN(n) || n < 0 || n > 255)) return false

  const [a, b] = nums

  if (a === 0) return true                             // 0.0.0.0/8
  if (a === 10) return true                            // 10.0.0.0/8
  if (a === 127) return true                           // 127.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true    // 100.64.0.0/10 (CGNAT, cloud internal)
  if (a === 169 && b === 254) return true              // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true     // 172.16.0.0/12
  if (a === 192 && b === 168) return true              // 192.168.0.0/16
  if (a >= 224) return true                            // 224.0.0.0/4 + 240.0.0.0/4

  return false
}

/**
 * Check if an IPv6 address is private/reserved.
 *
 * Blocked:
 * - ::1              - Loopback
 * - ::               - Unspecified
 * - fe80::/10        - Link-local
 * - fc00::/7         - Unique local (fd00::/8 included)
 * - ::ffff:x.x.x.x  - IPv4-mapped (checked recursively)
 */
function isPrivateIPv6(ip: string): boolean {
  // Strip zone ID (%25... or %...) before analysis
  // WHY: IPv6 zone IDs like "::1%25lo" would bypass exact "::1" match
  const normalized = ip.toLowerCase().trim().replace(/%.*$/, "")

  if (normalized === "::1") return true
  if (normalized === "::") return true
  if (normalized.startsWith("fe80:")) return true
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true

  // IPv4-mapped IPv6: ::ffff:127.0.0.1
  if (normalized.startsWith("::ffff:")) {
    const ipv4Part = normalized.substring(7)
    if (isPrivateIPv4(ipv4Part)) return true
  }

  return false
}

/**
 * Determine if an IP address (v4 or v6) is private/reserved.
 */
function isPrivateIP(ip: string): boolean {
  return isPrivateIPv4(ip) || isPrivateIPv6(ip)
}

// ═══════════════════════════════════════════════════════════════════════════════
// RAW IP ADDRESS DETECTION (anti-bypass)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect if a hostname is a raw IP address in any notation.
 *
 * WHY: Attackers use non-standard IP representations to bypass hostname checks:
 * - Decimal:  2130706433 → 127.0.0.1
 * - Hex:      0x7f000001 → 127.0.0.1
 * - Octal:    017700000001 → 127.0.0.1
 * - Mixed:    127.0.0x0.1
 *
 * The URL constructor normalizes SOME of these, but not all consistently
 * across runtimes. We detect and block all raw IP forms as a safety measure.
 */
function isRawIPAddress(hostname: string): boolean {
  // Standard dotted IPv4: 127.0.0.1
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true

  // IPv6 (brackets already stripped by URL parser): ::1, fe80::1
  if (hostname.includes(":")) return true

  // Pure decimal: 2130706433
  if (/^\d+$/.test(hostname) && hostname.length > 0) return true

  // Hex: 0x7f000001 or 0X7F000001
  if (/^0x[0-9a-f]+$/i.test(hostname)) return true

  // Octal: 0177.0.0.01 or segments starting with 0
  if (/^0[0-7]+$/.test(hostname)) return true

  // Mixed octal-dotted: 0177.00.00.01
  if (/^(0[0-7]*\.)+0[0-7]*$/.test(hostname)) return true

  return false
}

// ═══════════════════════════════════════════════════════════════════════════════
// URL VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

interface UrlValidationResult {
  valid: boolean
  error?: string
  parsedUrl?: URL
}

/**
 * Validate a URL against SSRF rules.
 *
 * Steps:
 * 1. Parse with `new URL()` - rejects malformed URLs, normalizes encoding
 * 2. Protocol check - only http: and https:
 * 3. No embedded credentials - rejects user:pass@host
 * 4. Non-empty hostname
 * 5. Raw IP detection + private IP check
 * 6. Hostname allowlist enforcement
 */
function validateUrl(
  rawUrl: string,
  allowedHostnames: ReadonlySet<string>,
): UrlValidationResult {
  // 1. Parse URL - catches protocol smuggling, malformed encoding
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return {
      valid: false,
      error: `Invalid URL: ${rawUrl.substring(0, 100)}`,
    }
  }

  // 2. Protocol check - REJECT everything except http: and https:
  // WHY: Blocks file://, gopher://, ftp://, data:, javascript:, etc.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      error: `Blocked protocol: ${parsed.protocol}`,
    }
  }

  // 3. No credentials in URL - prevents user@attacker.com confusion
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: "URLs with embedded credentials are not allowed",
    }
  }

  // 4. Hostname must be present and normalized
  // Strip trailing dot (FQDN notation) to prevent bypass via "api.example.com."
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "")
  if (!hostname) {
    return { valid: false, error: "Missing hostname" }
  }

  // 5. Block raw IP addresses + check for private IPs
  // WHY: Even after URL parsing normalizes decimal/hex IPs to dotted notation,
  // we check the parsed hostname for private ranges. The raw IP check catches
  // any notation the parser didn't normalize.
  if (isRawIPAddress(hostname)) {
    if (isPrivateIP(hostname)) {
      return {
        valid: false,
        error: `Blocked private/reserved IP: ${hostname}`,
      }
    }
    // Even non-private raw IPs should be in the allowlist
  }

  // 6. Hostname allowlist - the strongest single defense
  if (!allowedHostnames.has(hostname)) {
    return {
      valid: false,
      error: `Hostname not in allowlist: ${hostname}`,
    }
  }

  return { valid: true, parsedUrl: parsed }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DNS RESOLUTION WITH IP VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve a hostname via DNS and validate the resolved IP is not private.
 *
 * WHY: Prevents DNS rebinding attacks where an allowlisted domain resolves
 * to an internal IP at request time. Also catches misconfigured DNS.
 *
 * Falls back gracefully in Edge runtime (where `dns` module is unavailable)
 * - in that case, the hostname allowlist is the sole defense (which is
 * sufficient since all our Edge-runtime fetches go to hardcoded public APIs).
 */
async function resolveAndValidateIP(
  hostname: string,
): Promise<{ valid: boolean; ip?: string; error?: string }> {
  try {
    // Dynamic import: `dns` is a Node.js built-in, unavailable in Edge runtime.
    // We obfuscate the import string to bypass Next.js static analysis which
    // otherwise fails the build for Edge routes even inside a try-catch.
    if (typeof process !== "undefined" && process.env.NEXT_RUNTIME === "edge") {
      return { valid: true }
    }

    const dnsStr = "dns"
    const dnsModule = await import(/* webpackIgnore: true */ dnsStr)
    const { address } = await dnsModule.promises.lookup(hostname)

    if (isPrivateIP(address)) {
      return {
        valid: false,
        error: `DNS resolved to private/reserved IP: ${hostname} → ${address}`,
      }
    }

    return { valid: true, ip: address }
  } catch (err: any) {
    // Edge runtime: dns module not available - acceptable, rely on allowlist
    if (
      err?.code === "MODULE_NOT_FOUND" ||
      err?.code === "ERR_MODULE_NOT_FOUND" ||
      err?.message?.includes("Module not found")
    ) {
      return { valid: true }
    }

    // Genuine DNS resolution failure
    return {
      valid: false,
      error: `DNS resolution failed for ${hostname}: ${err?.message || "Unknown error"}`,
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE SIZE LIMITER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Read a response body while enforcing a hard byte-size cap.
 *
 * WHY: Prevents an attacker-controlled endpoint from streaming infinite data
 * to exhaust server memory (even with a timeout, a slow stream could
 * accumulate unbounded data).
 */
async function readResponseWithSizeLimit(
  response: Response,
  maxBytes: number,
): Promise<Response> {
  // Fast path: check Content-Length header
  const contentLength = response.headers.get("content-length")
  if (contentLength) {
    const declared = parseInt(contentLength, 10)
    if (!isNaN(declared) && declared > maxBytes) {
      throw new SSRFError(
        `Response Content-Length ${declared} exceeds limit of ${maxBytes} bytes`,
      )
    }
  }

  // No body - return as-is
  if (!response.body) return response

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        reader.cancel()
        throw new SSRFError(
          `Response body exceeded ${maxBytes} bytes (read ${totalBytes} so far)`,
        )
      }
      chunks.push(value)
    }
  } catch (err) {
    // Re-throw SSRFError, wrap others
    if (err instanceof SSRFError) throw err
    throw new SSRFError(`Error reading response body: ${(err as Error).message}`)
  }

  // Reconstruct the response with the buffered body
  const blob = new Blob(chunks as BlobPart[])
  return new Response(blob, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// REDIRECT STATUS CHECK
// ═══════════════════════════════════════════════════════════════════════════════

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAFE FETCH - Main export
// ═══════════════════════════════════════════════════════════════════════════════

export interface SafeFetchOptions extends Omit<RequestInit, "redirect"> {
  /** Request timeout in milliseconds. Default: 10000 (10s) */
  timeoutMs?: number
  /** Maximum response body size in bytes. Default: 10485760 (10MB). Set 0 to disable. */
  maxResponseBytes?: number
  /** Maximum number of redirects to follow. Default: 5. Set 0 to reject redirects. */
  maxRedirects?: number
  /** Override the default hostname allowlist. */
  allowedHostnames?: ReadonlySet<string>
  /**
   * Skip DNS resolution check. Use only when:
   * - Running in Edge runtime (dns module unavailable)
   * - The hostname is hardcoded and trusted
   * Default: false
   */
  skipDnsCheck?: boolean
}

/**
 * SSRF-safe drop-in replacement for `fetch()`.
 *
 * Validates the target URL against a strict hostname allowlist, resolves DNS
 * to check for private IPs, follows redirects manually with re-validation,
 * and enforces timeout and response size limits.
 *
 * @throws {SSRFError} if any SSRF check fails
 *
 * @example
 * ```ts
 * // Basic usage - validates hostname is in allowlist
 * const res = await safeFetch("https://api.mercadopago.com/v1/payments", {
 *   method: "POST",
 *   headers: { Authorization: `Bearer ${token}` },
 *   body: JSON.stringify(payload),
 * })
 *
 * // With custom options
 * const res = await safeFetch(url, {
 *   timeoutMs: 5000,
 *   maxResponseBytes: 1024 * 1024, // 1 MB
 *   maxRedirects: 0, // reject any redirects
 * })
 * ```
 */
export async function safeFetch(
  url: string | URL,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    allowedHostnames: customAllowlist = ALLOWED_HOSTNAMES,
    skipDnsCheck = false,
    signal: externalSignal,
    ...fetchOptions
  } = options

  const rawUrl = typeof url === "string" ? url : url.toString()

  // ── Step 1: Validate URL structure, protocol, hostname ──
  const validation = validateUrl(rawUrl, customAllowlist)
  if (!validation.valid) {
    throw new SSRFError(validation.error!)
  }

  // ── Step 2: DNS resolution → private IP check ──
  // WHY: Even allowlisted domains could resolve to internal IPs via DNS rebinding.
  if (!skipDnsCheck) {
    const dnsResult = await resolveAndValidateIP(validation.parsedUrl!.hostname)
    if (!dnsResult.valid) {
      throw new SSRFError(dnsResult.error!)
    }
  }

  // ── Step 3: Set up timeout via AbortController ──
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  // Chain external abort signal if provided
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true })
    }
  }

  try {
    // ── Step 4: Fetch with redirect: "manual" ──
    // WHY: Default "follow" mode would silently follow redirects to internal IPs.
    // Manual mode lets us validate each redirect target.
    let response = await fetch(rawUrl, {
      ...fetchOptions,
      redirect: "manual",
      signal: controller.signal,
    })

    // ── Step 5: Manual redirect following with full re-validation ──
    let redirectCount = 0
    while (isRedirectStatus(response.status) && redirectCount < maxRedirects) {
      redirectCount++

      const location = response.headers.get("location")
      if (!location) {
        break // No Location header - stop redirecting
      }

      // Resolve relative redirect URLs against the original URL
      let redirectUrl: string
      try {
        redirectUrl = new URL(location, rawUrl).toString()
      } catch {
        throw new SSRFError(`Malformed redirect Location: ${location.substring(0, 100)}`)
      }

      // Re-validate redirect target with the SAME SSRF rules
      const redirectValidation = validateUrl(redirectUrl, customAllowlist)
      if (!redirectValidation.valid) {
        throw new SSRFError(
          `Redirect blocked (hop ${redirectCount}): ${redirectValidation.error}`,
        )
      }

      // DNS check on redirect target
      if (!skipDnsCheck) {
        const redirectDns = await resolveAndValidateIP(
          redirectValidation.parsedUrl!.hostname,
        )
        if (!redirectDns.valid) {
          throw new SSRFError(
            `Redirect DNS blocked (hop ${redirectCount}): ${redirectDns.error}`,
          )
        }
      }

      // Follow the redirect
      response = await fetch(redirectUrl, {
        ...fetchOptions,
        redirect: "manual",
        signal: controller.signal,
      })
    }

    // Too many redirects
    if (isRedirectStatus(response.status)) {
      throw new SSRFError(`Too many redirects (followed ${redirectCount}, max: ${maxRedirects})`)
    }

    // ── Step 6: Enforce response size limit ──
    if (maxResponseBytes > 0) {
      response = await readResponseWithSizeLimit(response, maxResponseBytes)
    }

    return response
  } catch (err) {
    // Convert AbortError to a more descriptive error
    if (err instanceof Error && err.name === "AbortError") {
      throw new SSRFError(`Request timed out after ${timeoutMs}ms: ${rawUrl.substring(0, 100)}`)
    }
    // Re-throw SSRFError as-is
    if (err instanceof SSRFError) throw err
    // Wrap unknown errors
    throw new SSRFError(`Fetch failed: ${(err as Error).message}`)
  } finally {
    clearTimeout(timeoutId)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATE IMAGE URL (for Sightengine moderateImageWithUrl)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate that an image URL points to our own CDN only.
 *
 * WHY: `moderateImageWithUrl()` passes the URL to Sightengine's API, which
 * then fetches the image. An attacker could abuse this to make Sightengine
 * hit internal targets (SSRF via 3rd-party proxy). Restricting to our CDN
 * domain eliminates this vector entirely.
 */
export function validateImageUrl(url: string): { valid: boolean; error?: string } {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { valid: false, error: "Invalid image URL format" }
  }

  // Protocol: HTTPS only for images
  if (parsed.protocol !== "https:") {
    return { valid: false, error: "Image URL must use HTTPS" }
  }

  // No credentials
  if (parsed.username || parsed.password) {
    return { valid: false, error: "Image URL must not contain credentials" }
  }

  // Hostname must be our CDN
  const hostname = parsed.hostname.toLowerCase()
  if (!IMAGE_URL_ALLOWED_HOSTNAMES.has(hostname)) {
    return {
      valid: false,
      error: `Image URL domain not allowed: ${hostname}. Only our CDN (${[...IMAGE_URL_ALLOWED_HOSTNAMES].join(", ")}) is permitted.`,
    }
  }

  return { valid: true }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { ALLOWED_HOSTNAMES }
export type { UrlValidationResult }
