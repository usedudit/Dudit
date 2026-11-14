import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"

export type ApplicationAccessLogInput = {
  ipAddress: string
  country: string | null
  method: string
  path: string
  statusCode: number
  userAgent: string | null
  cloudflareRayId: string | null
}

const SKIP_LOG_PATHS = new Set([
  "/api/health",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/~offline",
])

const UPTIME_BOT_PATTERNS = [
  "sentryuptimebot",
  "uptimerobot",
  "better uptime",
  "betteruptime",
  "pingdom",
  "datadog",
  "statuscake",
  "healthcheck",
  "uptime-kuma",
  "site24x7",
  "freshping",
]

/**
 * Returns true if the request is an automated health/uptime probe or static metadata,
 * which shouldn't generate noise or consume database writes for application access logs.
 */
export function shouldSkipAccessLog(pathname: string, userAgent?: string | null): boolean {
  if (SKIP_LOG_PATHS.has(pathname) || pathname.startsWith("/api/monitoring")) {
    return true
  }

  if (userAgent) {
    const ua = userAgent.toLowerCase()
    for (const pattern of UPTIME_BOT_PATTERNS) {
      if (ua.includes(pattern)) return true
    }
  }

  return false
}

/**
 * Obsolete access logger.
 * Deactivated to protect DB performance and prevent 404 warnings after table removal.
 */
export async function recordApplicationAccess(_input: ApplicationAccessLogInput): Promise<void> {
  // No-op
}

export function sanitizeAccessLogPath(pathname: string): string {
  const sensitiveRoutes = ["/quote/", "/os/", "/reembolso/", "/invite/", "/entregadores/convite/"]
  for (const prefix of sensitiveRoutes) {
    if (pathname.startsWith(prefix)) return `${prefix}[redacted]`
  }

  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[id]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]")
    .slice(0, 512)
}
