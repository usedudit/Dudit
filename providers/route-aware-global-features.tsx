"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { FavoritesProvider } from "@/providers/favorites-provider"
import { PushNotificationManager } from "@/components/notifications/PushNotificationManager"
import { MarketplaceBottomMenu } from "@/components/marketplace/MarketplaceBottomMenu"

const NON_MARKETPLACE_PREFIXES = [
  "/account",
  "/api",
  "/assinaturas",
  "/auth",
  "/banned",
  "/checkout",
  "/colecoes",
  "/dashboard",
  "/ddt-admin",
  "/entregadores",
  "/erp",
  "/ferramentas",
  "/institucional",
  "/invite",
  "/payment",
  "/pedidos",
  "/perfil",
  "/print",
  "/quote",
  "/sacola",
  "/segmentos",
  "/select-erp",
  "/ajuda",
  "/~offline",
]

const PUSH_ENABLED_PREFIXES = [
  "/account",
  "/assinaturas",
  "/checkout",
  "/colecoes",
  "/dashboard",
  "/ddt-admin",
  "/entregadores",
  "/erp",
  "/favoritos",
  "/pedidos",
  "/perfil",
  "/sacola",
  "/select-erp",
]

function matchesPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function isMarketplaceSurface(pathname: string | null): boolean {
  // Keep the provider mounted while Next is resolving the pathname so
  // marketplace components never render without their required context.
  if (pathname === null) return true
  return !NON_MARKETPLACE_PREFIXES.some((prefix) => matchesPath(pathname, prefix))
}

function isPushEnabledSurface(pathname: string | null): boolean {
  if (!pathname) return false
  return PUSH_ENABLED_PREFIXES.some((prefix) => matchesPath(pathname, prefix))
}

/**
 * Keeps marketplace-only and authenticated-only client features out of
 * unrelated route trees. LegalConsentBanner intentionally remains outside
 * this gate because it must detect a newly published legal version anywhere
 * an authenticated user is active.
 */
export function RouteAwareGlobalFeatures({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const marketplaceSurface = isMarketplaceSurface(pathname)
  const pushEnabledSurface = isPushEnabledSurface(pathname)

  const content = marketplaceSurface ? (
    <FavoritesProvider>{children}</FavoritesProvider>
  ) : (
    children
  )

  return (
    <>
      {content}
      {marketplaceSurface && <MarketplaceBottomMenu />}
      {pushEnabledSurface && <PushNotificationManager />}
    </>
  )
}
