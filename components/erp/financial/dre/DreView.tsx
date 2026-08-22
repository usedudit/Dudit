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
  InfoIcon,
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

type PeriodPreset = "current_month" | "last_month" | "last_30_days" | "current_quarter" | "current_year" | "custom"

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

  if (preset === "current_year") {
    const start = new Date(Date.UTC(year, 0, 1))
    const end = new Date(Date.UTC(year, 11, 31))
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    }
  }

  // fallback para custom
  const start = new Date(Date.UTC(year, month, 1))
  const end = new Date(Date.UTC(year, month + 1, 0))
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
}

export function DreView({ partnerId, stores = [], activeStoreId }: DreViewProps) {
  const { error: notifyError, success: notifySuccess } = useNotification()

  const [preset, setPreset] = useState<PeriodPreset>("current_month")
  const [customStartDate, setCustomStartDate] = useState<string>(() => getPresetDates("current_month").startDate)
  const [customEndDate, setCustomEndDate] = useState<string>(() => getPresetDates("current_month").endDate)

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

  const dates = useMemo(() => {
    if (preset === "custom") {
      return {
        startDate: customStartDate || getPresetDates("current_month").startDate,
        endDate: customEndDate || getPresetDates("current_month").endDate,
      }
    }
    return getPresetDates(preset)
  }, [preset, customStartDate, customEndDate])

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
    let csv = `RELATÓRIO DE DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE)\n`
    csv += `Empresa:;${report.companyInfo?.partnerName || ""};CNPJ:;${report.companyInfo?.documentNumber || ""}\n`
    csv += `Unidade:;${report.companyInfo?.storeName || ""};Regime:;${regime === "competencia" ? "Competência" : "Caixa"}\n`
    csv += `Período:;${dates.startDate} até ${dates.endDate};Gerado em:;${report.companyInfo?.generatedAt || ""}\n\n`
    csv += "Estrutura / Conta Contábil;Tipo;Período Atual (R$);Análise Vertical (AV %);Período Anterior (R$);Variação Horizontal (AH %)\n"

    Object.values(report.structure).forEach((node) => {
      csv += `"${node.title}";"${node.type}";"${node.amount.toFixed(2).replace(".", ",")}";"${node.verticalPercent.toFixed(2).replace(".", ",")}%";"${(node.previousAmount ?? 0).toFixed(2).replace(".", ",")}";"${(node.horizontalVariation ?? 0).toFixed(2).replace(".", ",")}%"\n`
      node.items.forEach((item) => {
        csv += `  "${item.name}";"Item";"${item.amount.toFixed(2).replace(".", ",")}";"${item.verticalPercent.toFixed(2).replace(".", ",")}%";"${(item.previousAmount ?? 0).toFixed(2).replace(".", ",")}";"${(item.horizontalVariation ?? 0).toFixed(2).replace(".", ",")}%"\n`
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
    { value: "custom", label: "Personalizado..." },
  ]

  const storeOptions = [
    { value: "all", label: "Todas as Lojas (Consolidado)" },
    ...stores.map((s) => ({ value: s.id, label: s.name })),
  ]

  const kpis = report?.kpis

  return (
    <div className="w-full space-y-6">
      {/* ── Cabeçalho Exclusivo para Impressão / PDF ──────────────────────────── */}
      <div className="hidden print:block border-b-2 border-black pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-black tracking-tight uppercase">
              Demonstração do Resultado do Exercício (DRE)
            </h1>
            <p className="text-sm font-semibold text-black mt-1">
              {report?.companyInfo?.partnerName} {report?.companyInfo?.documentNumber ? `• CNPJ: ${report.companyInfo.documentNumber}` : ""}
            </p>
            <p className="text-xs text-gray-700">
              Unidade: {report?.companyInfo?.storeName} • {report?.companyInfo?.taxRegimeLabel}
            </p>
          </div>
          <div className="text-right text-xs text-gray-700">
            <p><strong>Regime:</strong> {regime === "competencia" ? "Competência" : "Caixa"}</p>
            <p><strong>Período:</strong> {dates.startDate} até {dates.endDate}</p>
            <p><strong>Gerado em:</strong> {report?.companyInfo?.generatedAt}</p>
          </div>
        </div>
      </div>

      {/* ── Controles Superiores na Tela ────────────────────────────────────── */}
      <div className="print:hidden flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white dark:bg-dark-card border border-brand-gray/30 dark:border-dark-border p-4 rounded-2xl shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor de Período */}
          <div className="w-48">
            <FormDropdown
              options={periodOptions}
              value={preset}
              setValue={(val: string) => setPreset(val as PeriodPreset)}
            />
          </div>

          {/* Inputs de Data Customizada */}
          {preset === "custom" && (
            <div className="flex items-center gap-2 bg-brand-gray/10 dark:bg-dark-border/20 p-1.5 rounded-xl border border-brand-gray/20 dark:border-dark-border">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="text-xs px-2 py-1 bg-white dark:bg-dark-card border border-brand-gray/30 dark:border-dark-border rounded-lg text-brand-dark dark:text-dark-heading focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
              />
              <span className="text-xs text-brand-inactive-text dark:text-dark-muted font-medium">até</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="text-xs px-2 py-1 bg-white dark:bg-dark-card border border-brand-gray/30 dark:border-dark-border rounded-lg text-brand-dark dark:text-dark-heading focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
              />
            </div>
          )}

          {/* Seletor de Loja */}
          {stores.length > 1 && (
            <div className="w-56">
              <FormDropdown
                options={storeOptions}
                value={selectedStoreId}
                setValue={(val: string) => setSelectedStoreId(val)}
              />
            </div>
          )}

          {/* Regime: Competência vs Caixa */}
          <div className="flex items-center bg-brand-gray/20 dark:bg-dark-border/40 p-1 rounded-xl border border-brand-gray/30 dark:border-dark-border">
            <button
              type="button"
              onClick={() => setRegime("competencia")}
              title="Reconhecimento das receitas e despesas pela data do fato gerador contábil"
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
              title="Reconhecimento das receitas e despesas pela efetiva entrada e saída financeira"
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

      {/* ── Banners de Alerta de Integridade Contábil ─────────────────────────── */}
      {report?.alerts && (
        <div className="print:hidden space-y-2">
          {report.alerts.zeroCostItemsCount > 0 && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-300">
              <div className="flex items-center gap-2.5">
                <AlertTriangleIcon className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  <strong>Aviso de Custo:</strong> Foram identificados <strong>{report.alerts.zeroCostItemsCount} itens vendidos</strong> sem preço de custo unitário cadastrado. Cadastre o custo nos produtos para que o CMV e a Margem Bruta tenham 100% de exatidão contábil.
                </span>
              </div>
            </div>
          )}

          {report.alerts.unclassifiedTransactionsCount > 0 && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-blue-800 dark:text-blue-300">
              <div className="flex items-center gap-2.5">
                <InfoIcon className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>
                  Existem <strong>{report.alerts.unclassifiedTransactionsCount} movimentações financeiras</strong> sem classificação contábil vinculada ({formatCurrency(report.alerts.unclassifiedTransactionsAmount)}). Foram atribuídas provisoriamente em Despesas Gerais.
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center space-y-3 bg-white dark:bg-dark-card border border-brand-gray/30 dark:border-dark-border rounded-2xl">
          <ThreeDotsLoader />
          <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-muted">
            Calculando DRE e indicadores contábeis com consultas paralelas...
          </p>
        </div>
      ) : report ? (
        <>
          {/* ── KPI Summary Cards ───────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 print:hidden">
            <div className="p-4 bg-white dark:bg-dark-card border border-brand-gray/30 dark:border-dark-border rounded-2xl shadow-2xs">
              <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-muted">Receita Líquida</span>
              <p className="text-xl font-bold text-brand-dark dark:text-dark-heading mt-1">{formatCurrency(kpis?.netRevenue || 0)}</p>
              <p className="text-[11px] text-brand-inactive-text dark:text-dark-muted mt-0.5">Bruta: {formatCurrency(kpis?.grossRevenue || 0)}</p>
            </div>

            <div className="p-4 bg-white dark:bg-dark-card border border-brand-gray/30 dark:border-dark-border rounded-2xl shadow-2xs">
              <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-muted">Margem Bruta</span>
              <p className={`text-xl font-bold mt-1 ${(kpis?.grossMarginPercent || 0) >= 35 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                {kpis?.grossMarginPercent || 0}%
              </p>
              <p className="text-[11px] text-brand-inactive-text dark:text-dark-muted mt-0.5">Lucro: {formatCurrency(kpis?.grossProfit || 0)}</p>
            </div>

            <div className="p-4 bg-white dark:bg-dark-card border border-brand-gray/30 dark:border-dark-border rounded-2xl shadow-2xs">
              <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-muted">Margem Contribuição</span>
              <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{kpis?.contributionMarginPercent || 0}%</p>
              <p className="text-[11px] text-brand-inactive-text dark:text-dark-muted mt-0.5">{formatCurrency(kpis?.contributionMarginAmount || 0)}</p>
            </div>

            <div className="p-4 bg-white dark:bg-dark-card border border-brand-gray/30 dark:border-dark-border rounded-2xl shadow-2xs">
              <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-muted">EBITDA Operacional</span>
              <p className={`text-xl font-bold mt-1 ${(kpis?.ebitdaAmount || 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {formatCurrency(kpis?.ebitdaAmount || 0)}
              </p>
              <p className="text-[11px] text-brand-inactive-text dark:text-dark-muted mt-0.5">Margem: {kpis?.ebitdaMarginPercent || 0}%</p>
            </div>

            <div className="p-4 bg-white dark:bg-dark-card border border-brand-gray/30 dark:border-dark-border rounded-2xl shadow-2xs">
              <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-muted">Ponto de Equilíbrio</span>
              <p className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">{formatCurrency(kpis?.breakEvenPointAmount || 0)}</p>
              <p className="text-[11px] text-brand-inactive-text dark:text-dark-muted mt-0.5">Fixos: {formatCurrency(kpis?.fixedExpensesAmount || 0)}</p>
            </div>

            <div className="p-4 bg-white dark:bg-dark-card border border-brand-gray/30 dark:border-dark-border rounded-2xl shadow-2xs">
              <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-muted">Lucro Líquido</span>
              <p className={`text-xl font-bold mt-1 ${(kpis?.netProfitAmount || 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {formatCurrency(kpis?.netProfitAmount || 0)}
              </p>
              <p className="text-[11px] text-brand-inactive-text dark:text-dark-muted mt-0.5">Margem: {kpis?.netMarginPercent || 0}%</p>
            </div>
          </div>

          {/* ── Tabela Estruturada DRE ─────────────────────────────────────── */}
          <div className="bg-white dark:bg-dark-card border border-brand-gray/30 dark:border-dark-border rounded-2xl shadow-xs overflow-hidden print:border-none print:shadow-none">
            <div className="p-4 border-b border-brand-gray/20 dark:border-dark-border flex items-center justify-between print:hidden">
              <div>
                <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                  Demonstração do Resultado do Exercício
                </h2>
                <p className="text-xs text-brand-inactive-text dark:text-dark-muted mt-0.5">
                  Regime de {regime === "competencia" ? "Competência (Econômico)" : "Caixa (Financeiro)"} • {report.period.startDate} até {report.period.endDate} • {kpis?.totalSalesAndOrdersCount || 0} operações (Ticket Médio: {formatCurrency(kpis?.averageTicketAmount || 0)})
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="gray" className="text-xs font-semibold">
                  Base 100% (Rec. Bruta): {formatCurrency(kpis?.grossRevenue || 0)}
                </Badge>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-brand-gray/10 dark:bg-dark-border/20 border-b border-brand-gray/20 dark:border-dark-border text-xs font-semibold text-brand-dark/70 dark:text-dark-muted">
                    <th className="py-3 px-4 w-1/2">Estrutura Contábil / Descrição da Conta</th>
                    <th className="py-3 px-4 text-right">Período Atual (R$)</th>
                    <th className="py-3 px-4 text-right">AV (%)</th>
                    {comparePrevious && (
                      <>
                        <th className="py-3 px-4 text-right print:table-cell">Período Anterior (R$)</th>
                        <th className="py-3 px-4 text-right print:table-cell">AH (%)</th>
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

            {/* ── Assinaturas para Impressão Contábil ───────────────────────── */}
            <div className="hidden print:block pt-16 pb-8 px-6">
              <div className="grid grid-cols-2 gap-12 text-center text-xs text-gray-800">
                <div className="border-t border-gray-400 pt-2">
                  <p className="font-semibold">{report.companyInfo?.partnerName}</p>
                  <p className="text-gray-600">Representante Legal / Sócio Administrador</p>
                </div>
                <div className="border-t border-gray-400 pt-2">
                  <p className="font-semibold">Responsável Contábil</p>
                  <p className="text-gray-600">CRC / Contador</p>
                </div>
              </div>
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
                className="p-1 rounded-md hover:bg-brand-gray/30 dark:hover:bg-dark-border text-brand-dark/70 dark:text-dark-body transition-colors print:hidden"
              >
                {isExpanded ? (
                  <ChevronDownIcon className="w-4 h-4" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4" />
                )}
              </button>
            ) : (
              <div className="w-6 print:hidden" />
            )}

            <span
              className={`text-sm ${isResult || isSubtotal ? "font-bold text-brand-dark dark:text-dark-heading" : "font-medium text-brand-dark/90 dark:text-dark-heading"}`}
              title={node.helpText}
            >
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

