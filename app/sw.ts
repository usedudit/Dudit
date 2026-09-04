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

const CACHE_VERSION = "v2"
const MAX_CACHED_IMAGE_BYTES = 2 * 1024 * 1024

// ExpirationPlugin limita quantidade/idade, mas não limita tamanho em bytes.
// Uma única imagem original grande podia consumir dezenas de MB e fazer o
// cache de imagens chegar a GB mesmo com maxEntries baixo.
const imageSizeLimitPlugin = {
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    if (response.status !== 200) return null

    const contentLength = Number(response.headers.get("content-length"))
    if (Number.isFinite(contentLength) && contentLength > MAX_CACHED_IMAGE_BYTES) {
      return null
    }

    // CDN responses sem Content-Length ainda precisam ser limitadas.
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      const body = await response.clone().arrayBuffer()
      if (body.byteLength > MAX_CACHED_IMAGE_BYTES) return null
    }

    return response
  },
}

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// ============================================================
// Filtro do precache: remove TODOS os chunks JS/CSS do Next.js
// do precache inicial. Os arquivos do Next.js já possuem cache HTTP
// imutável no navegador e são cacheados sob demanda pelo runtimeCaching.
// Isso evita que o navegador baixe e armazene 150MB+ de scripts
// da aplicação inteira no primeiro acesso.
// ============================================================
function filterPrecacheManifest(
  manifest: (PrecacheEntry | string)[] | undefined
): (PrecacheEntry | string)[] {
  if (!manifest) return []
  return manifest.filter((entry) => {
    const url = typeof entry === "string" ? entry : entry.url
    // Exclui todos os chunks de código e assets estáticos pesados do precache
    if (url.startsWith("/_next/static/")) return false
    return true
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
      cacheName: `dudit-fonts-${CACHE_VERSION}`,
      plugins: [
        new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        new CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    }),
  },

  // Imagens CDN - só imagens, 3 dias, max 24 entries e 2 MB por arquivo
  {
    matcher: ({ request, url }: { request: Request; url: URL }) =>
      request.destination === "image" &&
      (url.hostname === "img.dudit.com.br" ||
        url.hostname.endsWith(".r2.cloudflarestorage.com")),
    handler: new StaleWhileRevalidate({
      cacheName: `dudit-cdn-images-${CACHE_VERSION}`,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 24,
          maxAgeSeconds: 3 * 24 * 60 * 60,
          purgeOnQuotaError: true,
        }),
        new CacheableResponsePlugin({ statuses: [200] }),
        imageSizeLimitPlugin,
      ],
    }),
  },

  // Assets estáticos Next.js - Cache First sob demanda (apenas páginas visitadas)
  {
    matcher: ({ url }: { url: URL }) =>
      url.pathname.startsWith("/_next/static"),
    handler: new CacheFirst({
      cacheName: `dudit-next-static-${CACHE_VERSION}`,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 30,
          maxAgeSeconds: 3 * 24 * 60 * 60, // 3 dias
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
      cacheName: `dudit-public-pages-${CACHE_VERSION}`,
      networkTimeoutSeconds: 10,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 12,
          maxAgeSeconds: 12 * 60 * 60,
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

// Limpeza forçada de caches legados ou não mais utilizados
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await self.caches.keys()
        const activeCaches = [
          `dudit-fonts-${CACHE_VERSION}`,
          `dudit-cdn-images-${CACHE_VERSION}`,
          `dudit-next-static-${CACHE_VERSION}`,
          `dudit-public-pages-${CACHE_VERSION}`,
          serwist.precacheStrategy.cacheName,
        ]
        await Promise.all(
          cacheNames.map(async (name) => {
            if (!activeCaches.includes(name)) {
              await self.caches.delete(name)
            }
          })
        )
      } catch (err) {
        console.error("[SW] Erro ao limpar caches obsoletos:", err)
      }
    })()
  )
})

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
    renotify: true,
    vibrate: [200, 100, 200],
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

