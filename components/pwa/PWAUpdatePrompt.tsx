"use client"

import { useEffect, useRef, useCallback } from "react"
import { toast } from "@/hooks/use-notification"

/**
 * Registra o service worker e mostra toast quando nova versão está disponível.
 * 
 * Fluxo:
 * 1. Registra SW após hidratação
 * 2. Detecta novo SW instalado (skipWaiting: false)
 * 3. Mostra toast "Nova versão disponível" com botão "Atualizar"
 * 4. Usuário clica → postMessage SKIP_WAITING → controllerchange → reload
 * 
 * NÃO faz reload automático. Usuário decide.
 * 
 * Cleanup:
 * - Remove controllerchange listener no unmount
 * - Remove updatefound listener no unmount
 * - Remove statechange listener de qualquer installing worker
 * - Dismiss toast ativo
 * - Refs previnem múltiplos toasts e listeners duplicados em HMR
 */
export function PWAUpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const hasShownToastRef = useRef(false)
  // Refs para tracking de listeners para cleanup completo
  const controllerChangeRef = useRef<(() => void) | null>(null)
  const updateFoundRef = useRef<(() => void) | null>(null)
  const stateChangeRef = useRef<{ worker: ServiceWorker; handler: () => void } | null>(null)

  const showUpdateToast = useCallback(
    (newWorker: ServiceWorker) => {
      // Guard: evitar múltiplos toasts simultâneos
      if (hasShownToastRef.current) return
      hasShownToastRef.current = true

      toast.success(
        "Atualização Disponível",
        "Uma nova versão foi instalada. Atualizando a página em instantes para aplicar as novidades..."
      )

      setTimeout(() => {
        newWorker.postMessage({ type: "SKIP_WAITING" })
      }, 3000)
    },
    []
  )

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV === "development"
    ) {
      return
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registrationRef.current = registration

        // --- Listener: updatefound ---
        const onUpdateFound = () => {
          const newWorker = registration.installing
          if (!newWorker) return

          // Limpar statechange anterior se existir (caso de múltiplos updates)
          if (stateChangeRef.current) {
            stateChangeRef.current.worker.removeEventListener(
              "statechange",
              stateChangeRef.current.handler
            )
          }

          // --- Listener: statechange ---
          const onStateChange = () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              showUpdateToast(newWorker)
            }
          }

          stateChangeRef.current = { worker: newWorker, handler: onStateChange }
          newWorker.addEventListener("statechange", onStateChange)
        }

        updateFoundRef.current = onUpdateFound
        registration.addEventListener("updatefound", onUpdateFound)

        // Checa se já existe um SW esperando (ex: página aberta muito tempo)
        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdateToast(registration.waiting)
        }
      })
      .catch((error) => {
        console.error("[PWA] Service worker registration failed:", error)
      })

    // --- Listener: controllerchange (SW assumiu controle → reload) ---
    const onControllerChange = () => {
      window.location.reload()
    }
    controllerChangeRef.current = onControllerChange
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    )

    // ============================================================
    // CLEANUP COMPLETO
    // ============================================================
    return () => {
      // 1. Remover controllerchange
      if (controllerChangeRef.current) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          controllerChangeRef.current
        )
        controllerChangeRef.current = null
      }

      // 2. Remover updatefound do registration
      const reg = registrationRef.current
      if (reg && updateFoundRef.current) {
        reg.removeEventListener("updatefound", updateFoundRef.current)
        updateFoundRef.current = null
      }

      // 3. Remover statechange do installing worker
      if (stateChangeRef.current) {
        stateChangeRef.current.worker.removeEventListener(
          "statechange",
          stateChangeRef.current.handler
        )
        stateChangeRef.current = null
      }

      // 4. Dismiss toast ativo
      toast.dismiss("pwa-update")

      // 5. Reset flag de toast
      hasShownToastRef.current = false
    }
  }, [showUpdateToast])

  return null
}
