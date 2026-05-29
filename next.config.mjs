import withSerwistInit from "@serwist/next"

import { spawnSync } from "node:child_process"

const gitHash = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf-8",
}).stdout?.trim()

const revision =
  gitHash ||
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  "offline-v1"

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  disable: process.env.NODE_ENV === "development",
  register: false,
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "@trigger.dev/sdk"],
  typescript: {
    ignoreBuildErrors: false,
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
  experimental: {
    optimizePackageImports: ['@/components', '@/lib'],
    optimizeCss: true,
  },
  async headers() {
    return [
      {
        source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
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
        // Public marketplace pages: edge-cacheable
        source: '/(products|services|partners|produto)(.*)',
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

export default withSerwist(nextConfig)
