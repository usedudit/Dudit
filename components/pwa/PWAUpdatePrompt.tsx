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
      window !== window.top ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV === "development"
    ) {
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        // Verifica se /sw.js existe como script JS antes de registrar.
        // Quando DISABLE_PWA ou BUILD_FOR_RENDER está ativo, o arquivo não é
        // gerado e /sw.js responde HTML 404, gerando SecurityError no console.
        const probe = await fetch("/sw.js", { method: "HEAD", cache: "no-store" })
        const contentType = probe.headers.get("content-type") || ""
        if (cancelled || !probe.ok || !contentType.includes("javascript")) {
          return
        }

        await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      } catch (error) {
        if (!cancelled) {
          console.error("[PWA] Service worker registration failed:", error)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pathname])

  return null
}
