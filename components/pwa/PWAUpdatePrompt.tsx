"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

/**
 * Registra o service worker do PWA na inicialização do aplicativo.
 * A verificação de novas versões e o controle de ativação imediata (skipWaiting: true)
 * são tratados diretamente pelo Service Worker configurado no Serwist.
 */
export function PWAUpdatePrompt() {
  const pathname = usePathname()

  useEffect(() => {
    if (pathname?.startsWith("/print")) return
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV === "development"
    ) {
      return
    }

    navigator.serviceWorker
      .register("/sw.js")
      .catch((error) => {
        console.error("[PWA] Service worker registration failed:", error)
      })
  }, [pathname])

  return null
}
