/// <reference lib="webworker" />

import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"
import {
  Serwist,
  NetworkOnly,
  NetworkFirst,
  StaleWhileRevalidate,
  CacheFirst,
  ExpirationPlugin,
  CacheableResponsePlugin,
} from "serwist"

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// ============================================================
// Filtro do precache: remove rotas que não fazem sentido cachear
// no navegador (API routes, ERP, admin, rotas privadas, etc.)
// Isso reduz o cache de ~600MB para ~30-60MB.
// ============================================================
const PRECACHE_EXCLUDE_PATTERNS = [
  /\/app\/api\//,          // API routes rodam no servidor
  /\/app\/erp\//,          // ERP - privado, precisa de auth + dados live
  /\/app\/ddt-admin\//,    // Admin - privado
  /\/app\/auth\//,         // Auth - transiente
  /\/app\/cart\//,          // Carrinho - privado
  /\/app\/checkout\//,     // Checkout - privado
  /\/app\/payment\//,      // Pagamento - privado
  /\/app\/dashboard\//,    // Dashboard - privado
  /\/app\/pedidos\//,      // Pedidos - privado
  /\/app\/perfil\//,       // Perfil - privado
  /\/app\/select-erp\//,   // Seleção ERP - privado
  /\/app\/banned\//,       // Ban page
  /\/app\/account\//,      // Conta - privado
  /\/app\/invite\//,       // Convites - privado
  /\/app\/assinaturas\//, // Assinaturas - privado
  /\/loading-[a-f0-9]+\.js$/, // Loading skeletons - dispensáveis
]

function filterPrecacheManifest(
  manifest: (PrecacheEntry | string)[] | undefined
): (PrecacheEntry | string)[] {
  if (!manifest) return []
  return manifest.filter((entry) => {
    const url = typeof entry === "string" ? entry : entry.url
    return !PRECACHE_EXCLUDE_PATTERNS.some((pattern) => pattern.test(url))
  })
}

// ============================================================
// REGRA ABSOLUTA: Rotas que NUNCA devem ser cacheadas
// Path-based exclusions - sem leitura de cookies
// ============================================================
const UNCACHEABLE_PREFIXES = [
  "/erp",
  "/api",
  "/auth",
  "/ddt-admin",
  "/sacola",
  "/pedidos",
  "/perfil",
  "/checkout",
  "/payment",
  "/dashboard",
  "/select-erp",
  "/banned",
  "/account",
  "/invite",
]

function isUncacheableRequest(request: Request, url: URL): boolean {
  // 1. Server Actions (Next-Action header)
  if (request.headers.get("Next-Action")) return true
  // 2. RSC data requests
  if (request.headers.get("RSC") === "1") return true
  // 3. Non-GET methods (POST, PUT, DELETE, PATCH)
  if (request.method !== "GET") return true
  // 4. Path-based exclusions for all private/sensitive routes
  if (
    UNCACHEABLE_PREFIXES.some(
      (p) => url.pathname === p || url.pathname.startsWith(p + "/")
    )
  )
    return true

  return false
}

// ============================================================
// Runtime caching customizado para a Dudit
// A ordem importa: regras mais específicas primeiro
// ============================================================
const networkOnlyErrorHandler = {
  handlerDidError: async ({ request }: { request: Request }) => {
    if (request.destination === "document") {
      const offlineFallback = await caches.match("/~offline");
      if (offlineFallback) return offlineFallback;
    }
    // Return 200 instead of 503 to avoid browser console error logs
    // ("Failed to load resource: the server responded with a status of 503").
    // Client code handles the empty response gracefully on its own.
    return new Response(null, { status: 200 });
  },
};

