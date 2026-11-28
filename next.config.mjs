import { withSentryConfig } from '@sentry/nextjs/config';
import withSerwistInit from "@serwist/next"

import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const gitHash = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf-8",
}).stdout?.trim()

const revision =
  gitHash ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  "v1"

// A build do Railway (Railpack) não define CI, então a checagem abaixo
// precisa de um marcador próprio pra pular a geração/envio de source maps.
const isRailwayBuild = Boolean(process.env.RAILWAY_ENVIRONMENT)

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  disable: Boolean(process.env.NODE_ENV === "development" || process.env.DISABLE_PWA === "true" || process.env.BUILD_FOR_RENDER),
  register: false,
  exclude: [
    /\.js$/,
    /\.css$/,
    /\.map$/,
    /^manifest.*\.js$/,
    /\.json$/,
  ],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  serverExternalPackages: [
    "puppeteer-core",
    "@trigger.dev/sdk",
    "@sparticuz/chromium",
  ],
  typescript: {
    // No build de produção (Railway/Render), pula type-check pra economizar
    // tempo. Rode `tsc --noEmit` localmente/CI pra validar tipos.
    ignoreBuildErrors: Boolean(process.env.BUILD_FOR_RENDER),
  },
  images: {
    unoptimized: true,
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 dias
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: process.env.NEXT_PUBLIC_R2_CDN_URL
          ? new URL(process.env.NEXT_PUBLIC_R2_CDN_URL.startsWith('http')
            ? process.env.NEXT_PUBLIC_R2_CDN_URL
            : `https://${process.env.NEXT_PUBLIC_R2_CDN_URL}`
          ).hostname
          : '*.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: 'maps.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'api.mapbox.com',
      },
    ],
  },
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // Reativa o cache do webpack em produção. O cache filesystem nativo
  // da versão anterior acumulava mais de 10 GB entre server/client.
  // Aqui configuramos com expiração (7 dias) e geração de memória limitada
  // para invalidação automática quando o código muda.
  webpack(config, { dev, isServer, webpack }) {
    if (isServer) {
      // `isomorphic-dompurify` pulls in jsdom on the server (~100 MB RSS).
      // This alias keeps the browser build untouched while swapping only the
      // server instance for DOMPurify + happy-dom (same sanitizer engine).
      config.resolve = config.resolve || {}
      config.resolve.alias = config.resolve.alias || {}
      config.resolve.alias["isomorphic-dompurify"] = path.resolve(
        __dirname,
        "lib/security/dompurify-server.ts"
      )
    }

    if (!dev) {
      config.cache = {
        type: "filesystem",
        cacheDirectory: path.resolve(__dirname, ".next/cache/webpack"),
        buildDependencies: {
          config: [path.resolve(__dirname, "next.config.mjs")],
        },
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
        maxMemoryGenerations: 5,
        version: "1.0.0",
      }
    }

    // 8GB RAM cap (Render free/starter | Railway). Limita webpack a 1 job
    // pra reduzir o pico de memória no `next build` e evitar OOM.
    // Override: defina WEBPACK_PARALLELISM=N no Railway pra tentar build
    // mais rápido (ex: 2 ou 4). Se der OOM, remova a var.
    const forcedParallelism = Number(process.env.WEBPACK_PARALLELISM || 0)
    if (forcedParallelism > 0) {
      config.parallelism = forcedParallelism
      config.cache = { ...config.cache, memoryCacheUnaffected: true }
    } else if (process.env.RENDER || process.env.CI || process.env.BUILD_FOR_RENDER) {
      config.parallelism = 1
      config.cache = { ...config.cache, memoryCacheUnaffected: true }
    }
    return config
  },
  experimental: {
    cpus: process.env.BUILD_FOR_RENDER || process.env.RENDER || process.env.CI ? 1 : undefined,
    optimizePackageImports: [
      '@/components',
      '@/lib',
      '@hugeicons/react',
      '@hugeicons/core-free-icons',
      'lucide-react',
      'date-fns',
      'framer-motion',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-popover',
    ],
    optimizeCss: true,
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    // Em desenvolvimento o Next.js serve os chunks com o mesmo nome de arquivo
    // (sem hash de conteúdo). Marcar /_next/static como "immutable" por 1 ano
    // faz o browser guardar o bundle antigo e o hot reload não aparecer - o
    // dev server inclusive avisa que esse header quebra o comportamento de dev.
    const isDev = process.env.NODE_ENV === "development"

    return [
      {
        // Regra genérica de imagens. Fica antes das regras específicas de
        // ícones porque, no Next.js, a última regra que casa sobrescreve o
        // header - e ícones não podem ser `immutable` por 1 ano (senão um
        // WebAPK Android continua usando o ícone antigo).
        source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/icons/:all*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400',
          },
        ],
      },
      {
        source: '/favicon.ico',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400',
          },
        ],
      },
      ...(isDev
        ? []
        : [
          {
            source: '/_next/static/:path*',
            headers: [
              {
                key: 'Cache-Control',
                value: 'public, max-age=31536000, immutable',
              },
            ],
          },
        ]),
      {
        source: '/_next/image(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: isDev
              ? 'public, max-age=0, must-revalidate'
              : 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
        ],
      },
      {
        // Public static/content pages (no server-side auth): edge-cacheable
        source: '/(institucional|segmentos|ferramentas|blog|ajuda|mapa-do-site)(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=3600, stale-while-revalidate=86400',
          },
          {
            key: 'CDN-Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400',
          },
        ],
      },
      {
        // Agent Readiness: Link headers (RFC 8288) on homepage for AI/search discovery
        source: '/',
        headers: [
          {
            key: 'Link',
            value:
              '<https://dudit.com.br/llms.txt>; rel="describedby"; type="text/markdown", <https://dudit.com.br/sitemap.xml>; rel="sitemap"; type="application/xml", <https://dudit.com.br/ajuda>; rel="help"; type="text/html"',
          },
        ],
      },
      {
        source: '/(llms|llms-full).txt',
        headers: [
          {
            key: 'Content-Type',
            value: 'text/markdown; charset=utf-8',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=14400, must-revalidate',
          },
        ],
      },
      {
        // Private pages: never cached
        source: '/(erp|account|auth|cart|profile|pedidos|dashboard|payment)(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store',
          },
          {
            key: 'CDN-Cache-Control',
            value: 'no-store',
          },
        ],
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/produto/:slug/:cidadeUf/p/:id',
        destination: '/:cidadeUf/:slug/p/:id',
        permanent: true,
      },
      {
        source: '/vitrine/:slug/:cidadeUf/v/:id',
        destination: '/:cidadeUf/:slug/v/:id',
        permanent: true,
      },
    ]
  },
}

