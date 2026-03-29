import "server-only"
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { RateLimitCategory, getLimiter, RATE_LIMIT_CONFIGS } from "@/lib/rate-limiter"

// ============================================================================
// CONFIGURAÇÃO DE ROTAS
// ============================================================================
const PUBLIC_PATHS = [
  "/",
  "/auth", // Cobre /auth/login, /auth/sign-up, etc
  "/explorar",
  "/partners",
  "/services",
  "/payment",
  "/api",
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/")
  )
}

// ============================================================================
// MIDDLEWARE PRINCIPAL
// ============================================================================
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // 🚀 EARLY EXIT pra HEAD requests
  if (request.method === "HEAD") {
    return NextResponse.next()
  }

  // 🚀 Ignora prefetch (Next.js)
  const isPrefetch =
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("next-router-prefetch")

  if (isPrefetch) {
    return NextResponse.next()
  }

  console.log(`[MIDDLEWARE] ${request.method} ${pathname}`)
  const forwarded = request.headers.get("x-forwarded-for")
  const ip = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip") || "unknown"

  // 1. RATE LIMITING (APIs e Auth POST)
  // Uses category-based system with explicit limits
  if (pathname.startsWith("/api/") || (pathname.startsWith("/auth/") && request.method === "POST")) {
    const category = (pathname.startsWith("/auth/") && request.method === "POST")
      ? RateLimitCategory.AUTH_LOGIN
      : RateLimitCategory.API_GENERAL

    const config = RATE_LIMIT_CONFIGS[category]

    try {
      const limiter = getLimiter(category)
      const identifier = `ip:${ip}`
      const { success, reset } = await limiter.limit(identifier)

      if (!success) {
        const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
        return new NextResponse(
          JSON.stringify({
            error: "Muitas tentativas. Tente novamente em breve.",
            retryAfter,
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        )
      }
    } catch (error) {
      console.error("[MIDDLEWARE] Rate limit error:", error)
      // Auth routes fail closed, API routes fail open
      if (config.failClosed) {
        return new NextResponse(
          JSON.stringify({ error: "Serviço temporariamente indisponível." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      }
    }
  }

  // 2. SECURITY: CSP headers
  // Note: We use 'unsafe-inline' for script-src because Next.js App Router
  // generates inline scripts for hydration that cannot receive a nonce
  // without complex per-component propagation. This is the standard
  // approach for Next.js apps in production.

  const cspHeader = `
    default-src 'self';
    worker-src 'self' blob:;
    child-src 'self' blob:;
    script-src 'self' 'unsafe-inline' 'unsafe-eval'
        https://sdk.mercadopago.com 
        https://www.mercadopago.com 
        https://*.mercadopago.com 
        https://maps.googleapis.com 
        https://*.googleapis.com 
        https://*.google.com 
        https://*.gstatic.com 
        https://api.mapbox.com 
        https://cdn.jsdelivr.net 
        https://va.vercel-scripts.com 
        https://http2.mlstatic.com 
        https://*.mlstatic.com 
        https://secure.mlstatic.com
        https://auth.nuvemfiscal.com.br
        https://static.cloudflareinsights.com 
        https://*.cloudflare.com 
        https://accounts.google.com 
        https://apis.google.com;
    connect-src 'self' data: blob: 
        https://*.supabase.co ${process.env.NEXT_PUBLIC_SUPABASE_URL || ''} 
        https://api.mercadopago.com 
        https://checkout.mercadopago.com
        https://*.mercadopago.com 
        https://events.mercadopago.com 
        https://maps.googleapis.com 
        https://*.googleapis.com 
        https://*.google.com 
        https://api.mapbox.com 
        https://events.mapbox.com 
        https://*.tiles.mapbox.com 
        https://api.nuvemfiscal.com.br 
        https://auth.nuvemfiscal.com.br 
        https://http2.mlstatic.com 
        https://*.mlstatic.com 
        https://www.mercadolibre.com 
        https://api.mercadolibre.com
        https://www.google-analytics.com 
        https://stats.g.doubleclick.net 
        https://cloudflareinsights.com 
        https://*.cloudflare.com;
    frame-src 'self' 
        https://sdk.mercadopago.com 
        https://www.mercadopago.com 
        https://*.mercadopago.com 
        https://checkout.mercadopago.com
        https://accounts.google.com
        https://auth.nuvemfiscal.com.br 
        https://www.mercadolibre.com;
    img-src 'self' data: https: blob: 
        https://*.googleapis.com 
        https://*.gstatic.com 
        https://maps.gstatic.com 
        https://api.mapbox.com 
        https://*.tiles.mapbox.com 
        https://http2.mlstatic.com 
        https://*.mlstatic.com 
        https://*.r2.cloudflarestorage.com
        https://www.google-analytics.com 
        https://stats.g.doubleclick.net;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://api.mapbox.com;
    font-src 'self' https://fonts.gstatic.com data:;
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
  `
  const contentSecurityPolicyHeaderValue = cspHeader.replace(/\s{2,}/g, ' ').trim()

  // Prepara os headers iniciais
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicyHeaderValue)

  // 3. INICIA A RESPOSTA
  let response = NextResponse.next({
    request: { headers: requestHeaders }
  })

  // Aplica CSP na resposta imediatamente
  response.headers.set('Content-Security-Policy', contentSecurityPolicyHeaderValue)


  // Headers extras de segurança (Do seu proxy.js)
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-XSS-Protection", "1; mode=block")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()")
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none")


  // 4. CACHE-CONTROL HEADERS (Route-aware) — Must be set BEFORE auth block
  // Public marketplace pages: edge-cacheable with stale-while-revalidate
  // Private/auth pages: never cached
  const PRIVATE_PREFIXES = ["/erp", "/account", "/auth", "/cart", "/profile", "/my-orders", "/api", "/dashboard", "/payment", "/ddt-admin"]
  const PUBLIC_CACHEABLE_PATTERNS = ["/services", "/partners", "/produto"]

  const isPrivatePage = PRIVATE_PREFIXES.some(prefix => pathname.startsWith(prefix))
  const isPublicCacheable = !isPrivatePage && PUBLIC_CACHEABLE_PATTERNS.some(pattern => pathname.startsWith(pattern))

  if (isPrivatePage) {
    response.headers.set("Cache-Control", "private, no-store")
    response.headers.set("CDN-Cache-Control", "no-store")
  } else if (isPublicCacheable) {
    response.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400")
    response.headers.set("CDN-Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
  }

  // 5. SUPABASE AUTH (ONLY for routes that need it)
  // CRITICAL: Skip auth for public cacheable pages to avoid Set-Cookie headers
  // that would prevent Cloudflare from caching the response.
  const NEEDS_AUTH_CHECK = ["/erp", "/account", "/profile", "/my-orders", "/auth/login", "/select-erp", "/ddt-admin"]
  const needsAuthCheck = NEEDS_AUTH_CHECK.some(prefix => pathname === prefix || pathname.startsWith(prefix + "/"))

  if (needsAuthCheck) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (supabaseUrl && supabaseKey) {
      // OPTIMIZATION (PERF-01): Skip the expensive auth.getUser() call for POST requests (Server Actions)
      // on protected routes early. Server Actions handle their own authentication via requireUser(),
      // avoiding a redundant network call to Supabase Auth in the middleware.
      if (request.method === "POST" || request.headers.has("next-action")) {
        return response
      }

      const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            response = NextResponse.next({ request })
            // Re-apply ALL security headers on the new response
            response.headers.set('Content-Security-Policy', contentSecurityPolicyHeaderValue)
            response.headers.set("X-Content-Type-Options", "nosniff")
            response.headers.set("X-Frame-Options", "DENY")
            response.headers.set("X-XSS-Protection", "1; mode=block")
            response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
            response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()")
            response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
            // Re-apply Cache-Control for private pages
            response.headers.set("Cache-Control", "private, no-store")
            response.headers.set("CDN-Cache-Control", "no-store")

            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          },
        },
      })

      // Verifica usuário apenas para proteger rotas ERP
      try {
        const protectedPrefixes = ["/erp", "/account", "/profile", "/my-orders", "/select-erp", "/ddt-admin"]
        const isProtected = protectedPrefixes.some(prefix => pathname.startsWith(prefix))

        // FAST-FAIL: If it's a protected route and there are NO supabase cookies at all, 
        // don't even waste time calling auth.getUser()
        if (isProtected) {
          const hasAuthCookie = request.cookies.getAll().some(c => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
          if (!hasAuthCookie) {
            const url = request.nextUrl.clone()
            url.pathname = "/auth/login"
            return NextResponse.redirect(url)
          }
        }


        const { data: { user } } = await supabase.auth.getUser()

        // Se não estiver logado e tentar acessar rotas protegidas -> Manda pro Login
        if (!user && isProtected) {
          const url = request.nextUrl.clone()
          url.pathname = "/auth/login"
          return NextResponse.redirect(url)
        }

        // SECURITY: If already logged in and trying to access auth pages -> redirect to home
        // Exception: allow through if there's a ?next= param (e.g. invite flow) or ?mode=partner (partner registration)
        // Prevents duplicate login/signup attempts and confusing UX
        const authBlockedPaths = ["/auth/login"]
        const hasNextParam = request.nextUrl.searchParams.has("next")
        const hasModePartner = request.nextUrl.searchParams.get("mode") === "partner"

        if (user && !hasNextParam && !hasModePartner && authBlockedPaths.some(p => pathname === p || pathname.startsWith(p + "/"))) {
          const url = request.nextUrl.clone()
          url.pathname = "/"
          // Clear auth-specific query params before redirecting
          url.searchParams.delete("mode")
          url.searchParams.delete("verified")
          return NextResponse.redirect(url)
        }
      } catch {
        // Falha silenciosa
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)",
  ],
}