"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/reusable"
import { useStore } from "@/lib/store-context"
import { formatCurrency } from "@/lib/utils"
import { getRevenueLimitStatusAction, type RevenueLimitStatus } from "@/app/actions/erp/fiscal-entity"
import { REVENUE_LIMIT_STATUS_META } from "@/lib/fiscal-entity"
import { AlertCircleIcon, TrendingUpIcon } from "@/lib/icons"

/**
 * Card do painel com o consumo do limite anual de faturamento (MEI/nano).
 * Fica oculto quando o parceiro ainda não informou o perfil fiscal.
 */
export function RevenueLimitCard() {
  const { selectedStore } = useStore()
  const storeId = selectedStore?.id
  const [status, setStatus] = useState<RevenueLimitStatus | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!storeId) {
      setStatus(null)
      setLoaded(true)
      return
    }
    let active = true
    // Evita exibir o limite da loja anterior enquanto a nova consulta carrega.
    setLoaded(false)
    setStatus(null)
    getRevenueLimitStatusAction({ storeId })
      .then((res) => {
        if (active && res.success && res.data) setStatus(res.data)
      })
      .catch(() => { })
      .finally(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [storeId])

  if (!loaded || !status?.snapshot?.limit) return null

  const snapshot = status.snapshot
  const meta = REVENUE_LIMIT_STATUS_META[snapshot.status]
  const barColor =
    meta.tone === "red"
      ? "bg-brand-red"
      : meta.tone === "orange"
        ? "bg-orange-500"
        : meta.tone === "green"
          ? "bg-brand-green"
          : "bg-gray-400"

  return (
    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${meta.tone === "red"
              ? "bg-red-50 dark:bg-red-900/10 text-brand-red"
              : meta.tone === "orange"
                ? "bg-yellow-50 dark:bg-yellow-900/10 text-yellow-600 dark:text-yellow-400"
                : "bg-green-50 dark:bg-green-900/10 text-brand-green"
              }`}
          >
            {meta.tone === "green" ? (
              <TrendingUpIcon className="h-5 w-5" />
            ) : (
              <AlertCircleIcon className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">
              Limite de faturamento {status.year}
            </p>
            <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
              {status.profileLabel} · {formatCurrency(snapshot.revenue)} de {formatCurrency(snapshot.limit ?? 0)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant={meta.tone === "gray" ? "gray" : meta.tone}>{meta.label}</Badge>
          <Link
            href="/erp/configuracoes?tab=dados-do-negocio&fiscal=1"
            className="text-xs font-bold text-brand-primary hover:underline whitespace-nowrap"
          >
            Ver detalhes
          </Link>
        </div>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-brand-gray dark:bg-dark-border">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, snapshot.percentage)}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-brand-inactive-text dark:text-dark-body">
        <span>
          <strong className="text-brand-dark dark:text-dark-heading">{snapshot.percentage}%</strong> consumido
        </span>
        <span>
          Restam <strong className="text-brand-dark dark:text-dark-heading">{formatCurrency(snapshot.remaining ?? 0)}</strong>
        </span>
        {snapshot.projectedAnnual != null && (
          <span>
            Projeção: <strong className="text-brand-dark dark:text-dark-heading">{formatCurrency(snapshot.projectedAnnual)}</strong>
          </span>
        )}
        {snapshot.projectedBreachDate && (
          <span className="text-brand-orange">
            Limite estimado em{" "}
            {new Date(`${snapshot.projectedBreachDate}T00:00:00`).toLocaleDateString("pt-BR")}
          </span>
        )}
      </div>
    </div>
  )
}
