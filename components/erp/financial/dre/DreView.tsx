"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import { Button, ThreeDotsLoader, Dropdown, DropdownItem } from "@/components/reusable"
import { HorizontalKPICard } from "@/components/erp/dashboard/cards/HorizontalKPICard"
import { DashboardSectionCard } from "@/components/erp/dashboard/cards/DashboardSectionCard"
import { formatCurrency, formatDate } from "@/lib/utils"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  MoneyIcon,
  ShoppingCartIcon,
  Users,
  CreditCardIcon,
  CheckCircleIcon,
  ExportFileIcon,
  PrinterIcon,
  AnalyticsIcon,
  Settings2Icon,
  StarIcon,
} from "@/lib/icons"
import { getDreReportAction } from "@/app/actions/erp/dre"
import type { DreReportData, DreRegime, DreNode } from "@/lib/services/dre.service"
import { useNotification } from "@/hooks/use-notification"
import { DrePageControls, type DreViewTab, type DreFilterState } from "./DrePageControls"
import {
  resolveDatePeriodBounds,
  EMPTY_DATE_PERIOD,
} from "@/lib/utils/filter-date-period"

import { exportDreToXLSX } from "@/lib/utils/export-dre-excel"
import { DrePrintModal } from "./receipt/DrePrintModal"
import { DreInsightsSheet } from "./DreInsightsSheet"

interface StoreOption {
  id: string
  name: string
}

interface DreViewProps {
  partnerId: string
  stores?: StoreOption[]
  activeStoreId?: string | null
}

function resolvePresetDates(datePeriod: DreFilterState["datePeriod"]): { startDate: string; endDate: string } {
  const bounds = resolveDatePeriodBounds(datePeriod)
  if (bounds.startYmd && bounds.endYmd) {
    return { startDate: bounds.startYmd, endDate: bounds.endYmd }
  }
  if (bounds.startYmd && !bounds.endYmd) {
    return { startDate: bounds.startYmd, endDate: bounds.startYmd }
  }
  if (!bounds.startYmd && bounds.endYmd) {
    return { startDate: bounds.endYmd, endDate: bounds.endYmd }
  }
  // Fallback: mês atual
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const start = new Date(Date.UTC(year, month, 1))
  const end = new Date(Date.UTC(year, month + 1, 0))
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
}

