import { type NextRequest } from "next/server"
import { middleware as supabaseMiddleware } from "@/lib/supabase/middleware"

/**
 * Root middleware for the Dudit application.
 * delegates to the unified Supabase middleware in lib/supabase/middleware.ts.
 */
export async function middleware(request: NextRequest) {
  return await supabaseMiddleware(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (svg, png, jpg, jpeg, gif, webp, etc.)
     * - ajuda/* (static help pages - no auth/CSP needed)
     * - institucional/* (static institutional pages)
     * - ~offline (PWA offline page)
     * - manifest.webmanifest (PWA manifest)
     * - sitemap.xml, robots.txt (SEO files)
     */
    "/((?!_next/static|_next/image|favicon.ico|ajuda|institucional|~offline|manifest\\.webmanifest|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)",
  ],
}
