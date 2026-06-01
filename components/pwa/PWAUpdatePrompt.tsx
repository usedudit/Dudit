"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { SparklesIcon, XIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"

/**
 * Registra o service worker e mostra banner quando nova versão está disponível.
 * 
 * Fluxo:
 * 1. Registra SW após hidratação
 * 2. Detecta novo SW instalado (skipWaiting: false)
 * 3. Mostra banner premium "Atualização Disponível" com botão "Atualizar agora" e "Depois"
 * 4. Usuário clica → postMessage SKIP_WAITING → controllerchange → reload
 * 
 * NÃO faz reload automático. Usuário decide.
 * 
 * Cleanup:
 * - Remove controllerchange listener no unmount
 * - Remove updatefound listener no unmount
 * - Remove statechange listener de qualquer installing worker
 * - Refs previnem múltiplos banners e listeners duplicados em HMR
 */
export function PWAUpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const pendingWorkerRef = useRef<ServiceWorker | null>(null)

  // Refs para tracking de listeners para cleanup completo
  const controllerChangeRef = useRef<(() => void) | null>(null)
  const updateFoundRef = useRef<(() => void) | null>(null)
  const stateChangeRef = useRef<{ worker: ServiceWorker; handler: () => void } | null>(null)

  const triggerUpdatePrompt = useCallback(
    (newWorker: ServiceWorker) => {
      pendingWorkerRef.current = newWorker
      setShowPrompt(true)
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
              triggerUpdatePrompt(newWorker)
            }
          }

          stateChangeRef.current = { worker: newWorker, handler: onStateChange }
          newWorker.addEventListener("statechange", onStateChange)
        }

        updateFoundRef.current = onUpdateFound
        registration.addEventListener("updatefound", onUpdateFound)

        // Checa se já existe um SW esperando (ex: página aberta muito tempo)
        if (registration.waiting && navigator.serviceWorker.controller) {
          triggerUpdatePrompt(registration.waiting)
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

      // Reset state on cleanup
      setShowPrompt(false)
    }
  }, [triggerUpdatePrompt])

  const handleAccept = () => {
    if (pendingWorkerRef.current) {
      pendingWorkerRef.current.postMessage({ type: "SKIP_WAITING" })
    }
    setShowPrompt(false)
  }

  const handleDecline = () => {
    setShowPrompt(false)
  }

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed bottom-6 right-6 z-[99999] w-[calc(100vw-48px)] sm:w-[400px] bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border border-zinc-200/60 dark:border-zinc-800/60 shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-2xl p-5 flex flex-col gap-4 pointer-events-auto"
        >
          <div className="flex gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 shrink-0">
              <SparklesIcon className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 leading-tight">
                Nova versão disponível!
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                Uma atualização do Dudit está pronta para ser aplicada. Atualize a página agora para aplicar as novidades.
              </p>
            </div>
            <button
              onClick={handleDecline}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors self-start"
              title="Fechar"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              onClick={handleDecline}
              variant="outline"
              className="h-9 px-4 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
            >
              Depois
            </Button>
            <Button
              onClick={handleAccept}
              className="h-9 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white shadow-md hover:shadow-lg transition-all"
            >
              Atualizar agora
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
