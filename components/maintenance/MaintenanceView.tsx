"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { ReloadIcon, LockIcon, XIcon, CheckCircleIcon, AlertTriangleIcon } from "@/lib/icons"
import { setBypassCookieAction } from "@/app/actions/admin/system"
import type { MaintenanceConfig } from "@/lib/system/types"

interface MaintenanceViewProps {
  initialConfig?: Partial<MaintenanceConfig>
}

export function MaintenanceView({ initialConfig }: MaintenanceViewProps) {
  const router = useRouter()
  const [message] = useState(
    initialConfig?.message ||
    "Estamos realizando uma manutenção programada para trazer melhorias na plataforma Dudit. Voltaremos em breve!"
  )
  const [estimatedEnd] = useState<string | null>(initialConfig?.estimated_end || null)
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number } | null>(null)
  const [isBypassModalOpen, setIsBypassModalOpen] = useState(false)
  const [bypassToken, setBypassToken] = useState("")
  const [isSubmittingBypass, setIsSubmittingBypass] = useState(false)
  const [bypassError, setBypassError] = useState<string | null>(null)
  const [bypassSuccess, setBypassSuccess] = useState(false)

  useEffect(() => {
    if (!estimatedEnd) return

    const updateCountdown = () => {
      const diff = new Date(estimatedEnd).getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft(null)
        return
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      setTimeLeft({ hours, minutes, seconds })
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [estimatedEnd])

  const handleRefresh = () => {
    router.refresh()
    window.location.reload()
  }

  const handleBypassSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bypassToken.trim()) return

    setIsSubmittingBypass(true)
    setBypassError(null)

    try {
      const res = await setBypassCookieAction(bypassToken.trim())
      if (res.success) {
        setBypassSuccess(true)
        setTimeout(() => {
          window.location.href = "/ddt-admin"
        }, 800)
      } else {
        setBypassError(res.error || "Chave de acesso inválida.")
      }
    } catch {
      setBypassError("Ocorreu um erro ao validar a chave.")
    } finally {
      setIsSubmittingBypass(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-dark-background transition-colors duration-300">
      <header className="lg:flex flex-col w-full bg-brand-dark dark:bg-dark-surface border-b border-white/10 sticky top-0 z-50 shadow-md">
        <div className="w-full h-[68px] flex items-center justify-center max-w-[1400px] px-2 mx-auto gap-4">
          <a href="/" className="cursor-pointer shrink-0 z-[110] pt-1">
            <img
              src="https://img.dudit.com.br/static/Logo.png"
              alt="Dudit"
              width={140}
              height={40}
              className="h-10 w-auto object-contain"
            />
          </a>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 mt-20 md:mt-32">
        <div className="max-w-2xl w-full flex flex-col items-center">
          <img
            src="https://img.dudit.com.br/static/mascots/Ops.png"
            alt="Manutenção"
            className="w-72 h-72 mb-4 object-contain"
          />

          <h1 className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2 text-center">
            Estamos em manutenção
          </h1>

          <p className="text-brand-inactive-text dark:text-dark-body max-w-sm text-center">
            {message}
          </p>

          {timeLeft && (
            <div className="w-full mt-6 max-w-sm">
              <div className="bg-brand-gray dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg px-4 py-3 flex gap-3 items-start">
                <div className="bg-brand-green w-1 rounded-full self-stretch shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase font-bold text-brand-inactive-text dark:text-dark-body mb-2">
                    Previsão estimada de retorno
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <span className="text-xl font-bold text-brand-dark dark:text-dark-heading font-mono">
                        {String(timeLeft.hours).padStart(2, "0")}
                      </span>
                      <p className="text-[10px] text-brand-inactive-text dark:text-dark-body">Horas</p>
                    </div>
                    <div className="text-center">
                      <span className="text-xl font-bold text-brand-dark dark:text-dark-heading font-mono">
                        {String(timeLeft.minutes).padStart(2, "0")}
                      </span>
                      <p className="text-[10px] text-brand-inactive-text dark:text-dark-body">Minutos</p>
                    </div>
                    <div className="text-center">
                      <span className="text-xl font-bold text-brand-dark dark:text-dark-heading font-mono">
                        {String(timeLeft.seconds).padStart(2, "0")}
                      </span>
                      <p className="text-[10px] text-brand-inactive-text dark:text-dark-body">Segundos</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-row flex-wrap items-center justify-center gap-3 mt-8">
            <button
              onClick={handleRefresh}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-green px-6 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-brand-green/90"
            >
              <ReloadIcon className="w-4 h-4" />
              Verificar se voltou
            </button>
            <button
              onClick={() => setIsBypassModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-border bg-white px-6 py-2.5 text-sm font-semibold text-brand-dark transition-all duration-150 hover:bg-brand-gray dark:bg-dark-surface dark:border-dark-border dark:text-dark-heading dark:hover:bg-dark-border"
            >
              <LockIcon className="w-4 h-4" />
              Acesso da Equipe
            </button>
          </div>
        </div>
      </main>

      <footer className="w-full h-[68px] py-6 border-t border-white/10 bg-brand-dark dark:bg-dark-surface">
        <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row justify-center items-center">
          <p className="text-white text-xs sm:text-sm font-medium tracking-tight">
            © {new Date().getFullYear()} Dudit Tecnologia Ltda. Todos os
            direitos reservados.
          </p>
        </div>
      </footer>

      <AnimatePresence>
        {isBypassModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6 shadow-2xl"
            >
              <button
                onClick={() => setIsBypassModalOpen(false)}
                className="absolute top-4 right-4 text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading p-1 rounded-lg hover:bg-brand-gray dark:hover:bg-dark-border transition"
              >
                <XIcon className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-brand-green/10 border border-brand-green/20 text-brand-green">
                  <LockIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Acesso Administrativo</h3>
                  <p className="text-xs text-brand-inactive-text dark:text-dark-body">Digite a chave de bypass para navegar e testar a plataforma.</p>
                </div>
              </div>

              <form onSubmit={handleBypassSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1.5">
                    Chave de Acesso (Bypass Token)
                  </label>
                  <input
                    type="password"
                    value={bypassToken}
                    onChange={(e) => setBypassToken(e.target.value)}
                    placeholder="Digite a chave secreta..."
                    className="w-full px-4 py-2.5 bg-brand-gray dark:bg-dark-background border border-brand-border dark:border-dark-border rounded-xl text-brand-dark dark:text-dark-heading placeholder-brand-inactive-text dark:placeholder-dark-body text-sm focus:outline-none focus:border-brand-green transition"
                    autoFocus
                  />
                </div>

                {bypassError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl text-red-700 dark:text-red-300/80 text-xs flex items-center gap-2">
                    <AlertTriangleIcon className="w-4 h-4 shrink-0" />
                    <span>{bypassError}</span>
                  </div>
                )}

                {bypassSuccess && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-xl text-emerald-700 dark:text-emerald-300/80 text-xs flex items-center gap-2">
                    <CheckCircleIcon className="w-4 h-4 shrink-0" />
                    <span>Acesso liberado! Redirecionando...</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsBypassModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading rounded-lg transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingBypass || !bypassToken.trim()}
                    className="px-5 py-2.5 bg-brand-green hover:bg-brand-green/90 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer"
                  >
                    {isSubmittingBypass ? "Verificando..." : "Desbloquear"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
