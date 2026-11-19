"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
  DefaultModal,
  Button,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Spinner,
  InfoCard,
} from "@/components/reusable"
import {
  ShoppingCart,
  TrendingUp,
  RotateCcw,
  Gift,
  ArrowUpRight,
  Send,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react"
import {
  AddonSlug,
  AddonMetrics,
  PartnerAddonStatus,
} from "@/lib/services/addon.service"
import {
  getAddonMetricsAction,
  testPartnerAddonAction,
} from "@/app/actions/erp/addons"
import { formatCurrency } from "@/lib/utils"
import { toast } from "@/hooks/use-notification"

interface AddonMetricsModalProps {
  isOpen: boolean
  onClose: () => void
  addon: PartnerAddonStatus | null
  onStatusChanged?: () => void
}

export function AddonMetricsModal({
  isOpen,
  onClose,
  addon,
  onStatusChanged,
}: AddonMetricsModalProps) {
  const [activeTab, setActiveTab] = useState<"metrics" | "howItWorks">("metrics")
  const [metrics, setMetrics] = useState<AddonMetrics | null>(null)
  const [loadingMetrics, setLoadingMetrics] = useState(false)
  const [isTesting, setIsTesting] = useState(false)

  const fetchMetrics = useCallback(async () => {
    if (!addon) return
    setLoadingMetrics(true)
    try {
      const res = await getAddonMetricsAction(addon.slug)
      if (res.success && res.data) {
        setMetrics(res.data)
      } else {
        toast.error(res.error || "Não foi possível carregar as métricas.")
      }
    } catch {
      toast.error("Erro inesperado ao carregar dados.")
    } finally {
      setLoadingMetrics(false)
    }
  }, [addon])

  useEffect(() => {
    if (isOpen && addon) {
      setActiveTab("metrics")
      fetchMetrics()
    } else {
      setMetrics(null)
    }
  }, [isOpen, addon, fetchMetrics])

  if (!addon) return null

  const handleRunTest = async () => {
    setIsTesting(true)
    try {
      const res = await testPartnerAddonAction(addon.slug)
      if (res.success) {
        toast.success(res.message || "Disparo de teste concluído!")
        await fetchMetrics()
        onStatusChanged?.()
      } else {
        toast.error(res.error || "Erro ao realizar teste.")
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado ao rodar teste.")
    } finally {
      setIsTesting(false)
    }
  }

  const getAddonIcon = (slug: AddonSlug) => {
    switch (slug) {
      case "cart_abandonment":
        return <ShoppingCart className="w-5 h-5 text-brand-green" />
      case "order_bump":
        return <TrendingUp className="w-5 h-5 text-amber-500" />
      case "service_return":
        return <RotateCcw className="w-5 h-5 text-blue-500" />
      case "customer_birthday":
        return <Gift className="w-5 h-5 text-purple-500" />
    }
  }

  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={onClose}
      title={addon.name}
      icon={getAddonIcon(addon.slug)}
      description={
        addon.isIncludedInPlan
          ? "Benefício ativo do seu Plano Escalar"
          : `${formatCurrency(addon.price)}/mês`
      }
      maxWidth="xl"
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "metrics" | "howItWorks")}
        className="w-full"
      >
        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b border-brand-border dark:border-dark-border mb-5">
          <TabsTrigger value="metrics">Métricas & Desempenho</TabsTrigger>
          <TabsTrigger value="howItWorks">Como Funciona</TabsTrigger>
        </TabsList>

        {/* ABA: MÉTRICAS */}
        <TabsContent value="metrics" className="mt-0 space-y-6">
          {/* Top action bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-brand-gray-light dark:bg-dark-surface/60 rounded-2xl border border-brand-border dark:border-dark-border">
            <div>
              <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                Status do Aplicativo
              </p>
              <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                {addon.isEnabled
                  ? "Este acelerador está ativo e operando em tempo real na sua loja."
                  : "Ative o aplicativo no interruptor da página para começar a colher resultados."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunTest}
              isLoading={isTesting}
              disabled={isTesting}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Simular Envio de Teste
            </Button>
          </div>

          {loadingMetrics ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <Spinner size={24} />
              <span className="text-xs text-brand-inactive-text">Carregando métricas em tempo real...</span>
            </div>
          ) : (
            <>
              {/* 4 Cards de Métricas Principais */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                {/* 1. Enviados / Exibidos */}
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border flex flex-col justify-between">
                  <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                    {addon.metricsLabels.sentLabel}
                  </span>
                  <div className="mt-2">
                    <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                      {metrics?.sentCount ?? 0}
                    </span>
                  </div>
                </div>

                {/* 2. Interações / Cliques */}
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border flex flex-col justify-between">
                  <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                    {addon.metricsLabels.clickedLabel}
                  </span>
                  <div className="mt-2">
                    <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                      {metrics?.clickedCount ?? 0}
                    </span>
                  </div>
                </div>

                {/* 3. Conversões */}
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border flex flex-col justify-between">
                  <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                    {addon.metricsLabels.conversionLabel}
                  </span>
                  <div className="mt-2">
                    <span className="text-2xl font-bold text-brand-green">
                      {metrics?.conversionCount ?? 0}
                    </span>
                  </div>
                </div>

                {/* 4. Taxa de Conversão */}
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border flex flex-col justify-between">
                  <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                    Taxa de Sucesso
                  </span>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                      {metrics?.conversionRate ?? 0}%
                    </span>
                    {(metrics?.conversionRate ?? 0) > 0 && (
                      <ArrowUpRight className="w-4 h-4 text-brand-green" />
                    )}
                  </div>
                </div>
              </div>

              {/* Faturamento Gerado / Resgatado */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                    {addon.metricsLabels.revenueLabel}
                  </p>
                  <p className="text-2xl font-extrabold text-brand-dark dark:text-dark-heading mt-0.5">
                    {formatCurrency(metrics?.revenueGenerated ?? 0)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>

              {/* Histórico Recente de Disparos */}
              <div>
                <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">
                  Atividades Recentes
                </h4>

                {!metrics?.recentEvents || metrics.recentEvents.length === 0 ? (
                  <div className="p-6 text-center rounded-2xl border border-dashed border-brand-border dark:border-dark-border">
                    <AlertCircle className="w-6 h-6 text-brand-inactive-text mx-auto mb-2" />
                    <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                      Nenhuma atividade registrada ainda
                    </p>
                    <p className="text-xs text-brand-inactive-text mt-1 max-w-sm mx-auto">
                      Assim que o robô realizar disparos ou clientes interagirem, os registros aparecerão aqui em tempo real.
                    </p>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={handleRunTest}
                      isLoading={isTesting}
                      className="mt-3 text-xs"
                    >
                      Fazer primeiro envio de teste
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-brand-border dark:divide-dark-border border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden bg-white dark:bg-dark-surface max-h-[260px] overflow-y-auto">
                    {metrics.recentEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-3.5 flex items-center justify-between hover:bg-brand-gray-light dark:hover:bg-dark-border/20 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center shrink-0">
                            <Send className="w-4 h-4 text-brand-green" />
                          </div>
                          <div className="truncate">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-brand-dark dark:text-dark-heading truncate">
                                {ev.label}
                              </span>
                              {ev.isTest && (
                                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                  Teste
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-brand-inactive-text dark:text-dark-body truncate block">
                              {ev.description}
                            </span>
                          </div>
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
        </TabsContent>

        {/* ABA: COMO FUNCIONA */}
        <TabsContent value="howItWorks" className="mt-0 space-y-4">
          <div className="p-4 bg-brand-gray-light dark:bg-dark-surface/60 rounded-2xl border border-brand-border dark:border-dark-border">
            <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-1">
              Visão Geral
            </h4>
            <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-relaxed">
              {addon.fullDescription}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">
              O que este aplicativo faz por você:
            </h4>
            <div className="space-y-2.5">
              {addon.features.map((feature, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 p-3 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-xs"
                >
                  <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0 mt-0.5" />
                  <span className="text-brand-dark dark:text-dark-heading font-medium leading-relaxed">
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-blue-100 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20">
            <h5 className="text-xs font-bold text-blue-900 dark:text-blue-300 mb-1">
              Investimento & Retorno
            </h5>
            <p className="text-xs text-blue-800 dark:text-blue-400 leading-relaxed">
              Mensalidade de apenas{" "}
              <strong>{formatCurrency(addon.price)}/mês</strong> (ou 100% grátis se você estiver no Plano Escalar).
              Com apenas 1 venda extra ou cliente recuperado no mês, o aplicativo já se paga sozinho.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </DefaultModal>
  )
}
