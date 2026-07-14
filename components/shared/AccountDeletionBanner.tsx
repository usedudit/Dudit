"use client"

import { useState, useEffect } from "react"
import { cancelDeletionAction } from "@/app/actions/shared/decelerate-deletion"
import { createClient } from "@/lib/supabase/client"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Button } from "@/components/reusable"
import { AlertTriangle } from "lucide-react"

export function AccountDeletionBanner() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [graceEndsAt, setGraceEndsAt] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState("")

  // Fetch the grace period duration from database
  useEffect(() => {
    const fetchGracePeriod = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data } = await supabase
          .from("account_deletions")
          .select("grace_period_ends_at")
          .eq("user_id", user.id)
          .not("status", "eq", "completed")
          .maybeSingle()

        if (data?.grace_period_ends_at) {
          setGraceEndsAt(data.grace_period_ends_at)
        }
      } catch (err) {
        console.error("Error fetching grace period:", err)
      }
    }
    fetchGracePeriod()
  }, [])

  // Timer countdown hook
  useEffect(() => {
    if (!graceEndsAt) return

    const updateTimer = () => {
      const diff = new Date(graceEndsAt).getTime() - new Date().getTime()
      if (diff <= 0) {
        setTimeLeft("0h 0m 0s")
        return
      }
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      setTimeLeft(`${hours}h ${minutes}m ${seconds}s`)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [graceEndsAt])

  const handleCancelDeletion = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await cancelDeletionAction()
      if (res?.error) {
        setError(res.error)
      } else {
        // Success: refresh the page to clear the pending deletion state
        window.location.reload()
      }
    } catch (err) {
      setError("Erro inesperado ao cancelar a exclusão.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Small floating square badge in top right corner */}
      <div
        onClick={() => setIsModalOpen(true)}
        className="fixed top-4 right-4 z-[9999] w-12 h-12 flex items-center justify-center rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 border border-red-300 dark:border-red-900/50 shadow-lg cursor-pointer hover:scale-105 active:scale-95 transition-all animate-bounce"
        title="Exclusão de conta agendada"
      >
        <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
      </div>

      {/* Warning detail & Cancel options modal */}
      <DefaultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Encerramento de Conta Agendado"
      >
        <div className="space-y-6 pt-2 pb-4">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/50">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">
              Esta conta e todos os seus dados serão permanentemente excluídos. O processo é irreversível após o prazo de carência.
            </p>
          </div>

          <div className="border border-brand-border dark:border-dark-border rounded-2xl p-6 bg-white dark:bg-dark-surface space-y-4">
            <div className="text-center space-y-1">
              <span className="text-xs font-bold text-brand-inactive-text uppercase tracking-wider block">
                Tempo restante para cancelamento
              </span>
              <span className="text-3xl font-extrabold text-brand-dark dark:text-dark-heading tabular-nums block animate-pulse">
                {timeLeft || "Calculando..."}
              </span>
            </div>

            <div className="w-full h-px bg-brand-border dark:bg-dark-border" />

            <div className="text-sm space-y-2 text-brand-dark/80 dark:text-dark-body">
              <p>
                Durante o período de carência de <strong>48 horas</strong>, os seus benefícios permanecem ativos, mas todas as operações de alteração de dados no ERP estão bloqueadas.
              </p>
              <p>
                Caso decida continuar utilizando a Dudit, você pode cancelar o encerramento da conta abaixo a qualquer momento.
              </p>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 font-semibold text-center">
              {error}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 h-12 font-bold"
            >
              Manter exclusão agendada
            </Button>
            <Button
              variant="default"
              onClick={handleCancelDeletion}
              disabled={loading}
              className="flex-1 h-12 bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              {loading ? "Processando..." : "Cancelar exclusão da conta"}
            </Button>
          </div>
        </div>
      </DefaultModal>
    </>
  )
}

export default AccountDeletionBanner
