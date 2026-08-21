"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Button,
  FormDropdown,
  Badge,
  ThreeDotsLoader,
  Checkbox,
} from "@/components/reusable"
import { KPICard } from "@/components/erp/dashboard/cards/KPICard"
import { formatCurrency } from "@/lib/utils"
import {
  FileIcon,
  ExportFileIcon,
  ClockIcon,
  ArrowUpDownIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MoneyIcon,
  CreditCardIcon,
  ShoppingCartIcon,
  Users,
} from "@/lib/icons"
import { getDreReportAction } from "@/app/actions/erp/dre"
import type { DreReportData, DreRegime, DreNode, DreSubItem } from "@/lib/services/dre.service"
import { useNotification } from "@/hooks/use-notification"

interface StoreOption {
  id: string
  name: string
}

interface DreViewProps {
  partnerId: string
  stores?: StoreOption[]
  activeStoreId?: string | null
}

type PeriodPreset = "current_month" | "last_month" | "last_30_days" | "current_quarter" | "current_year"

function getPresetDates(preset: PeriodPreset): { startDate: string; endDate: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed

  if (preset === "current_month") {
    const start = new Date(Date.UTC(year, month, 1))
    const end = new Date(Date.UTC(year, month + 1, 0))
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    }
  }

  if (preset === "last_month") {
    const start = new Date(Date.UTC(year, month - 1, 1))
    const end = new Date(Date.UTC(year, month, 0))
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    }
  }

  if (preset === "last_30_days") {
    const end = new Date()
    const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    }
  }

  if (preset === "current_quarter") {
    const quarter = Math.floor(month / 3)
    const start = new Date(Date.UTC(year, quarter * 3, 1))
    const end = new Date(Date.UTC(year, (quarter + 1) * 3, 0))
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    }
  }

  // current_year
  const start = new Date(Date.UTC(year, 0, 1))
  const end = new Date(Date.UTC(year, 11, 31))
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
}