const duditRuntimeCaching = [
  // BLOQUEIO TOTAL: ERP, API, Auth, Server Actions, rotas privadas
  // NOTA: navigation requests (document) passam direto - sem interferência do SW
  {
    matcher: ({ request, url }: { request: Request; url: URL }) =>
      request.destination !== "document" && isUncacheableRequest(request, url),
    handler: new NetworkOnly({
      plugins: [networkOnlyErrorHandler],
    }),
  },

  // Fontes Google - Stale While Revalidate, 30 dias
  {
    matcher: ({ url }: { url: URL }) =>
      url.hostname === "fonts.googleapis.com" ||
      url.hostname === "fonts.gstatic.com",
    handler: new StaleWhileRevalidate({
      cacheName: "dudit-fonts",
      plugins: [
        new ExpirationPlugin({ maxAgeSeconds: 30 * 24 * 60 * 60 }),
        new CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    }),
  },

  // Imagens CDN - Stale While Revalidate, 7 dias, max 150 entries
  {
    matcher: ({ url }: { url: URL }) =>
      url.hostname.includes("img.dudit.com.br") ||
      url.hostname.includes("r2.cloudflarestorage.com"),
    handler: new StaleWhileRevalidate({
      cacheName: "dudit-cdn-images",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 80,
          maxAgeSeconds: 7 * 24 * 60 * 60,
          purgeOnQuotaError: true,
        }),
        new CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    }),
  },

  // Assets estáticos Next.js - Cache First (imutáveis, hash no nome)
  {
    matcher: ({ url }: { url: URL }) =>
      url.pathname.startsWith("/_next/static"),
    handler: new CacheFirst({
      cacheName: "dudit-next-static",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 dias (não 365)
          purgeOnQuotaError: true,
        }),
        new CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    }),
  },

  // Páginas públicas marketplace - Network First com fallback para cache
  {
    matcher: ({ request, url }: { request: Request; url: URL }) => {
      if (request.destination !== "document") return false
      const publicPaths = [
        "/",
        "/explorar",
        "/services",
        "/partners",
        "/ajuda",
        "/institucional",
        "/mapa",
      ]
      return publicPaths.some(
        (p) => url.pathname === p || url.pathname.startsWith(p + "/")
      )
    },
    handler: new NetworkFirst({
      cacheName: "dudit-public-pages",
      networkTimeoutSeconds: 10,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 30,
          maxAgeSeconds: 24 * 60 * 60,
        }),
        new CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    }),
  },
]

// ============================================================
// Inicialização do Serwist
// ============================================================
const serwist = new Serwist({
  precacheEntries: filterPrecacheManifest(self.__SW_MANIFEST),
  precacheOptions: {
    cleanupOutdatedCaches: true,
    concurrency: 10,
  },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching: duditRuntimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document"
        },
      },
    ],
  },
})

// NOTA: O listener para SKIP_WAITING message já é registrado
// internamente pelo Serwist quando skipWaiting: false.
// Não é necessário adicionar manualmente.

serwist.addEventListeners()

// ============================================================
// Web Push Notifications Handler (Android, iOS Safari, PWA, Desktop)
// Processa notificações push nativamente sem dependências de scripts remotos,
// garantindo entrega instantânea mesmo em modo Doze / segundo plano.
// ============================================================
self.addEventListener("push", (event) => {
  if (!event.data) return

  let payload: {
    title?: string
    body?: string
    href?: string
    notificationId?: string
    icon?: string
    badge?: string
    type?: string
    entityType?: string
    entityId?: string
    data?: Record<string, unknown>
    notification?: {
      title?: string
      body?: string
      icon?: string
      badge?: string
    }
  } = {}

  try {
    payload = event.data.json()
  } catch {
    try {
      payload = { body: event.data.text() }
    } catch {
      payload = {}
    }
  }

  const notificationData = (payload.data || payload) as Record<string, unknown>
  const rawNotif = payload.notification || {}

  const title =
    rawNotif.title ||
    (notificationData.title as string | undefined) ||
    payload.title ||
    "Dudit"

  const body =
    rawNotif.body ||
    (notificationData.body as string | undefined) ||
    payload.body ||
    ""

  const href =
    (notificationData.href as string | undefined) ||
    payload.href ||
    "/"

  const notificationId =
    (notificationData.notificationId as string | undefined) ||
    payload.notificationId ||
    ""

  const type =
    (notificationData.type as string | undefined) ||
    payload.type ||
    ""

  const icon =
    rawNotif.icon ||
    payload.icon ||
    "/icons/icon-192x192.png"

  const badge =
    rawNotif.badge ||
    payload.badge ||
    "/icons/icon-192x192.png"

  const tag =
    notificationId ||
    (type ? `${type}-${Date.now()}` : `dudit-${Date.now()}`)

  const options: NotificationOptions = {
    body,
    icon,
    badge,
    tag,
    data: {
      href,
      notificationId,
      type,
      entityType: notificationData.entityType || payload.entityType || "",
      entityId: notificationData.entityId || payload.entityId || "",
    },
    requireInteraction: false,
    vibrate: [100, 50, 100],
  } as any

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  const notif = event.notification
  notif.close()

  const data = (notif.data || {}) as { href?: string; notificationId?: string }
  const href = data.href || "/"
  const targetUrl = href.startsWith("http") ? href : `${self.location.origin}${href}`

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          await client.focus()
          if ("navigate" in client && typeof (client as { navigate?: (u: string) => Promise<unknown> }).navigate === "function") {
            await (client as { navigate: (u: string) => Promise<unknown> }).navigate(targetUrl)
          }
          return
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl)
      }
    }),
  )
})