const sentryConfig = withSentryConfig(withSerwist(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "dudit-p3",

  project: "dudit",

  // Only print logs for uploading source maps in CI
  silent: !(process.env.CI || isRailwayBuild),

  // Skip source map *generation* (not just upload) on the Railway build.
  // Desabilitando geração, o @sentry/nextjs não força o webpack
  // (devtool = source-map/hidden-source-map) e o compile fica bem mais rápido.
  // O Sentry continua capturando erros em runtime via SENTRY_DSN; as stack
  // traces ficam minificadas nesse ambiente.
  sourcemaps: {
    disable: Boolean(isRailwayBuild || process.env.CI || process.env.BUILD_FOR_RENDER),
  },

  authToken:
    process.env.CI || process.env.BUILD_FOR_RENDER ? undefined : process.env.SENTRY_AUTH_TOKEN,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Keep source-map upload bounded for the MVP build while preserving stack traces.
  widenClientFileUpload: false,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers and CORS issues.
  // This can increase your server load as well as your hosting bill.
  // Note: The configured route is excluded from Next.js middleware to avoid interfering with client-side error reporting.
  tunnelRoute: "/monitoring",

  webpack: {
    // Keep automatic capture enabled for App Router pages, route handlers and server actions.
    autoInstrumentServerFunctions: true,

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});

// Remove tags <meta name="sentry-trace"> e <meta name="baggage"> injetadas
// automaticamente pelo @sentry/nextjs no <head> do HTML (evita trace_id em HTML cacheado).
function stripSentryClientTraceMetadata(config) {
  if (Array.isArray(config?.experimental?.clientTraceMetadata)) {
    config.experimental.clientTraceMetadata =
      config.experimental.clientTraceMetadata.filter(
        (key) => key !== "baggage" && key !== "sentry-trace"
      );
  }
  return config;
}

export default typeof sentryConfig === "function"
  ? async (...args) => stripSentryClientTraceMetadata(await sentryConfig(...args))
  : stripSentryClientTraceMetadata(sentryConfig);
