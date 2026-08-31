"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { ShieldIcon, ReloadIcon, LockIcon, XIcon, CheckCircleIcon, AlertTriangleIcon } from "@/lib/icons"
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

  // Countdown timer calculation if estimated_end is provided
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
    <div className="relative min-h-screen bg-[#071311] text-zinc-100 flex flex-col justify-between overflow-hidden selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Background visual elements */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-[#071311]/80 to-[#071311] pointer-events-none" />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-teal-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Top Header */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <span className="font-black text-xl text-white tracking-tighter">D</span>
          </div>
          <span className="font-bold text-xl tracking-tight text-white">Dudit</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
          <span className="text-xs font-semibold text-amber-300/90 tracking-wide uppercase">
            Manutenção Programada
          </span>
        </div>
      </header>

      {/* Central Content */}
      <main className="relative z-10 w-full max-w-2xl mx-auto px-6 py-12 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
          {/* Main Icon Badge */}
          <div className="w-20 h-20 rounded-2xl bg-zinc-900/90 border border-emerald-500/30 flex items-center justify-center shadow-2xl shadow-emerald-950 mb-8 backdrop-blur-md">
            <ShieldIcon className="w-10 h-10 text-emerald-400 animate-pulse" />
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-tight mb-4">
            Estamos preparando <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">
              novidades para você
            </span>
          </h1>

          <p className="text-base sm:text-lg text-zinc-400 max-w-xl leading-relaxed mb-8">
            {message}
          </p>

          {/* Countdown Card (if estimated_end exists) */}
          {timeLeft && (
            <div className="w-full bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 mb-8 backdrop-blur-md shadow-xl">
              <p className="text-xs uppercase font-bold text-zinc-400 tracking-wider mb-4">
                Previsão estimada de retorno
              </p>
              <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
                <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-3 flex flex-col items-center">
                  <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                    {String(timeLeft.hours).padStart(2, "0")}
                  </span>
                  <span className="text-[10px] uppercase font-semibold text-zinc-400 mt-1">Horas</span>
                </div>
                <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-3 flex flex-col items-center">
                  <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                    {String(timeLeft.minutes).padStart(2, "0")}
                  </span>
                  <span className="text-[10px] uppercase font-semibold text-zinc-400 mt-1">Minutos</span>
                </div>
                <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-3 flex flex-col items-center">
                  <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                    {String(timeLeft.seconds).padStart(2, "0")}
                  </span>
                  <span className="text-[10px] uppercase font-semibold text-zinc-400 mt-1">Segundos</span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
            <button
              onClick={handleRefresh}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-zinc-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <ReloadIcon className="w-4 h-4 text-zinc-950" />
              Verificar se voltou
            </button>

            <button
              onClick={() => setIsBypassModalOpen(true)}
              className="w-full sm:w-auto px-5 py-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-300 hover:text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <LockIcon className="w-4 h-4 text-zinc-400" />
              Acesso da Equipe
            </button>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-400 gap-4 border-t border-zinc-800/50">
        <p>© {new Date().getFullYear()} Dudit Tecnologia Ltda. Todos os direitos reservados.</p>
        <p className="flex items-center gap-2">
          <span>Status do Sistema:</span>
          <span className="text-amber-400 font-semibold">Atualização em andamento</span>
        </p>
      </footer>

      {/* Admin Bypass Modal */}
      <AnimatePresence>
        {isBypassModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl"
            >
              <button
                onClick={() => setIsBypassModalOpen(false)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
              >
                <XIcon className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <LockIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Acesso Administrativo</h3>
                  <p className="text-xs text-zinc-400">Digite a chave de bypass para navegar e testar a plataforma.</p>
                </div>
              </div>

              <form onSubmit={handleBypassSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Chave de Acesso (Bypass Token)
                  </label>
                  <input
                    type="password"
                    value={bypassToken}
                    onChange={(e) => setBypassToken(e.target.value)}
                    placeholder="Digite a chave secreta..."
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-emerald-500 transition"
                    autoFocus
                  />
                </div>

                {bypassError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2">
                    <AlertTriangleIcon className="w-4 h-4 shrink-0" />
                    <span>{bypassError}</span>
                  </div>
                )}

                {bypassSuccess && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircleIcon className="w-4 h-4 shrink-0" />
                    <span>Acesso liberado! Redirecionando...</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsBypassModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-lg transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingBypass || !bypassToken.trim()}
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 cursor-pointer"
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
