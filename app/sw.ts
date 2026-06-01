/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker"
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
          maxEntries: 150,
          maxAgeSeconds: 7 * 24 * 60 * 60,
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
        new ExpirationPlugin({ maxAgeSeconds: 365 * 24 * 60 * 60 }),
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
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false, // Usuário decide quando atualizar
  clientsClaim: true,
  navigationPreload: true,
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