export function DreView({ partnerId, stores = [], activeStoreId }: DreViewProps) {
  const { error: notifyError, success: notifySuccess } = useNotification()

  const [preset, setPreset] = useState<PeriodPreset>("current_month")
  const [selectedStoreId, setSelectedStoreId] = useState<string>(activeStoreId || "all")
  const [regime, setRegime] = useState<DreRegime>("competencia")
  const [comparePrevious, setComparePrevious] = useState<boolean>(true)

  const [loading, setLoading] = useState<boolean>(true)
  const [report, setReport] = useState<DreReportData | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    "1_receita_bruta": true,
    "2_deducoes": true,
    "4_custos_diretos": true,
    "6_1_despesas_comerciais": true,
    "6_2_despesas_administrativas": true,
    "6_3_pro_labore": true,
    "8_resultado_financeiro": true,
  })

  const dates = useMemo(() => getPresetDates(preset), [preset])

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getDreReportAction({
        partnerId,
        storeId: selectedStoreId === "all" ? null : selectedStoreId,
        startDate: dates.startDate,
        endDate: dates.endDate,
        regime,
        compareWithPrevious: comparePrevious,
      })

      if (res.success && res.data) {
        setReport(res.data)
      } else {
        notifyError("Erro ao carregar DRE", res.error || "Não foi possível calcular a DRE.")
      }
    } catch {
      notifyError("Erro ao carregar DRE", "Ocorreu uma falha na conexão.")
    } finally {
      setLoading(false)
    }
  }, [partnerId, selectedStoreId, dates, regime, comparePrevious, notifyError])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const toggleNode = (key: string) => {
    setExpandedNodes((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const expandAll = () => {
    if (!report) return
    const allKeys: Record<string, boolean> = {}
    Object.values(report.structure).forEach((node) => {
      allKeys[node.key] = true
    })
    setExpandedNodes(allKeys)
  }

  const collapseAll = () => {
    setExpandedNodes({})
  }

  const handleExportPdf = () => {
    window.print()
  }

  const handleExportCsv = () => {
    if (!report) return
    let csv = "Linha;Tipo;Valor Atual (R$);Analise Vertical (%);Valor Anterior (R$);Variacao (%)\n"
    
    Object.values(report.structure).forEach((node) => {
      csv += `"${node.title}";"${node.type}";"${node.amount.toFixed(2)}";"${node.verticalPercent.toFixed(2)}%";"${(node.previousAmount ?? 0).toFixed(2)}";"${(node.horizontalVariation ?? 0).toFixed(2)}%"\n`
      node.items.forEach((item) => {
        csv += `  "${item.name}";"Item";"${item.amount.toFixed(2)}";"${item.verticalPercent.toFixed(2)}%";"${(item.previousAmount ?? 0).toFixed(2)}";"${(item.horizontalVariation ?? 0).toFixed(2)}%"\n`
      })
    })

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `DRE_${dates.startDate}_a_${dates.endDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    notifySuccess("DRE exportada com sucesso!")
  }

  const periodOptions = [
    { value: "current_month", label: "Mês Atual" },
    { value: "last_month", label: "Mês Anterior" },
    { value: "last_30_days", label: "Últimos 30 Dias" },
    { value: "current_quarter", label: "Trimestre Atual" },
    { value: "current_year", label: "Ano Completo" },
  ]

  const storeOptions = [
    { value: "all", label: "Todas as Lojas (Consolidado)" },
    ...stores.map((s) => ({ value: s.id, label: s.name })),
  ]

  const kpis = report?.kpis

  return (
    <div className="w-full space-y-6">
      {/* ── Controles Superiores ────────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white dark:bg-dark-card border border-brand-gray/30 dark:border-dark-border p-4 rounded-2xl shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor de Período */}
          <div className="w-44">
            <FormDropdown
              options={periodOptions}
              value={preset}
              onChange={(val) => setPreset(val as PeriodPreset)}
            />
          </div>

          {/* Seletor de Loja (se houver múltiplas) */}
          {stores.length > 1 && (
            <div className="w-56">
              <FormDropdown
                options={storeOptions}
                value={selectedStoreId}
                onChange={(val) => setSelectedStoreId(val)}
              />
            </div>
          )}

          {/* Regime: Competência vs Caixa */}
          <div className="flex items-center bg-brand-gray/20 dark:bg-dark-border/40 p-1 rounded-xl border border-brand-gray/30 dark:border-dark-border">
            <button
              type="button"
              onClick={() => setRegime("competencia")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                regime === "competencia"
                  ? "bg-brand-primary text-white shadow-xs"
                  : "text-brand-dark/70 dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading"
              }`}
            >
              Competência
            </button>
            <button
              type="button"
              onClick={() => setRegime("caixa")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                regime === "caixa"
                  ? "bg-brand-primary text-white shadow-xs"
                  : "text-brand-dark/70 dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading"
              }`}
            >
              Caixa
            </button>
          </div>

          {/* Comparativo Anterior */}
          <div className="flex items-center gap-2 pl-2">
            <Checkbox
              checked={comparePrevious}
              onCheckedChange={(checked) => setComparePrevious(Boolean(checked))}
            />
            <span className="text-xs text-brand-dark/80 dark:text-dark-body font-medium select-none">
              Comparar anterior
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={expandedNodes["1_receita_bruta"] ? collapseAll : expandAll}
            className="text-xs h-9"
          >
            <ArrowUpDownIcon className="w-3.5 h-3.5 mr-1.5" />
            {expandedNodes["1_receita_bruta"] ? "Recolher tudo" : "Expandir tudo"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="text-xs h-9"
          >
            <ExportFileIcon className="w-3.5 h-3.5 mr-1.5" />
            Exportar CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            className="text-xs h-9"
          >
            <FileIcon className="w-3.5 h-3.5 mr-1.5" />
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center space-y-3 bg-white dark:bg-dark-card border border-brand-gray/30 dark:border-dark-border rounded-2xl">
          <ThreeDotsLoader />
          <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-muted">
            Calculando DRE e indicadores financeiros...
          </p>
        </div>
      ) : report ? (
        <>
          {/* ── KPI Summary Cards ───────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPICard
              title="Receita Líquida"
              value={formatCurrency(kpis?.netRevenue || 0)}
              subtext={`Bruta: ${formatCurrency(kpis?.grossRevenue || 0)}`}
              colorVariant="blue"
            />
            <KPICard
              title="Margem Bruta"
              value={`${kpis?.grossMarginPercent || 0}%`}
              subtext={`Lucro: ${formatCurrency(kpis?.grossProfit || 0)}`}
              colorVariant={(kpis?.grossMarginPercent || 0) >= 35 ? "emerald" : "amber"}
            />
            <KPICard
              title="Margem Contribuição"
              value={`${kpis?.contributionMarginPercent || 0}%`}
              subtext={formatCurrency(kpis?.contributionMarginAmount || 0)}
              colorVariant="indigo"
            />
            <KPICard
              title="EBITDA Operacional"
              value={formatCurrency(kpis?.ebitdaAmount || 0)}
              subtext={`Margem: ${kpis?.ebitdaMarginPercent || 0}%`}
              colorVariant={(kpis?.ebitdaAmount || 0) >= 0 ? "emerald" : "rose"}
            />
            <KPICard
              title="Ponto de Equilíbrio"
              value={formatCurrency(kpis?.breakEvenPointAmount || 0)}
              subtext={`Custos Fixos: ${formatCurrency(kpis?.fixedExpensesAmount || 0)}`}
              colorVariant="purple"
            />
            <KPICard
              title="Lucro Líquido"
              value={formatCurrency(kpis?.netProfitAmount || 0)}
              subtext={`Margem: ${kpis?.netMarginPercent || 0}%`}
              colorVariant={(kpis?.netProfitAmount || 0) >= 0 ? "emerald" : "rose"}
            />
          </div>

          {/* ── Tabela Estruturada DRE ─────────────────────────────────────── */}
          <div className="bg-white dark:bg-dark-card border border-brand-gray/30 dark:border-dark-border rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-brand-gray/20 dark:border-dark-border flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                  Demonstração do Resultado do Exercício
                </h2>
                <p className="text-xs text-brand-inactive-text dark:text-dark-muted mt-0.5">
                  Regime de {regime === "competencia" ? "Competência (Econômico)" : "Caixa (Financeiro)"} • Período: {report.period.startDate} até {report.period.endDate}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs bg-brand-gray/20 dark:bg-dark-border/40">
                  Base 100%: {formatCurrency(kpis?.grossRevenue || 0)}
                </Badge>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-brand-gray/10 dark:bg-dark-border/20 border-b border-brand-gray/20 dark:border-dark-border text-xs font-semibold text-brand-dark/70 dark:text-dark-muted">
                    <th className="py-3 px-4 w-1/2">Estrutura Contábil / Descrição</th>
                    <th className="py-3 px-4 text-right">Período Atual (R$)</th>
                    <th className="py-3 px-4 text-right">AV (%)</th>
                    {comparePrevious && (
                      <>
                        <th className="py-3 px-4 text-right">Período Anterior (R$)</th>
                        <th className="py-3 px-4 text-right">AH (%)</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-gray/15 dark:divide-dark-border/40">
                  {Object.values(report.structure).map((node) => (
                    <DreTableRow
                      key={node.key}
                      node={node}
                      isExpanded={Boolean(expandedNodes[node.key])}
                      onToggle={() => toggleNode(node.key)}
                      showComparison={comparePrevious}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

interface DreTableRowProps {
  node: DreNode
  isExpanded: boolean
  onToggle: () => void
  showComparison: boolean
}

function DreTableRow({ node, isExpanded, onToggle, showComparison }: DreTableRowProps) {
  const isSubtotal = node.type === "subtotal"
  const isResult = node.type === "result"
  const hasItems = node.items && node.items.length > 0

  const getRowBg = () => {
    if (isResult) return "bg-emerald-500/10 dark:bg-emerald-500/15 font-bold"
    if (isSubtotal) return "bg-brand-gray/15 dark:bg-dark-border/30 font-semibold"
    return "hover:bg-brand-gray/5 dark:hover:bg-dark-border/10"
  }

  const getAmountColor = () => {
    if (node.type === "result") {
      return node.amount >= 0 ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-rose-600 dark:text-rose-400 font-bold"
    }
    if (node.type === "expense") {
      return "text-rose-600 dark:text-rose-400"
    }
    if (node.type === "income") {
      return "text-emerald-600 dark:text-emerald-400"
    }
    return "text-brand-dark dark:text-dark-heading font-semibold"
  }

  return (
    <>
      <tr className={`transition-colors ${getRowBg()}`}>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            {hasItems ? (
              <button
                type="button"
                onClick={onToggle}
                className="p-1 rounded-md hover:bg-brand-gray/30 dark:hover:bg-dark-border text-brand-dark/70 dark:text-dark-body transition-colors"
              >
                {isExpanded ? (
                  <ChevronDownIcon className="w-4 h-4" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4" />
                )}
              </button>
            ) : (
              <div className="w-6" />
            )}

            <span className={`text-sm ${isResult || isSubtotal ? "font-bold text-brand-dark dark:text-dark-heading" : "font-medium text-brand-dark/90 dark:text-dark-heading"}`}>
              {node.title}
            </span>
          </div>
        </td>

        <td className={`py-3 px-4 text-right text-sm ${getAmountColor()}`}>
          {formatCurrency(node.amount)}
        </td>

        <td className="py-3 px-4 text-right text-xs font-semibold text-brand-dark/70 dark:text-dark-muted">
          {node.verticalPercent > 0 ? `${node.verticalPercent}%` : "—"}
        </td>

        {showComparison && (
          <>
            <td className="py-3 px-4 text-right text-xs text-brand-dark/60 dark:text-dark-muted">
              {node.previousAmount !== undefined ? formatCurrency(node.previousAmount) : "—"}
            </td>
            <td className="py-3 px-4 text-right text-xs">
              <VariationBadge value={node.horizontalVariation} type={node.type} />
            </td>
          </>
        )}
      </tr>

      {/* Subitens expansíveis */}
      {hasItems && isExpanded && (
        <AnimatePresence>
          {node.items.map((item) => (
            <tr
              key={item.id}
              className="bg-brand-gray/[0.04] dark:bg-dark-border/[0.08] hover:bg-brand-gray/10 dark:hover:bg-dark-border/20 transition-colors text-xs"
            >
              <td className="py-2.5 px-4 pl-12">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-primary/60" />
                  <span className="text-brand-dark/80 dark:text-dark-body font-normal">
                    {item.name}
                  </span>
                </div>
              </td>

              <td className="py-2.5 px-4 text-right font-medium text-brand-dark dark:text-dark-heading">
                {formatCurrency(item.amount)}
              </td>

              <td className="py-2.5 px-4 text-right text-brand-dark/60 dark:text-dark-muted">
                {item.verticalPercent > 0 ? `${item.verticalPercent}%` : "—"}
              </td>

              {showComparison && (
                <>
                  <td className="py-2.5 px-4 text-right text-brand-dark/50 dark:text-dark-muted">
                    {item.previousAmount !== undefined ? formatCurrency(item.previousAmount) : "—"}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <VariationBadge value={item.horizontalVariation} type={node.type} />
                  </td>
                </>
              )}
            </tr>
          ))}
        </AnimatePresence>
      )}
    </>
  )
}

function VariationBadge({ value, type }: { value?: number; type: "income" | "expense" | "subtotal" | "result" }) {
  if (value === undefined) return <span className="text-brand-dark/40 dark:text-dark-muted">—</span>
  if (value === 0) return <span className="text-brand-dark/40 dark:text-dark-muted">0%</span>

  const isPositive = value > 0
  // Para despesas, subir valor é negativo (vermelho), cair é positivo (verde)
  let isGood = isPositive
  if (type === "expense") {
    isGood = !isPositive
  }

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${
        isGood
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
      }`}
    >
      {isPositive ? `+${value}%` : `${value}%`}
    </span>
  )
}
