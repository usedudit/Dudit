import "server-only"
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { RateLimitCategory, getLimiter, RATE_LIMIT_CONFIGS } from "@/lib/rate-limiter"
import { isAllowedServerActionOrigin } from "@/lib/security/origin-validation"
import { getTrustedClientIP } from "@/lib/security/client-ip"
import { evaluateMaintenanceMode } from "@/lib/system/maintenance-guard"
import { isBotSearch } from "@/lib/search/bot-detection"

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
  "/quote",
  "/os",
  "/manutencao",
]

type SecureRuntimeStatus = {
  is_banned: boolean
  ban_expired: boolean
  user_deletion: boolean
  partner_access: boolean
  partner_deletion: boolean
  partner_status: {
    is_active: boolean | null
    erp_disabled: boolean | null
  } | null
}

// Rotas que são puramente estáticas e não precisam de contexto de usuário no RootLayout.
// Note: /institucional and /ajuda are now excluded from the middleware matcher entirely,
// but we keep the header for any edge cases where dynamic routing might reach here.
// Rotas da API que possuem seu próprio rate limit interno ou são probes de saúde e devem ser isentas do rate limit global no middleware
const RATE_LIMIT_EXEMPT_PATHS = [
  "/api/health",
  "/api/assets/qr-dino",
  "/api/upload-image",
  "/api/r2/video-upload",
  "/api/r2/presigned-url",
  "/api/r2/returns-evidence",
  "/api/r2/billing-refund-evidence",
  "/api/mercadopago/webhook",
  "/api/mercadopago/webhook/subscription",
  "/api/mercadopago/process-payment",
  "/api/mercadopago/process-erp-payment",
  "/api/orders/retry-payment",
  "/api/emails/send",
  "/api/ai/suggest-ncm",
  "/api/ai/suggest-cest",
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
  const requestId = crypto.randomUUID()
  const requestStartedAt = Date.now()

  // ─── 0. VERIFICAÇÃO DE MODO MANUTENÇÃO (503 / Bypass) ─────────────────────
  const maintenanceResponse = await evaluateMaintenanceMode(request)
  if (maintenanceResponse) {
    return maintenanceResponse
  }

  // ─── 0.1 BLOQUEIO DE SCANNERS / PROBES DE ARQUIVOS SENSÍVEIS ──────────────
  // Bloqueia bots que buscam arquivos de configuração/credenciais/dumps (.env, .json, .config, .yml, .tfstate, etc.)
  // fora das rotas legítimas da API (/api/...) e arquivos estáticos públicos.
  if (!pathname.startsWith("/api/")) {
    const SUSPICIOUS_PROBE_REGEX = /\.(json|env|yml|yaml|config|properties|tfstate|tfvars|ini|sql|bak|git|php|asp|aspx|jsp|cgi|sh|bash|heapdump|action|axd)(\/.*)?$/i
    const SUSPICIOUS_PATH_REGEX = /(\/|^)(\.env|\.git|\.well-known|actuator|heapdump|swagger|openapi|web\.config|credentials|service-account|terraform|wp-admin|wp-login|xmlrpc|phpinfo)/i

    if (SUSPICIOUS_PROBE_REGEX.test(pathname) || SUSPICIOUS_PATH_REGEX.test(pathname)) {
      const isAllowedProbe = pathname === "/manifest.webmanifest" || pathname === "/sitemap.xml" || pathname === "/robots.txt"
      if (!isAllowedProbe) {
        return new NextResponse("Not Found", {
          status: 404,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
            "X-Robots-Tag": "noindex, nofollow",
          },
        })
      }
    }
  }

  // Remove hardcoded host overrides to prevent routing inconsistencies
  // request.headers.set("host", "dudit.com.br")
  // request.headers.set("x-forwarded-host", "dudit.com.br")

  // ============================================================================
  // CUSTOM EXPLORE REDIRECTS (SEO & Navigation Simplification)
  // ============================================================================
  const segments = pathname.split('/').filter(Boolean)
  const isSystemPath =
    pathname === "/" ||
    PUBLIC_PATHS.filter(p => p !== "/").some(p => pathname.startsWith(p)) ||
    ["/institucional", "/erp", "/account", "/auth", "/sacola", "/perfil", "/pedidos", "/api", "/print", "/dashboard", "/payment", "/checkout", "/ddt-admin", "/entregadores", "/invite", "/vitrine", "/produto", "/assinaturas", "/colecoes", "/favoritos", "/select-erp", "/manutencao"].some(p => pathname.startsWith(p));

  // Apenas intercepta paths de 1 ou 2 segmentos que não são de sistema
  if (!isSystemPath && (segments.length === 1 || segments.length === 2)) {
    const [seg1, seg2] = segments;

    if (!seg1.includes('.')) {
      const VALID_UFS = new Set(['ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to']);
      const isCitySlug = (slug: string) => {
        const match = slug.match(/-([a-z]{2})$/i);
        return match ? VALID_UFS.has(match[1].toLowerCase()) : false;
      };

      if (isBotSearch(seg1) || (seg2 && isBotSearch(seg2))) {
        return new NextResponse("Not Found", {
          status: 404,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
            "X-Robots-Tag": "noindex, nofollow",
          },
        });
      }

      let redirectUrl = new URL('/explorar', request.url);
      let shouldRedirect = false;

      if (segments.length === 1) {
        if (isCitySlug(seg1)) {
          redirectUrl.searchParams.set('cidade', seg1);
          shouldRedirect = true;
        } else {
          redirectUrl.searchParams.set('q', seg1);
          shouldRedirect = true;
        }
      } else if (segments.length === 2) {
        if (isCitySlug(seg1)) {
          redirectUrl.searchParams.set('cidade', seg1);
          redirectUrl.searchParams.set('q', seg2);
          shouldRedirect = true;
        } else if (isCitySlug(seg2)) {
          redirectUrl.searchParams.set('cidade', seg2);
          redirectUrl.searchParams.set('q', seg1);
          shouldRedirect = true;
        }
      }

      if (shouldRedirect) {
        request.nextUrl.searchParams.forEach((val, key) => {
          if (!redirectUrl.searchParams.has(key)) {
            redirectUrl.searchParams.set(key, val);
          }
        });
        console.log(`[MIDDLEWARE] request=${requestId} redirect ${request.method} ${pathname}`)
        return NextResponse.redirect(redirectUrl, { status: 301 });
      }
    }
  }

  // Only log non-Server-Action requests to reduce noise
  // Server Actions (POST with Next-Action header) are internal Next.js calls
  const isServerAction = request.headers.has("Next-Action")
  if (!isServerAction) {
    // Classify App Router requests without logging cookies, tokens, query values
    // or user identifiers. This lets us distinguish a real navigation from a
    // speculative RSC/prefetch request in Railway logs.
    const purpose = request.headers.get("purpose")
    const isPrefetch = request.headers.has("next-router-prefetch")
      || request.headers.get("x-middleware-prefetch") === "1"
      || purpose === "prefetch"
    const isRsc = request.headers.get("RSC") === "1"
      || request.headers.get("Accept")?.includes("text/x-component") === true
    const kind = isPrefetch ? "prefetch" : isRsc ? "rsc" : "navigation"

    console.log(
      `[MIDDLEWARE] request=${requestId} ${request.method} ${pathname}`
      + ` kind=${kind} prefetch=${isPrefetch} rsc=${isRsc}`
    )
  }

  // ============================================================================
  // SECURITY FIX (HIGH-03): Origin-based CSRF protection for ALL Server Actions.
  //
  // Server actions are POST requests with the Next-Action header. We validate
  // the Origin header against the expected app domain to prevent cross-site
  // request forgery. This protects ALL ~50 server action files automatically
  // without requiring each to implement its own CSRF check.
  //
  // Modern browsers ALWAYS send the Origin header on POST requests, so a missing
  // Origin from a browser context is suspicious and blocked (fail-closed).
  // ============================================================================
  if (isServerAction && request.method === "POST") {
    const origin = request.headers.get("origin")
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br"

    if (!origin) {
      // Missing Origin on a POST = suspicious (browsers always send it).
      // Block unless it's a same-origin non-browser call (e.g., test runners in dev).
      if (process.env.NODE_ENV !== "development") {
        console.warn(`[MIDDLEWARE] CSRF: Blocked server action without Origin header on ${pathname}`)
        return new NextResponse(
          JSON.stringify({ error: "Requisição bloqueada: cabeçalho Origin ausente." }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }
    } else {
      try {
        const isAllowedOrigin = isAllowedServerActionOrigin(
          origin,
          appUrl,
          process.env.NODE_ENV === "development",
        )

        if (!isAllowedOrigin) {
          console.warn(`[MIDDLEWARE] CSRF: Blocked cross-origin server action. Origin: ${origin}`)
          return new NextResponse(
            JSON.stringify({ error: "Requisição bloqueada: origem não autorizada." }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          )
        }
      } catch {
        console.warn(`[MIDDLEWARE] CSRF: Blocked server action with malformed Origin: ${origin?.substring(0, 100)}`)
        return new NextResponse(
          JSON.stringify({ error: "Requisição bloqueada: origem inválida." }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }
    }
  }

  // Never trust the client-controlled first element of x-forwarded-for.
  // Platform-provided request.ip is preferred; proxy headers are accepted
  // only when the deployment explicitly sits behind a trusted proxy.
  const platformIp = (request as NextRequest & { ip?: string }).ip
  const ip = getTrustedClientIP(request.headers, platformIp)

  // 1. RATE LIMITING (APIs e Auth POST)
  // Uses category-based system with explicit limits. Exempts routes with custom rate limits.
  // Server Actions have their own in-action rate limiter and return RSC streams, so they are not intercepted with JSON 429.
  const isApiOrAuthPost = !isServerAction && (pathname.startsWith("/api/") || (pathname.startsWith("/auth/") && request.method === "POST"))
  const isRateLimitExempt = RATE_LIMIT_EXEMPT_PATHS.includes(pathname)

  if (isApiOrAuthPost && !isRateLimitExempt) {
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

  const r2MediaOrigins = [process.env.NEXT_PUBLIC_R2_CDN_URL, process.env.NEXT_PUBLIC_R2_PUBLIC_DEV_URL]
    .filter(Boolean)
    .map((raw) => {
      try {
        const href = String(raw).startsWith("http") ? String(raw) : `https://${raw}`
        return new URL(href).origin
      } catch {
        return null
      }
    })
    .filter((origin, index, list): origin is string => !!origin && list.indexOf(origin) === index)
    .join(" ")

  const sentryDsnOrigin = (() => {
    const rawDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
    if (!rawDsn) return ""

    try {
      const origin = new URL(rawDsn).origin
      return new URL(rawDsn).hostname.endsWith(".sentry.io") ? origin : ""
    } catch {
      return ""
    }
  })()

  const sentryConnectOrigins = [
    sentryDsnOrigin,
    "https://*.ingest.us.sentry.io",
    "https://*.ingest.sentry.io",
  ]
    .filter(Boolean)
    .join(" ")

  const posthogOrigins = [
    "https://*.posthog.com",
    "https://us.i.posthog.com",
    "https://us-assets.i.posthog.com",
    "https://eu.i.posthog.com",
    "https://eu-assets.i.posthog.com",
  ].join(" ")

  const cspHeader = `
    default-src 'self';
    worker-src 'self' blob:;
    child-src 'self' blob: https://*.googlesyndication.com https://*.doubleclick.net https://googleads.g.doubleclick.net https://*.google;
    media-src 'self' blob: ${r2MediaOrigins};
    script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ''}
        ${posthogOrigins}
        https://sdk.mercadopago.com 
        https://www.mercadopago.com 
        https://*.mercadopago.com 
        https://maps.googleapis.com 
        https://*.googleapis.com 
        https://*.google.com 
        https://*.google
        https://*.gstatic.com 
        https://api.mapbox.com 
        https://cdn.jsdelivr.net 
        https://va.vercel-scripts.com 
        https://http2.mlstatic.com 
        https://*.mlstatic.com 
        https://secure.mlstatic.com
        https://static.cloudflareinsights.com 
        https://*.cloudflare.com 
        https://accounts.google.com 
        https://apis.google.com
        https://connect.facebook.net
        https://www.facebook.com
        https://*.facebook.com
        https://pagead2.googlesyndication.com
        https://*.googlesyndication.com
        https://*.doubleclick.net
        https://googleads.g.doubleclick.net
        https://*.adtrafficquality.google
        https://*.googletagservices.com
        https://www.googletagservices.com
        https://dudit.com.br
        https://www.dudit.com.br;
    connect-src 'self' data: blob: 
        ${sentryConnectOrigins}
        ${posthogOrigins}
        https://*.supabase.co wss://*.supabase.co ${process.env.NEXT_PUBLIC_SUPABASE_URL || ''} wss://${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https:\/\//, '') || ''} 
        https://dudit.com.br
        https://www.dudit.com.br
        https://api.mercadopago.com 
        https://checkout.mercadopago.com
        https://*.mercadopago.com 
        https://events.mercadopago.com 
        https://maps.googleapis.com 
        https://*.googleapis.com 
        https://*.google.com 
        https://*.google
        https://*.adtrafficquality.google
        https://*.adservice.google.com
        https://*.adservice.google.com.br
        https://*.googletagservices.com
        https://api.mapbox.com 
        https://events.mapbox.com 
        https://*.tiles.mapbox.com 
        https://http2.mlstatic.com 
        https://*.mlstatic.com 
        https://www.mercadolibre.com 
        https://api.mercadolibre.com
        https://www.google-analytics.com 
        https://stats.g.doubleclick.net 
        https://pagead2.googlesyndication.com
        https://*.googlesyndication.com
        https://googleads.g.doubleclick.net
        https://*.doubleclick.net
        https://cloudflareinsights.com 
        https://*.cloudflare.com
        https://*.r2.cloudflarestorage.com
        https://img.dudit.com.br
        https://nominatim.openstreetmap.org
        https://vimeo.com
        https://www.facebook.com
        https://web.facebook.com
        https://*.facebook.com
        https://graph.facebook.com
        https://connect.facebook.net;
    frame-src 'self' 
        https://sdk.mercadopago.com 
        https://www.mercadopago.com 
        https://*.mercadopago.com 
        https://checkout.mercadopago.com
        https://accounts.google.com
        https://*.google.com
        https://*.google
        https://*.adtrafficquality.google
        https://googleads.g.doubleclick.net
        https://*.doubleclick.net
        https://pagead2.googlesyndication.com
        https://tpc.googlesyndication.com
        https://*.googlesyndication.com
        https://www.mercadolibre.com
        https://www.youtube.com
        https://www.youtube-nocookie.com
        https://player.vimeo.com
        https://www.facebook.com
        https://web.facebook.com
        https://*.facebook.com;
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
    font-src 'self' https://fonts.gstatic.com https://fonts.cdnfonts.com data:;
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
  `
  const contentSecurityPolicyHeaderValue = cspHeader.replace(/\s{2,}/g, ' ').trim()

  // Prepara os headers iniciais
  const requestHeaders = new Headers(request.headers)
  // Internal correlation only. This value is generated server-side and is
  // never used for authentication, authorization, or user identification.
  requestHeaders.set("x-dudit-request-id", requestId)
  requestHeaders.set("x-dudit-request-start", String(requestStartedAt))
  // Identity headers are never trusted by server-side authorization. Remove
  // client-supplied copies before forwarding the request internally.
  requestHeaders.delete("x-user-id")
  requestHeaders.delete("x-user-email")
  requestHeaders.delete("x-skip-auth-fallback")
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicyHeaderValue)

  // Otimização para páginas institucionais: pula a busca de usuário no RootLayout (server-side)
  // pois essas páginas são estáticas e não usam o contexto de usuário.
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
  response.headers.set("Permissions-Policy", "geolocation=(self), microphone=(), camera=(self), payment=()")
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none")


  // 4. CACHE-CONTROL HEADERS (Route-aware) - Must be set BEFORE auth block
  // Public marketplace pages: edge-cacheable with stale-while-revalidate
  // Private/auth pages: never cached
  const PRIVATE_PREFIXES = ["/erp", "/account", "/auth", "/sacola", "/perfil", "/pedidos", "/api", "/dashboard", "/payment", "/ddt-admin", "/entregadores", "/assinaturas", "/colecoes", "/favoritos"]
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
  const NEEDS_AUTH_CHECK = ["/erp", "/account", "/perfil", "/pedidos", "/auth/login", "/select-erp", "/ddt-admin", "/sacola", "/banned", "/checkout"]
  const isPost = request.method === "POST"
  const needsAuthCheck = !isServerAction && (isPost || NEEDS_AUTH_CHECK.some(prefix => pathname === prefix || pathname.startsWith(prefix + "/")))

  if (needsAuthCheck) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (supabaseUrl && supabaseKey) {
      const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            response = NextResponse.next({ request: { headers: requestHeaders } })
            // Re-apply ALL security headers on the new response
            response.headers.set('Content-Security-Policy', contentSecurityPolicyHeaderValue)
            response.headers.set("X-Content-Type-Options", "nosniff")
            response.headers.set("X-Frame-Options", "DENY")
            response.headers.set("X-XSS-Protection", "1; mode=block")
            response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
            response.headers.set("Permissions-Policy", "geolocation=(self), microphone=(), camera=(self), payment=()")
            response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
            // Re-apply Cache-Control for private pages
            response.headers.set("Cache-Control", "private, no-store")
            response.headers.set("CDN-Cache-Control", "no-store")

            // Important: we need to re-apply any response cookies as well
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          },
        },
      })

      // Verifica usuário apenas para proteger rotas ERP
      try {
        const protectedPrefixes = ["/erp", "/perfil", "/pedidos", "/select-erp", "/ddt-admin", "/banned"]
        const isProtected = protectedPrefixes.some(prefix => pathname.startsWith(prefix))

        // FAST-FAIL: If it's a protected route and there are NO supabase cookies at all, 
        // don't even waste time calling auth.getUser()
        if (isProtected) {
          const hasAuthCookie = request.cookies.getAll().some(c => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
          if (!hasAuthCookie) {
            const loginUrl = new URL("/auth/login", request.url)
            const responseRedirect = NextResponse.redirect(loginUrl)
            responseRedirect.cookies.delete("active_partner_id")
            responseRedirect.cookies.delete("active_store_id")
            return responseRedirect
          }
        }

        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          // ================================================================
          // CONSOLIDATED SECURITY CHECK
          // One SECURITY DEFINER RPC replaces the independent profile,
          // account-deletion and partner-status reads. It returns only the
          // minimum flags required by this middleware.
          // ================================================================
          const isAllowedWhenBanned =
            pathname === "/banned" || pathname.startsWith("/banned/") ||
            pathname === "/auth/sign-out" || pathname.startsWith("/auth/sign-out/") ||
            pathname === "/auth/callback" || pathname.startsWith("/auth/callback/")

          // Ban check ONLY on protected routes - public pages (marketplace, explorar, etc.)
          // don't need ban enforcement. This avoids a user_profiles query on every public page
          // visited by a logged-in user.
          const needsBanCheck = !isAllowedWhenBanned && isProtected

          const activePartnerId = request.cookies.get("active_partner_id")?.value
          const needsPartnerCheck = pathname.startsWith("/erp") && !!activePartnerId

          // Only query account_deletions if the flag cookie exists or on protected routes.
          const hasDeletionFlag = request.cookies.get("x-account-deleting")?.value === "true"
          const needsUserDeletionCheck = (hasDeletionFlag || isProtected) && (isProtected || pathname.startsWith("/sacola") || pathname.startsWith("/checkout"))
          const needsPartnerDeletionCheck = (hasDeletionFlag || isProtected) && needsPartnerCheck

          const needsRuntimeCheck = needsBanCheck
            || needsPartnerCheck
            || needsUserDeletionCheck
            || needsPartnerDeletionCheck

          let runtimeStatus: SecureRuntimeStatus | null = null
          if (needsRuntimeCheck) {
            const { data, error } = await supabase.rpc("get_secure_runtime_status", {
              p_partner_id: activePartnerId || null,
            })

            // Security checks fail closed. A temporary database/RPC failure
            // must not turn into an allowed request.
            if (error || !data || typeof data !== "object") {
              console.error("[MIDDLEWARE] Secure runtime check failed", {
                requestId,
                code: error?.code,
              })
              return new NextResponse(
                JSON.stringify({ error: "Não foi possível validar a sessão com segurança." }),
                { status: 503, headers: { "Content-Type": "application/json" } }
              )
            }

            runtimeStatus = data as SecureRuntimeStatus
          }

          // Process account deletion check result
          const userDeletion = needsUserDeletionCheck && runtimeStatus?.user_deletion === true
          const partnerDeletion = needsPartnerDeletionCheck && runtimeStatus?.partner_deletion === true

          // Under the new immediate architecture, any active deletion record blocks access instantly
          if (userDeletion) {
            console.log(`[MIDDLEWARE] User ${user.id} account deletion is in progress - redirecting to login`)
            const logoutUrl = new URL("/auth/login?error=account_deleting", request.url)
            const responseRedirect = NextResponse.redirect(logoutUrl)
            request.cookies.getAll().forEach(c => {
              if (c.name.startsWith("sb-")) {
                responseRedirect.cookies.delete(c.name)
              }
            })
            responseRedirect.cookies.delete("active_partner_id")
            responseRedirect.cookies.delete("active_store_id")
            responseRedirect.cookies.delete("x-account-deleting")
            return responseRedirect
          }

          if (partnerDeletion) {
            console.log(`[MIDDLEWARE] Partner ${activePartnerId} deletion is in progress - blocking access`)
            const selectErpUrl = new URL("/select-erp?error=partner_deleting", request.url)
            const responseRedirect = NextResponse.redirect(selectErpUrl)
            responseRedirect.cookies.delete("active_partner_id")
            return responseRedirect
          }

          // Deletion completed - query returned nothing, clear the flag
          if (hasDeletionFlag) {
            response.cookies.set("x-account-deleting", "", { maxAge: 0, path: "/" })
          }

          // Process ban check result
          if (needsBanCheck && runtimeStatus?.is_banned === true) {
            console.log(`[MIDDLEWARE] User ${user.id} is BANNED - redirecting to /banned`)
            const bannedUrl = new URL("/banned", request.url)
            return NextResponse.redirect(bannedUrl)
          }

          if (needsBanCheck && runtimeStatus?.ban_expired === true) {
            // Ban expirado e limpo, segue normal.
            await supabase
              .from("user_profiles")
              .update({
                banned_at: null,
                banned_until: null,
                banned_reason: null,
                banned_by: null,
              })
              .eq("user_id", user.id)
          }

          // Process partner status/access check result
          if (needsPartnerCheck && runtimeStatus?.partner_access !== true) {
            // User has no membership for this partner_id → cookie is invalid/tampered
            console.warn(`[MIDDLEWARE] User ${user.id} has no access to partner ${activePartnerId} - clearing cookie`)
            const selectErpUrl = new URL("/select-erp", request.url)
            const responseRedirect = NextResponse.redirect(selectErpUrl)
            responseRedirect.cookies.delete("active_partner_id")
            return responseRedirect
          }

          const partnerStatus = runtimeStatus?.partner_status
          if (needsPartnerCheck && partnerStatus) {
            if (partnerStatus.is_active === false || partnerStatus.erp_disabled === true) {
              console.log(`[MIDDLEWARE] Partner ${activePartnerId} is inactive/disabled - redirecting to /select-erp`)
              const selectErpUrl = new URL("/select-erp", request.url)
              const responseRedirect = NextResponse.redirect(selectErpUrl)
              responseRedirect.cookies.delete("active_partner_id")
              return responseRedirect
            }
          }

          // Re-create the response to inject the new requestHeaders downstream
          const oldResponse = response
          response = NextResponse.next({
            request: { headers: requestHeaders }
          })

          // Ensure we copy all response headers (CSP, Rate Limit, Cache Control, Set-Cookie)
          oldResponse.headers.forEach((value, key) => {
            response.headers.set(key, value)
          })
        }

        // Se não estiver logado e tentar acessar rotas protegidas -> Manda pro Login
        if (!user && isProtected) {
          const loginUrl = new URL("/auth/login", request.url)
          const responseRedirect = NextResponse.redirect(loginUrl)
          responseRedirect.cookies.delete("active_partner_id")
          responseRedirect.cookies.delete("active_store_id")
          return responseRedirect
        }

        // A logout can remove Supabase auth cookies before the next request,
        // while the HttpOnly ERP context cookies are still present. Clear both
        // so the next account starts with a clean partner/store context.
        if (!user) {
          response.cookies.delete("active_partner_id")
          response.cookies.delete("active_store_id")
        }

        // SECURITY: If already logged in and trying to access auth pages -> redirect to home
        // Exception: allow through if there's a ?next= param (e.g. invite flow) or ?mode=partner (partner registration)
        // or if returning from account deletion flow (?deleted=true or ?error=account_deleting)
        const authBlockedPaths = ["/auth/login"]
        const hasNextParam = request.nextUrl.searchParams.has("next")
        const hasModePartner = request.nextUrl.searchParams.get("mode") === "partner"
        const isAuthDeleted = request.nextUrl.searchParams.get("deleted") === "true"
        const isAuthErrorDeleting = request.nextUrl.searchParams.get("error") === "account_deleting"
        const isDeletionState = isAuthDeleted || isAuthErrorDeleting

        // If landing on /auth/login with deletion state, purge any lingering auth cookies and allow staying on /auth/login
        if (isDeletionState && authBlockedPaths.some(p => pathname === p || pathname.startsWith(p + "/"))) {
          request.cookies.getAll().forEach(c => {
            if (c.name.startsWith("sb-")) {
              response.cookies.delete(c.name)
            }
          })
          response.cookies.delete("active_partner_id")
          response.cookies.delete("active_store_id")
          response.cookies.delete("x-account-deleting")
          return response
        }

        if (user && !hasNextParam && !hasModePartner && !isDeletionState && authBlockedPaths.some(p => pathname === p || pathname.startsWith(p + "/"))) {
          const url = new URL("/", request.url)
          request.nextUrl.searchParams.forEach((value, key) => {
            url.searchParams.set(key, value)
          })
          url.searchParams.delete("mode")
          url.searchParams.delete("verified")
          url.searchParams.delete("error")
          url.searchParams.delete("error_description")

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
    "/((?!_next/static|_next/image|favicon.ico|ajuda|institucional|~offline|manifest\\.webmanifest|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)",
  ],
}