export function DreView({ partnerId, stores = [], activeStoreId }: DreViewProps) {
  const { error: notifyError, success: notifySuccess } = useNotification()

  const [activeTab, setActiveTab] = useState<DreViewTab>("structure")
  const [filters, setFilters] = useState<DreFilterState>({
    datePeriod: { presets: ["current_month"], from: "", to: "" },
    stores: [],
    regime: [],
    comparePrevious: true,
  })

  const selectedStoreId = useMemo(() => {
    if (filters.stores.length === 1) return filters.stores[0]
    if (stores.length === 1) return stores[0].id
    if (activeStoreId && stores.some((s) => s.id === activeStoreId)) return activeStoreId
    return "all"
  }, [filters.stores, stores, activeStoreId])

  const regime: DreRegime = useMemo(() => {
    if (filters.regime.length === 1) return filters.regime[0]
    return "competencia"
  }, [filters.regime])

  const comparePrevious = filters.comparePrevious

  const [loading, setLoading] = useState<boolean>(true)
  const [report, setReport] = useState<DreReportData | null>(null)
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false)
  const [isInsightsSheetOpen, setIsInsightsSheetOpen] = useState<boolean>(false)
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    "1_receita_bruta": true,
    "2_deducoes": true,
    "4_custos_diretos": true,
    "6_1_despesas_comerciais": true,
    "6_2_despesas_administrativas": true,
    "6_3_pro_labore": true,
    "8_resultado_financeiro": true,
  })

  const dates = useMemo(() => resolvePresetDates(filters.datePeriod), [filters.datePeriod])

  const selectedStoreName = useMemo(() => {
    if (selectedStoreId === "all") return "Todas as Lojas (Consolidado)"
    const found = stores.find((s) => s.id === selectedStoreId)
    return found?.name || report?.companyInfo?.storeName || "Loja Selecionada"
  }, [selectedStoreId, stores, report])

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

  const isAllExpanded = useMemo(() => {
    if (!report) return false
    return Object.values(report.structure).every((node) => expandedNodes[node.key] === true)
  }, [report, expandedNodes])

  const toggleNode = (key: string) => {
    setExpandedNodes((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleExpandAll = () => {
    if (!report) return
    if (isAllExpanded) {
      setExpandedNodes({})
    } else {
      const allKeys: Record<string, boolean> = {}
      Object.values(report.structure).forEach((node) => {
        allKeys[node.key] = true
      })
      setExpandedNodes(allKeys)
    }
  }

  const handleExportPdf = () => {
    setIsPrintModalOpen(true)
  }

  const handleExportExcel = async () => {
    if (!report) return
    try {
      await exportDreToXLSX({
        report,
        regime,
        startDate: dates.startDate,
        endDate: dates.endDate,
        storeName: selectedStoreName,
      })
      notifySuccess("Planilha DRE gerada e baixada com sucesso!")
    } catch {
      notifyError("Erro ao exportar", "Não foi possível gerar o arquivo Excel.")
    }
  }

  const kpis = report?.kpis

  // Itens formatados exatamente para o HorizontalKPICard do dashboard
  const kpiItems = useMemo(() => {
    if (!kpis) return []
    return [
      {
        title: "Receita Líquida",
        value: formatCurrency(kpis.netRevenue || 0),
        subtext: `Bruta: ${formatCurrency(kpis.grossRevenue || 0)}`,
        icon: MoneyIcon,
      },
      {
        title: "Lucro Bruto",
        value: formatCurrency(kpis.grossProfit || 0),
        trend: `${kpis.grossMarginPercent || 0}%`,
        subtext: "Margem Bruta",
        icon: ShoppingCartIcon,
      },
      {
        title: "Margem Contribuição",
        value: `${kpis.contributionMarginPercent || 0}%`,
        subtext: formatCurrency(kpis.contributionMarginAmount || 0),
        icon: Users,
      },
      {
        title: "EBITDA Operacional",
        value: formatCurrency(kpis.ebitdaAmount || 0),
        trend: (kpis.ebitdaMarginPercent || 0) >= 0 ? `+${kpis.ebitdaMarginPercent || 0}%` : `-${Math.abs(kpis.ebitdaMarginPercent || 0)}%`,
        subtext: "Geração de Caixa",
        icon: CreditCardIcon,
      },
      {
        title: "Lucro Líquido",
        value: formatCurrency(kpis.netProfitAmount || 0),
        trend: (kpis.netMarginPercent || 0) >= 0 ? `+${kpis.netMarginPercent || 0}%` : `-${Math.abs(kpis.netMarginPercent || 0)}%`,
        subtext: "Resultado Final",
        icon: CheckCircleIcon,
      },
    ]
  }, [kpis])

  return (
    <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
      {/* ── Desktop Header Padrão do ERP ─────────────────────────────────────── */}
      <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8 print:hidden">
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
              Demonstração do Resultado do Exercício (DRE)
            </h1>
          </div>
          <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
            Acompanhe a apuração de resultados, receitas, custos, despesas operacionais e lucratividade líquida.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Dropdown
            trigger={
              <Button variant="outline" leftIcon={<Settings2Icon size={18} />}>
                Ações
              </Button>
            }
            align="right"
            showChevron={false}
            fullWidth={false}
          >
            <DropdownItem onClick={() => setIsInsightsSheetOpen(true)}>
              <StarIcon size={18} /> Alertas & Insights
            </DropdownItem>
            <DropdownItem onClick={handleExportExcel}>
              <ExportFileIcon size={18} /> Exportar Excel
            </DropdownItem>
            <DropdownItem onClick={handleExportPdf}>
              <PrinterIcon size={18} /> Imprimir / PDF
            </DropdownItem>
          </Dropdown>
        </div>
      </div>

      {/* ── Cabeçalho Exclusivo para Impressão / PDF ──────────────────────────── */}
      <div className="hidden print:block border-b-2 border-black pb-4 mb-6 px-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-black tracking-tight uppercase">
              Demonstração do Resultado do Exercício (DRE)
            </h1>
            <p className="text-sm font-semibold text-black mt-1">
              {report?.companyInfo?.partnerName} {report?.companyInfo?.documentNumber ? `• ${report?.companyInfo?.documentType === "cpf" ? "CPF" : "CNPJ"}: ${report.companyInfo.documentNumber}` : ""}
            </p>
            <p className="text-xs text-gray-700">
              Unidade: {report?.companyInfo?.storeName} • {report?.companyInfo?.taxRegimeLabel}
            </p>
          </div>
          <div className="text-right text-xs text-gray-700">
            <p><strong>Regime:</strong> {regime === "competencia" ? "Competência" : "Caixa"}</p>
            <p><strong>Período:</strong> {formatDate(dates.startDate)} até {formatDate(dates.endDate)}</p>
            <p><strong>Gerado em:</strong> {report?.companyInfo?.generatedAt}</p>
          </div>
        </div>
      </div>

      {/* ── Controles da Página (DrePageControls Padrão ERP) ──────────────────── */}
      <DrePageControls
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stores={stores}
        filters={filters}
        setFilters={setFilters}
        isAllExpanded={isAllExpanded}
        onToggleExpandAll={toggleExpandAll}
        onOpenInsights={() => setIsInsightsSheetOpen(true)}
        onExportExcel={handleExportExcel}
        onPrintPdf={handleExportPdf}
      />

      {loading ? (
        <div className="py-24 mx-4 md:px-8 flex flex-col items-center justify-center space-y-3 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px]">
          <ThreeDotsLoader />
        </div>
      ) : report ? (
        <>
          {/* ── KPI Horizontal Card Único do Dashboard ───────────────────────── */}
          {kpiItems.length > 0 && (
            <div className="px-4 md:px-8 mb-6 print:hidden">
              <HorizontalKPICard items={kpiItems} />
            </div>
          )}

          {/* ── Conteúdo da Aba Selecionada ──────────────────────────────────── */}
          {activeTab === "structure" ? (
            /* ── Tabela Estruturada DRE ─────────────────────────────────────── */
            <div className="px-4 md:px-8 pb-12">
              <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] overflow-hidden print:border-none">
                <div className="p-5 border-b border-brand-border dark:border-dark-border flex items-center justify-between print:hidden">
                  <div>
                    <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                      Demonstração do Resultado do Exercício
                    </h2>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                      Regime de {regime === "competencia" ? "Competência" : "Caixa"} • {formatDate(report.period.startDate)} até {formatDate(report.period.endDate)} • {kpis?.totalSalesAndOrdersCount || 0} operações (Ticket Médio: {formatCurrency(kpis?.averageTicketAmount || 0)})
                    </p>
                  </div>

                  <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body bg-brand-gray dark:bg-dark-border/40 px-3 py-1.5 rounded-full border border-brand-border dark:border-dark-border">
                    Base 100% (Rec. Bruta): {formatCurrency(kpis?.grossRevenue || 0)}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-brand-gray dark:bg-dark-border/40 border-b border-brand-border dark:border-dark-border text-xs font-semibold text-brand-dark dark:text-dark-heading">
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
                    <tbody className="divide-y divide-brand-border/40 dark:divide-dark-border/40">
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
            </div>
          ) : (
            /* ── Aba 2: Indicadores & Margens Detalhadas ──────────────────────── */
            <div className="px-4 md:px-8 pb-12 print:hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Card 1: Composição Percentual da Receita */}
                <DashboardSectionCard
                  title="Composição da Receita Bruta (Estrutura de Custos)"
                  icon={AnalyticsIcon}
                >
                  <div className="space-y-4 pt-1">
                    <BreakdownBar
                      label="Receita Operacional Líquida"
                      amount={kpis?.netRevenue || 0}
                      percent={(kpis?.grossRevenue || 0) > 0 ? ((kpis?.netRevenue || 0) / (kpis?.grossRevenue || 1)) * 100 : 0}
                      barColor="bg-blue-500"
                    />
                    <BreakdownBar
                      label="Custos Diretos (CMV / CSP)"
                      amount={report.structure.cogs.amount}
                      percent={report.structure.cogs.verticalPercent}
                      barColor="bg-amber-500"
                    />
                    <BreakdownBar
                      label="Despesas Comerciais e Vendas"
                      amount={report.structure.commercialExpenses.amount}
                      percent={report.structure.commercialExpenses.verticalPercent}
                      barColor="bg-purple-500"
                    />
                    <BreakdownBar
                      label="Despesas Administrativas e Gerais"
                      amount={report.structure.administrativeExpenses.amount}
                      percent={report.structure.administrativeExpenses.verticalPercent}
                      barColor="bg-rose-500"
                    />
                    <BreakdownBar
                      label="Pró-Labore dos Sócios"
                      amount={report.structure.proLaboreExpenses.amount}
                      percent={report.structure.proLaboreExpenses.verticalPercent}
                      barColor="bg-cyan-500"
                    />
                    <BreakdownBar
                      label="Lucro Líquido Final"
                      amount={kpis?.netProfitAmount || 0}
                      percent={(kpis?.grossRevenue || 0) > 0 ? ((kpis?.netProfitAmount || 0) / (kpis?.grossRevenue || 1)) * 100 : 0}
                      barColor="bg-brand-green"
                    />
                  </div>
                </DashboardSectionCard>

                {/* Card 2: Análise de Margens e Ponto de Equilíbrio */}
                <DashboardSectionCard
                  title="Margens Operacionais & Eficiência"
                  icon={MoneyIcon}
                >
                  <div className="space-y-4 pt-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3.5 bg-brand-gray dark:bg-dark-border/20 border border-brand-border dark:border-dark-border rounded-xl">
                        <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">Margem Bruta</span>
                        <p className="text-lg font-bold text-brand-dark dark:text-dark-heading mt-1">{kpis?.grossMarginPercent || 0}%</p>
                        <p className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">Sobre a Receita Líquida</p>
                      </div>

                      <div className="p-3.5 bg-brand-gray dark:bg-dark-border/20 border border-brand-border dark:border-dark-border rounded-xl">
                        <span className="text-xs text-brand-inactive-text dark:text-dark-body">Margem EBITDA</span>
                        <p className="text-lg font-bold text-brand-dark dark:text-dark-heading mt-1">{kpis?.ebitdaMarginPercent || 0}%</p>
                        <p className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">Geração de Caixa</p>
                      </div>

                      <div className="p-3.5 bg-brand-gray dark:bg-dark-border/20 border border-brand-border dark:border-dark-border rounded-xl">
                        <span className="text-xs text-brand-inactive-text dark:text-dark-body">Margem Líquida</span>
                        <p className="text-lg font-bold text-brand-dark dark:text-dark-heading mt-1">{kpis?.netMarginPercent || 0}%</p>
                        <p className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">Lucratividade Final</p>
                      </div>

                      <div className="p-3.5 bg-brand-gray dark:bg-dark-border/20 border border-brand-border dark:border-dark-border rounded-xl">
                        <span className="text-xs text-brand-inactive-text dark:text-dark-body">Ponto de Equilíbrio</span>
                        <p className="text-lg font-bold text-brand-dark dark:text-dark-heading mt-1">{formatCurrency(kpis?.breakEvenPointAmount || 0)}</p>
                        <p className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">Faturamento Mínimo</p>
                      </div>
                    </div>

                    <div className="p-3.5 bg-brand-green-light dark:bg-emerald-950/20 border border-brand-green/30 rounded-xl">
                      <p className="text-xs font-semibold text-brand-dark dark:text-dark-heading">
                        Ticket Médio Operacional: {formatCurrency(kpis?.averageTicketAmount || 0)}
                      </p>
                      <p className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">
                        Calculado sobre {kpis?.totalSalesAndOrdersCount || 0} operações no período.
                      </p>
                    </div>
                  </div>
                </DashboardSectionCard>
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* ── Sheet de Alertas & Insights Contábeis ────────────────────────────── */}
      <DreInsightsSheet
        isOpen={isInsightsSheetOpen}
        onClose={() => setIsInsightsSheetOpen(false)}
        alerts={report?.alerts}
      />

      {/* ── Modal de Impressão e Pré-visualização A4 / PDF ───────────────────── */}
      <DrePrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        partnerId={partnerId}
        storeId={selectedStoreId === "all" ? undefined : selectedStoreId}
        report={report}
        regime={regime}
        startDate={dates.startDate}
        endDate={dates.endDate}
        storeName={selectedStoreName}
      />
    </div>
  )
}

function BreakdownBar({
  label,
  amount,
  percent,
  barColor,
}: {
  label: string
  amount: number
  percent: number
  barColor: string
}) {
  const safePercent = Math.min(100, Math.max(0, Number(percent.toFixed(1))))

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-medium">
        <span className="text-brand-dark dark:text-dark-body">{label}</span>
        <span className="text-brand-dark dark:text-dark-heading font-semibold">
          {formatCurrency(amount)} ({safePercent}%)
        </span>
      </div>
      <div className="w-full bg-brand-gray dark:bg-dark-border/40 rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${safePercent}%` }} />
      </div>
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
    if (isResult) return "bg-brand-green-light/40 dark:bg-emerald-950/20 font-bold border-t-2 border-brand-green"
    if (isSubtotal) return "bg-brand-gray/50 dark:bg-dark-border/30 font-bold text-brand-dark dark:text-dark-heading border-y border-brand-border dark:border-dark-border"
    return "hover:bg-brand-gray/30 dark:hover:bg-dark-border/20"
  }

  const getAmountColor = () => {
    if (node.type === "result") {
      return node.amount >= 0 ? "text-brand-green font-bold" : "text-[#cc4745] font-bold"
    }
    if (node.type === "expense") {
      return "text-[#cc4745]"
    }
    if (node.type === "income") {
      return "text-brand-green"
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
                className="p-1 rounded-md hover:bg-brand-gray dark:hover:bg-dark-border text-brand-dark dark:text-dark-heading transition-colors print:hidden"
              >
                {isExpanded ? (
                  <ChevronDownIcon size={16} />
                ) : (
                  <ChevronRightIcon size={16} />
                )}
              </button>
            ) : (
              <div className="w-6 print:hidden" />
            )}

            <span
              className={`text-sm ${isResult || isSubtotal ? "font-bold text-brand-dark dark:text-dark-heading" : "font-medium text-brand-dark dark:text-dark-heading"}`}
              title={node.helpText}
            >
              {node.title}
            </span>
          </div>
        </td>

        <td className={`py-3 px-4 text-right text-sm ${getAmountColor()}`}>
          {formatCurrency(node.amount)}
        </td>

        <td className="py-3 px-4 text-right text-xs font-semibold text-brand-dark dark:text-dark-body">
          {node.verticalPercent > 0 ? `${node.verticalPercent}%` : "-"}
        </td>

        {showComparison && (
          <>
            <td className="py-3 px-4 text-right text-xs text-brand-inactive-text dark:text-dark-body">
              {node.previousAmount !== undefined ? formatCurrency(node.previousAmount) : "-"}
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
              className="bg-brand-gray/20 dark:bg-dark-border/10 hover:bg-brand-gray/40 dark:hover:bg-dark-border/20 transition-colors text-xs"
            >
              <td className="py-2.5 px-4 pl-12">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-green/70" />
                  <span className="text-brand-dark dark:text-dark-heading font-normal">
                    {item.name}
                  </span>
                </div>
              </td>

              <td className="py-2.5 px-4 text-right font-medium text-brand-dark dark:text-dark-heading">
                {formatCurrency(item.amount)}
              </td>

              <td className="py-2.5 px-4 text-right text-brand-inactive-text dark:text-dark-body">
                {item.verticalPercent > 0 ? `${item.verticalPercent}%` : "-"}
              </td>

              {showComparison && (
                <>
                  <td className="py-2.5 px-4 text-right text-brand-inactive-text dark:text-dark-body">
                    {item.previousAmount !== undefined ? formatCurrency(item.previousAmount) : "-"}
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
  if (value === undefined) return <span className="text-brand-inactive-text dark:text-dark-body">-</span>
  if (value === 0) return <span className="text-brand-inactive-text dark:text-dark-body">0%</span>

  const isPositive = value > 0
  let isGood = isPositive
  if (type === "expense") {
    isGood = !isPositive
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${isGood
        ? "bg-brand-green-secondary text-brand-green"
        : "bg-[#fce6e5] text-[#cc4745]"
        }`}
    >
      {isPositive ? `+${value}%` : `${value}%`}
    </span>
  )
}