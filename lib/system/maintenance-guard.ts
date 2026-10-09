import { NextResponse, type NextRequest } from "next/server"

interface CachedMaintenance {
  enabled: boolean
  message: string
  estimated_end: string | null
  allow_admin_bypass: boolean
  bypass_token: string
}

const EXEMPT_PREFIXES = [
  "/manutencao",
  "/ddt-admin",
  "/api/health",
  "/api/monitoring",
  "/api/internal",
  "/api/cron",
  "/api/webhooks",
  "/api/whatsapp",
  "/api/mercadopago",
  "/api/r2",
  "/api/assets",
  "/api/system",
  "/_next",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
  "/~offline",
]

const BYPASS_COOKIE_NAME = "ddt_maint_bypass"
const LEGACY_DEFAULT_BYPASS_TOKEN = "dudit_sec_bypass"

function isValidBypassToken(candidate: string | null | undefined, configuredToken: string | null | undefined): boolean {
  return Boolean(
    candidate &&
    configuredToken &&
    configuredToken !== LEGACY_DEFAULT_BYPASS_TOKEN &&
    candidate === configuredToken,
  )
}

/**
 * Checks if a request path should bypass maintenance mode checks entirely.
 */
function isExemptPath(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

let memoryCache: { data: CachedMaintenance | null; expiresAt: number } | null = null
const MAINTENANCE_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes local in-memory cache (invalidated on-demand via admin toggle)

export function clearMaintenanceMemoryCache(): void {
  memoryCache = null
}

/**
 * Fetch maintenance status from Upstash Redis REST API (Edge compatible).
 * Fails OPEN (returns disabled) if Redis is down, unreachable, or times out.
 * Uses Next.js Data Cache ('system-maintenance') + local memory cache to avoid unnecessary Redis calls.
 */
async function fetchMaintenanceStatus(): Promise<CachedMaintenance | null> {
  const now = Date.now()
  if (memoryCache && memoryCache.expiresAt > now) {
    return memoryCache.data
  }

  const kvUrl = process.env.KV_REST_API_URL
  const kvToken = process.env.KV_REST_API_TOKEN

  if (!kvUrl || !kvToken || kvUrl.includes("build.stub")) {
    return null
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 400) // 400ms max latency budget

    const res = await fetch(`${kvUrl}/get/system:maintenance`, {
      headers: {
        Authorization: `Bearer ${kvToken}`,
      },
      signal: controller.signal,
      next: { revalidate: 3600, tags: ['system-maintenance'] },
    })

    clearTimeout(timeoutId)

    if (!res.ok) return null

    const data = await res.json()
    let result: CachedMaintenance | null = null
    if (data?.result) {
      const parsed = typeof data.result === "string" ? JSON.parse(data.result) : data.result
      if (parsed && typeof parsed === "object" && parsed.enabled === true) {
        result = parsed as CachedMaintenance
      }
    }

    memoryCache = { data: result, expiresAt: now + MAINTENANCE_CACHE_TTL_MS }
    return result
  } catch {
    // Fail OPEN on network errors or timeouts
    return null
  }
}

/**
 * Evaluates whether the incoming request should be blocked by Maintenance Mode.
 * Returns a NextResponse (503) if blocked, or null if the request can continue.
 */
export async function evaluateMaintenanceMode(request: NextRequest): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname

  // 1. If path is exempt, allow immediately without Redis lookup
  if (isExemptPath(pathname)) {
    return null
  }

  // 2. Query maintenance state from Edge Redis
  const maintenance = await fetchMaintenanceStatus()
  if (!maintenance || !maintenance.enabled) {
    return null
  }

  // 3. Check for Admin / Developer Bypass
  if (maintenance.allow_admin_bypass) {
    // Check bypass cookie
    const bypassCookie = request.cookies.get(BYPASS_COOKIE_NAME)?.value
    if (isValidBypassToken(bypassCookie, maintenance.bypass_token)) {
      return null
    }

    // Check query param bypass (e.g. ?bypass=dudit_sec_bypass)
    const bypassQuery = request.nextUrl.searchParams.get("bypass") || request.nextUrl.searchParams.get("maint_bypass")
    if (isValidBypassToken(bypassQuery, maintenance.bypass_token)) {
      // Set cookie and redirect to clean URL
      const cleanUrl = new URL(request.url)
      cleanUrl.searchParams.delete("bypass")
      cleanUrl.searchParams.delete("maint_bypass")
      const response = NextResponse.redirect(cleanUrl)
      response.cookies.set({
        name: BYPASS_COOKIE_NAME,
        value: bypassQuery!,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
      })
      return response
    }
  }

  // 4. Handle API / Server Action requests with 503 JSON
  const isApi = pathname.startsWith("/api")
  const isServerAction = request.headers.has("Next-Action")

  if (isApi || isServerAction) {
    return new NextResponse(
      JSON.stringify({
        error: "service_unavailable",
        message: maintenance.message || "A plataforma Dudit está temporariamente em manutenção programada.",
        estimated_end: maintenance.estimated_end,
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "3600",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    )
  }

  // 5. Handle Page Navigation with 503 rewrite to /manutencao
  const maintenanceUrl = new URL("/manutencao", request.url)
  const response = NextResponse.rewrite(maintenanceUrl, {
    status: 503,
    headers: {
      "Retry-After": "3600",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow",
    },
  })

  return response
}
