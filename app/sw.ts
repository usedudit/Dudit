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
  /\/app\/erp\//,          // ERP — privado, precisa de auth + dados live
  /\/app\/ddt-admin\//,    // Admin — privado
  /\/app\/auth\//,         // Auth — transiente
  /\/app\/cart\//,          // Carrinho — privado
  /\/app\/checkout\//,     // Checkout — privado
  /\/app\/payment\//,      // Pagamento — privado
  /\/app\/dashboard\//,    // Dashboard — privado
  /\/app\/pedidos\//,      // Pedidos — privado
  /\/app\/perfil\//,       // Perfil — privado
  /\/app\/select-erp\//,   // Seleção ERP — privado
  /\/app\/banned\//,       // Ban page
  /\/app\/account\//,      // Conta — privado
  /\/app\/invite\//,       // Convites — privado
  /\/app\/assinaturas\//, // Assinaturas — privado
  /\/loading-[a-f0-9]+\.js$/, // Loading skeletons — dispensáveis
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
// Path-based exclusions — sem leitura de cookies
// ============================================================
const UNCACHEABLE_PREFIXES = [
  "/erp",
  "/api",
  "/auth",
  "/ddt-admin",
  "/cart",
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
// Runtime caching customizado para o Dudit
// A ordem importa: regras mais específicas primeiro
// ============================================================
const networkOnlyErrorHandler = {
  handlerDidError: async ({ request }: { request: Request }) => {
    if (request.destination === "document") {
      const offlineFallback = await caches.match("/~offline");
      if (offlineFallback) return offlineFallback;
    }
    return Response.error();
  },
};

const duditRuntimeCaching = [
  // BLOQUEIO TOTAL: ERP, API, Auth, Server Actions, rotas privadas
  {
    matcher: ({ request, url }: { request: Request; url: URL }) =>
      isUncacheableRequest(request, url),
    handler: new NetworkOnly({
      plugins: [networkOnlyErrorHandler],
    }),
  },

  // Fontes Google — Stale While Revalidate, 30 dias
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

  // Imagens CDN — Stale While Revalidate, 7 dias, max 150 entries
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

  // Assets estáticos Next.js — Cache First (imutáveis, hash no nome)
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

  // Páginas públicas marketplace — Network First com fallback para cache
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
// Firebase Cloud Messaging — background push (Android PWA)
// Config is injected at build time from NEXT_PUBLIC_* env vars.
// ============================================================
const FCM_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || ""
const FCM_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ""

if (FCM_API_KEY && FCM_PROJECT_ID) {
  try {
    importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js")
    importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js")

    // @ts-expect-error firebase compat global from importScripts
    firebase.initializeApp({
      apiKey: FCM_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
      projectId: FCM_PROJECT_ID,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    })

    // @ts-expect-error firebase compat global from importScripts
    const messaging = firebase.messaging()

    messaging.onBackgroundMessage((payload: {
      data?: {
        title?: string
        body?: string
        href?: string
        notificationId?: string
        type?: string
        entityType?: string
        entityId?: string
      }
    }) => {
      const title = payload.data?.title || "Dudit"
      const body = payload.data?.body || ""
      const href = payload.data?.href || "/"
      const notificationId = payload.data?.notificationId

      self.registration.showNotification(title, {
        body,
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-192x192.png",
        data: { href, notificationId },
        tag: notificationId || undefined,
      })
    })

    self.addEventListener("notificationclick", (event) => {
      const notif = event.notification
      notif.close()
      const href = (notif.data && (notif.data as { href?: string }).href) || "/"
      const url = href.startsWith("http") ? href : `${self.location.origin}${href}`

      event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
          for (const client of windowClients) {
            if ("focus" in client) {
              return client.focus()
            }
          }
          if (self.clients.openWindow) {
            return self.clients.openWindow(url)
          }
        }),
      )
    })
  } catch (err) {
    console.warn("[sw] FCM background handler skipped", err)
  }
}
