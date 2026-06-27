"use client"

import { useOnlineStatus } from "@/hooks/use-online-status"

/**
 * Banner de status offline.
 * - variant="erp": aviso urgente (dados podem estar desatualizados)
 * - variant="marketplace": aviso sutil (conteúdo salvo)
 */
export function OfflineBanner({ variant = "marketplace" }: { variant?: "erp" | "marketplace" }) {
  const isOnline = useOnlineStatus()

  if (isOnline) return null

  if (variant === "erp") {
    return (
      <div className="w-full bg-brand-red px-4 py-2 text-white text-center text-sm font-medium flex items-center justify-center gap-2 z-50 shrink-0">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <path
            d="M8 1.33337L1.33334 14H14.6667L8 1.33337Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M8 6V9.33333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.6667" r="0.6667" fill="currentColor" />
        </svg>
        <span>Sem conexão - Dados do ERP não estão disponíveis offline. Reconecte para continuar.</span>
      </div>
    )
  }

  return (
    <div className="w-full bg-brand-orange/90 px-4 py-1.5 text-white text-center text-xs font-medium z-50 shrink-0">
      Você está offline - Mostrando conteúdo salvo anteriormente.
    </div>
  )
}
