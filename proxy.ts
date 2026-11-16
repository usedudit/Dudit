import { NextResponse, type NextRequest } from "next/server"
import { middleware as supabaseMiddleware } from "@/lib/supabase/middleware"

/** Request proxy for security checks and session handling. */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const isStaticLegalOrHelpPage =
    path.startsWith("/institucional/") ||
    path.startsWith("/ajuda/") ||
    path === "/blog" ||
    path.startsWith("/blog/")

  if (isStaticLegalOrHelpPage) {
    return NextResponse.next()
  }

  return supabaseMiddleware(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|monitoring|~offline|manifest\\.webmanifest|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)",
  ],
}
