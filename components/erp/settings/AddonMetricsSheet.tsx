"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import {
  EyeIcon,
  SalesIcon,
  TrendingUpIcon,
  AnalyticsIcon,
  XIcon,
} from "@/lib/icons"
import { IconPlaceholder, Button, Spinner } from "@/components/reusable"
import { HorizontalKPICard } from "@/components/erp/dashboard/cards/HorizontalKPICard"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { PartnerAddonStatus, AddonMetrics } from "@/lib/services/addon.service"
import { getAddonMetricsAction } from "@/app/actions/erp/addons"
import { formatCurrency } from "@/lib/utils"
import { toast } from "@/hooks/use-notification"

interface AddonMetricsSheetProps {
  isOpen: boolean
  onClose: () => void
  addon: PartnerAddonStatus | null
}

function formatMetric(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat("pt-BR").format(n)
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-3.5 shadow-lg flex flex-col gap-2 font-sans min-w-[150px]">
        <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{label}</p>
        <div className="flex flex-col gap-1.5">
          {payload.map((entry: any, index: number) => {
            const color = entry.fill || "var(--color-brand-green)"
            return (
              <div key={index} className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-current shrink-0" style={{ color }} />
                  <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                    {entry.name}
                  </span>
                </div>
                <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
                  {formatMetric(entry.value)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
  return null
}

export function AddonMetricsSheet({
  isOpen,
  onClose,
  addon,
}: AddonMetricsSheetProps) {
  const isMobile = useMediaQuery("(max-width: 1023px)")
  const zIndex = useModalLayer(isOpen)

  const [metrics, setMetrics] = useState<AddonMetrics | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchMetrics = useCallback(async () => {
    if (!addon) return
    setLoading(true)
    try {
      const res = await getAddonMetricsAction(addon.slug)
      if (res.success && res.data) {
        setMetrics(res.data)
      } else {
        toast.error(res.error || "Não foi possível carregar as métricas.")
      }
    } catch {
      toast.error("Erro inesperado ao carregar métricas.")
    } finally {
      setLoading(false)
    }
  }, [addon])

  useEffect(() => {
    if (isOpen && addon) {
      fetchMetrics()
    } else {
      setMetrics(null)
    }
  }, [isOpen, addon, fetchMetrics])

  const kpiItems = useMemo(() => {
    if (!addon) return []
    return [
      {
        title: addon.metricsLabels.sentLabel,
        value: formatMetric(metrics?.sentCount ?? 0),
        icon: EyeIcon,
      },
      {
        title: addon.metricsLabels.clickedLabel,
        value: formatMetric(metrics?.clickedCount ?? 0),
        icon: SalesIcon,
      },
      {
        title: addon.metricsLabels.conversionLabel,
        value: formatMetric(metrics?.conversionCount ?? 0),
        icon: TrendingUpIcon,
      },
      {
        title: "Taxa de Sucesso",
        value: `${metrics?.conversionRate ?? 0}%`,
        icon: AnalyticsIcon,
      },
    ]
  }, [addon, metrics])

  const chartData = useMemo(() => {
    return metrics?.chartData || [
      { name: "Disparos", total: 0, recente: 0 },
      { name: "Interações", total: 0, recente: 0 },
      { name: "Conversões", total: 0, recente: 0 },
    ]
  }, [metrics])

  if (!addon) return null

  const mainContent = (
    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-brand-border p-6 dark:border-dark-border">
        <div className="flex items-center gap-3">
          <img
            src={addon.imageSrc}
            alt={addon.name}
            className="w-10 h-10 rounded-xl object-contain shrink-0"
          />
          <div>
            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading leading-tight">
              {addon.name}
            </h2>
            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
              Métricas e desempenho do aplicativo
            </p>
          </div>
        </div>
        <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
          <XIcon className="h-5 w-5" />
        </Button>
      </header>

      {/* Content List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Spinner size={28} />
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
              Carregando métricas...
            </span>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <HorizontalKPICard items={kpiItems} />

            {/* Comparison BarChart */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col">
              <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-6">
                Comparativo: Histórico vs Últimos 30 dias
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={chartData} barGap={6} barCategoryGap="25%">
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-brand-border)" />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "currentColor", className: "text-brand-inactive-text dark:text-dark-body", fontSize: 12, fontWeight: 500 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "currentColor", className: "text-brand-inactive-text dark:text-dark-body", fontSize: 12, fontWeight: 500 }}
                    />
                    <Tooltip
                      content={<CustomTooltip />}
                      cursor={{ fill: "var(--color-brand-green-light)", opacity: 0.1 }}
                    />
                    <Bar dataKey="total" name="Total Histórico" radius={[6, 6, 0, 0]} fill="var(--color-brand-green)" />
                    <Bar dataKey="recente" name="Últimos 30 Dias" radius={[6, 6, 0, 0]} fill="var(--color-brand-dark)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Faturamento Extra / Recuperado */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">
                  {addon.metricsLabels.revenueLabel}
                </p>
                <p className="text-3xl font-extrabold text-brand-dark dark:text-dark-heading mt-1">
                  {formatCurrency(metrics?.revenueGenerated ?? 0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center shrink-0">
                <TrendingUpIcon className="w-6 h-6 text-brand-green" />
              </div>
            </div>

            {/* Histórico Recente de Atividades */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col gap-4">
              <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                Atividades Recentes
              </h3>

              {!metrics?.recentEvents || metrics.recentEvents.length === 0 ? (
                <div className="py-8">
                  <IconPlaceholder
                    icon={AnalyticsIcon}
                    title="Nenhuma Métrica Disponível"
                    subtitle="Assim que o aplicativo for acionado, as atividades aparecerão aqui."
                  />
                </div>
              ) : (
                <div className="divide-y divide-brand-border dark:divide-dark-border border border-brand-border dark:border-dark-border rounded-xl overflow-hidden">
                  {metrics.recentEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3.5 flex items-center justify-between hover:bg-brand-gray-light dark:hover:bg-dark-border/20 transition-colors"
                    >
                      <div className="truncate">
                        <span className="text-xs font-bold text-brand-dark dark:text-dark-heading block truncate">
                          {ev.label}
                        </span>
                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body block truncate">
                          {ev.description}
                        </span>
                      </div>
                      <div className="text-right shrink-0 pl-3">
                        {ev.amount ? (
                          <span className="text-xs font-bold text-brand-green block">
                            +{formatCurrency(ev.amount)}
                          </span>
                        ) : null}
                        <span className="text-[10px] text-brand-inactive-text block">
                          {new Date(ev.createdAt).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
        <Button variant="outline" className="w-full h-11" onClick={onClose}>
          Fechar
        </Button>
      </footer>
    </div>
  )

  // Responsive: Desktop Sheet (Portal drawer) vs Mobile BottomSheet
  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose}>
        {mainContent}
      </BottomSheet>
    )
  }

  return (
    <Portal>
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ zIndex }}
        onClick={onClose}
      >
        <div
          className={`fixed right-4 top-4 bottom-4 w-[620px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${
            isOpen ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-100"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {mainContent}
        </div>
      </div>
    </Portal>
  )
}
