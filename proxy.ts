import { after, NextResponse, type NextRequest } from "next/server"
import { middleware as supabaseMiddleware } from "@/lib/supabase/middleware"
import { getTrustedClientCountry, getTrustedClientIP } from "@/lib/security/client-ip"
import { recordApplicationAccess, sanitizeAccessLogPath, shouldSkipAccessLog } from "@/lib/security/application-access-log"

function scheduleAccessLog(request: NextRequest, statusCode: number): void {
  const pathname = request.nextUrl.pathname
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null

  if (shouldSkipAccessLog(pathname, userAgent)) {
    return
  }

  const platformIp = (request as NextRequest & { ip?: string }).ip
  const input = {
    ipAddress: getTrustedClientIP(request.headers, platformIp),
    country: getTrustedClientCountry(request.headers),
    method: request.method.slice(0, 12),
    path: sanitizeAccessLogPath(pathname),
    statusCode,
    userAgent,
    cloudflareRayId: request.headers.get("cf-ray")?.slice(0, 100) ?? null,
  }

  after(() => recordApplicationAccess(input))
}

/** Request proxy for security checks and minimal access logging. */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const isStaticLegalOrHelpPage = path.startsWith("/institucional/") || path.startsWith("/ajuda/")

  try {
    const response = isStaticLegalOrHelpPage
      ? NextResponse.next()
      : await supabaseMiddleware(request)
    scheduleAccessLog(request, response.status)
    return response
  } catch (error) {
    scheduleAccessLog(request, 500)
    throw error
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|monitoring|~offline|manifest\\.webmanifest|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)",
  ],
}
