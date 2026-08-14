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
  "/quote",
  "/os",
]

// Rotas que são puramente estáticas e não precisam de contexto de usuário no RootLayout.
// Note: /institucional and /ajuda are now excluded from the middleware matcher entirely,
// but we keep the header for any edge cases where dynamic routing might reach here.
// Rotas da API que possuem seu próprio rate limit interno e devem ser isentas do rate limit global no middleware
const RATE_LIMIT_EXEMPT_PATHS = [
  "/api/upload-image",
  "/api/r2/video-upload",
  "/api/mercadopago/webhook/subscription",
  "/api/mercadopago/process-payment",
  "/api/mercadopago/process-erp-payment",
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

  // Remove hardcoded host overrides to prevent routing inconsistencies
  // request.headers.set("host", "dudit.com.br")
  // request.headers.set("x-forwarded-host", "dudit.com.br")

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

  // ============================================================================
  // CUSTOM EXPLORE REDIRECTS (SEO & Navigation Simplification)
  // ============================================================================
  const segments = pathname.split('/').filter(Boolean)
  const isSystemPath =
    pathname === "/" ||
    PUBLIC_PATHS.filter(p => p !== "/").some(p => pathname.startsWith(p)) ||
    ["/institucional", "/erp", "/account", "/auth", "/cart", "/perfil", "/pedidos", "/api", "/dashboard", "/payment", "/checkout", "/ddt-admin", "/vitrine", "/produto", "/assinaturas", "/colecoes", "/favoritos", "/select-erp"].some(p => pathname.startsWith(p));

  // Apenas intercepta paths de 1 ou 2 segmentos que não são de sistema
  if (!isSystemPath && (segments.length === 1 || segments.length === 2)) {
    const [seg1, seg2] = segments;

    if (!seg1.includes('.')) {
      const VALID_UFS = new Set(['ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to']);
      const isCitySlug = (slug: string) => {
        const match = slug.match(/-([a-z]{2})$/i);
        return match ? VALID_UFS.has(match[1].toLowerCase()) : false;
      };

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
        return NextResponse.redirect(redirectUrl, { status: 301 });
      }
    }
  }

  // Only log non-Server-Action requests to reduce noise
  // Server Actions (POST with Next-Action header) are internal Next.js calls
  const isServerAction = request.headers.has("Next-Action")
  if (!isServerAction) {
    console.log(`[MIDDLEWARE] ${request.method} ${pathname}`)
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

    // In development, allow localhost origins
    const isDev = process.env.NODE_ENV === "development"

    if (!origin) {
      // Missing Origin on a POST = suspicious (browsers always send it).
      // Block unless it's a same-origin non-browser call (e.g., test runners in dev).
      if (!isDev) {
        console.warn(`[MIDDLEWARE] CSRF: Blocked server action without Origin header on ${pathname}`)
        return new NextResponse(
          JSON.stringify({ error: "Requisição bloqueada: cabeçalho Origin ausente." }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }
    } else {
      try {
        const originHost = new URL(origin).host
        const expectedHost = new URL(appUrl).host
        const isAllowedOrigin = originHost === expectedHost || (isDev && (originHost.startsWith("localhost") || originHost.startsWith("127.0.0.1")))

        if (!isAllowedOrigin) {
          console.warn(`[MIDDLEWARE] CSRF: Blocked cross-origin server action. Origin: ${origin}, Expected: ${expectedHost}`)
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
  const trustedProxyIp = process.env.TRUSTED_PROXY_HEADERS === "true"
    ? request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip")
    : null
  const ip = platformIp || trustedProxyIp || "unknown"

  // 1. RATE LIMITING (APIs e Auth POST)
  // Uses category-based system with explicit limits. Exempts routes with custom rate limits.
  const isApiOrAuthPost = pathname.startsWith("/api/") || (pathname.startsWith("/auth/") && request.method === "POST")
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

  const cspHeader = `
    default-src 'self';
    worker-src 'self' blob:;
    child-src 'self' blob:;
    media-src 'self' blob: ${r2MediaOrigins};
    script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ''}
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
        https://static.cloudflareinsights.com 
        https://*.cloudflare.com 
        https://accounts.google.com 
        https://apis.google.com
        https://connect.facebook.net
        https://www.facebook.com
        https://*.facebook.com
        https://dudit.com.br
        https://www.dudit.com.br;
    connect-src 'self' data: blob: 
        ${sentryConnectOrigins}
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
        https://api.mapbox.com 
        https://events.mapbox.com 
        https://*.tiles.mapbox.com 
        https://http2.mlstatic.com 
        https://*.mlstatic.com 
        https://www.mercadolibre.com 
        https://api.mercadolibre.com
        https://www.google-analytics.com 
        https://stats.g.doubleclick.net 
        https://cloudflareinsights.com 
        https://*.cloudflare.com
        https://*.r2.cloudflarestorage.com
        https://img.dudit.com.br
        https://nominatim.openstreetmap.org
        https://vimeo.com
        https://www.facebook.com
        https://web.facebook.com
        https://*.facebook.com
        https://graph.facebook.com;
    frame-src 'self' 
        https://sdk.mercadopago.com 
        https://www.mercadopago.com 
        https://*.mercadopago.com 
        https://checkout.mercadopago.com
        https://accounts.google.com
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
  const PRIVATE_PREFIXES = ["/erp", "/account", "/auth", "/cart", "/perfil", "/pedidos", "/api", "/dashboard", "/payment", "/ddt-admin", "/assinaturas", "/colecoes", "/favoritos"]
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
  const NEEDS_AUTH_CHECK = ["/erp", "/account", "/perfil", "/pedidos", "/auth/login", "/select-erp", "/ddt-admin", "/cart", "/banned", "/checkout"]
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
            return NextResponse.redirect(loginUrl)
          }
        }

        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          // ================================================================
          // PARALLEL: Ban check + Partner status check
          // These are independent queries - run them concurrently to save ~30-50ms
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

          // Only query account_deletions if the flag cookie exists - avoids an unnecessary
          // DB call on every request for the 99.99% of users who never request deletion.
          const hasDeletionFlag = request.cookies.get("x-account-deleting")?.value === "true"
          const needsUserDeletionCheck = hasDeletionFlag && (isProtected || pathname.startsWith("/cart") || pathname.startsWith("/checkout"))
          const needsPartnerDeletionCheck = hasDeletionFlag && needsPartnerCheck

          // Launch all queries in parallel
          const [profileResult, partnerResult, deletionResult, partnerDeletionResult] = await Promise.all([
            needsBanCheck
              ? supabase
                .from("user_profiles")
                .select("banned_at, banned_until")
                .eq("user_id", user.id)
                .maybeSingle()
              : Promise.resolve({ data: null }),
            // SECURITY FIX (MED-04): get_partner_runtime_status (SECURITY DEFINER) returns
            // ONLY {is_active, erp_disabled} and only for owner/members of the partner.
            // Previously we joined partner_users -> partners!inner(...), but partners RLS
            // only exposes the row to the OWNER, so the inner join returned null for
            // invited members and the middleware cleared their cookie. The RPC avoids
            // the RLS join while still returning null for cookie tamperers (non-members).
            needsPartnerCheck
              ? Promise.resolve(
                supabase.rpc("get_partner_runtime_status", { p_partner_id: activePartnerId! })
              ).then((rpcResult) => ({ data: rpcResult.error ? null : rpcResult.data }))
              : Promise.resolve({ data: null }),
            needsUserDeletionCheck
              ? supabase
                .from("account_deletions")
                .select("status, grace_period_ends_at")
                .eq("user_id", user.id)
                .not("status", "eq", "completed")
                .maybeSingle()
              : Promise.resolve({ data: null }),
            needsPartnerDeletionCheck
              ? supabase
                .from("account_deletions")
                .select("status, grace_period_ends_at")
                .eq("partner_id", activePartnerId!)
                .not("status", "eq", "completed")
                .maybeSingle()
              : Promise.resolve({ data: null }),
          ])

          // Process account deletion check result
          const userDeletion = deletionResult.data
          const partnerDeletion = partnerDeletionResult?.data

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
          const profile = profileResult.data
          if (profile?.banned_at) {
            // Ban com expiração E já expirou → auto-clear
            if (profile.banned_until && new Date(profile.banned_until) < new Date()) {
              await supabase
                .from("user_profiles")
                .update({
                  banned_at: null,
                  banned_until: null,
                  banned_reason: null,
                  banned_by: null,
                })
                .eq("user_id", user.id)
              // Ban expirado e limpo, segue normal
            } else {
              // Ativamente banido (permanente ou ainda não expirou)
              console.log(`[MIDDLEWARE] User ${user.id} is BANNED - redirecting to /banned`)
              const bannedUrl = new URL("/banned", request.url)
              return NextResponse.redirect(bannedUrl)
            }
          }

          // Process partner status check result
          // MED-04: partnerResult comes from get_partner_runtime_status, so
          // .data is null if user doesn't belong to this partner (cookie tampered).
          const partnerStatus = partnerResult.data
          if (partnerStatus) {
            if (partnerStatus.is_active === false || partnerStatus.erp_disabled === true) {
              console.log(`[MIDDLEWARE] Partner ${activePartnerId} is inactive/disabled - redirecting to /select-erp`)
              const selectErpUrl = new URL("/select-erp", request.url)
              const responseRedirect = NextResponse.redirect(selectErpUrl)
              responseRedirect.cookies.delete("active_partner_id")
              return responseRedirect
            }
          } else if (needsPartnerCheck) {
            // User has no membership for this partner_id → cookie is invalid/tampered
            console.warn(`[MIDDLEWARE] User ${user.id} has no access to partner ${activePartnerId} - clearing cookie`)
            const selectErpUrl = new URL("/select-erp", request.url)
            const responseRedirect = NextResponse.redirect(selectErpUrl)
            responseRedirect.cookies.delete("active_partner_id")
            return responseRedirect
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
          return NextResponse.redirect(loginUrl)
        }

        // SECURITY: If already logged in and trying to access auth pages -> redirect to home
        // Exception: allow through if there's a ?next= param (e.g. invite flow) or ?mode=partner (partner registration)
        // Prevents duplicate login/signup attempts and confusing UX
        const authBlockedPaths = ["/auth/login"]
        const hasNextParam = request.nextUrl.searchParams.has("next")
        const hasModePartner = request.nextUrl.searchParams.get("mode") === "partner"

        if (user && !hasNextParam && !hasModePartner && authBlockedPaths.some(p => pathname === p || pathname.startsWith(p + "/"))) {
          // Define a base usando a sua variável de ambiente ou o domínio fixo
          // Cria uma URL nova do zero baseada no domínio atual do request
          const url = new URL("/", request.url)

          // Se você quiser manter os parâmetros da busca original (exceto os deletados), 
          // você pode copiá-los assim:
          request.nextUrl.searchParams.forEach((value, key) => {
            url.searchParams.set(key, value)
          })

          // Agora limpa os parâmetros específicos que você não quer levar pra Home
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
    "/((?!_next/static|_next/image|favicon.ico|ajuda|institucional|~offline|manifest\\.webmanifest|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)",
  ],
}
