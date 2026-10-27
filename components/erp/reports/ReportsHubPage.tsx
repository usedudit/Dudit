"use client"

import { useCallback, useEffect, useMemo, useState, type ElementType, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { Button, ListItem, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/reusable"
import Pagination from "@/components/reusable/Pagination"
import { GlobalPeriodFilter } from "@/components/erp/GlobalPeriodFilter"
import { useDashboard } from "@/components/erp/dashboard/DashboardContext"
import ReportListRow, { type ReportListColumn, type ReportListRowData } from "@/components/erp/reports/ReportListRow"
import { exportCSV, exportXLSX } from "@/lib/utils/export-report"
import { pushUrl } from "@/lib/navigation/history"
import { hasMinimumPlan, type PlanTierSlug } from "@/lib/subscription/plan-tier"
import { usePlanUpgrade, planStarIconForTarget } from "@/components/erp/subscription/PlanUpgradeModal"
import type { ProductsDashboardData, ServicesDashboardData, FinancialDashboardData, ChartPoint, DashboardListItem } from "@/lib/data/dashboard"
import type {
  SalesReportData,
  CustomerReportData,
  ReturnsReportData,
  DeliveryReportData,
  MarketingReportData,
  ProductivityReportData,
  ServiceOrderReportData,
  SubscriptionReportData,
  AppointmentsReportData,
} from "@/lib/data/reports"
import {
  AnalyticsIcon,
  PackageIcon,
  MoneyIcon,
  Users,
  WrenchIcon,
  TruckIcon,
  MegaphoneIcon,
  RepeatIcon,
  FileTextIcon,
  ExportFileIcon,
  ChartIcon,
  CalendarIcon,
  ReturnIcon,
  ArrowLeftIcon,
} from "@/lib/icons"

type ReportCategory = "vendas" | "produtos" | "financeiro" | "clientes" | "servicos" | "operacao" | "marketing" | "assinaturas"

interface ReportDefinition {
  id: string
  category: ReportCategory
  title: string
  description: string
  icon: ElementType
  minimumPlan: PlanTierSlug
  columns: ReportListColumn[]
  rows: ReportListRowData[]
}

interface ReportsHubPageProps {
  period: string
  planSlug: string
  activeResources: string[]
  productsData: ProductsDashboardData | null
  servicesData: ServicesDashboardData | null
  financialData: FinancialDashboardData | null
  salesData: SalesReportData | null
  customerData: CustomerReportData | null
  returnsData: ReturnsReportData | null
  deliveryData: DeliveryReportData | null
  marketingData: MarketingReportData | null
  productivityData: ProductivityReportData | null
  serviceOrdersData: ServiceOrderReportData | null
  subscriptionData: SubscriptionReportData | null
  appointmentsData: AppointmentsReportData | null
}

interface CategoryDefinition {
  id: ReportCategory
  label: string
  icon: ElementType
}

const CATEGORIES: CategoryDefinition[] = [
  { id: "vendas", label: "Vendas", icon: AnalyticsIcon },
  { id: "produtos", label: "Produtos e estoque", icon: PackageIcon },
  { id: "financeiro", label: "Financeiro", icon: MoneyIcon },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "servicos", label: "Serviços", icon: WrenchIcon },
  { id: "operacao", label: "Operação", icon: TruckIcon },
  { id: "marketing", label: "Marketing", icon: MegaphoneIcon },
  { id: "assinaturas", label: "Assinaturas", icon: RepeatIcon },
]

const currency = (value: unknown) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0))
const integer = (value: unknown) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value || 0))
const percent = (value: unknown) => `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
const dateOnly = (value: string | null | undefined) => value ? value.slice(0, 10).split("-").reverse().join("/") : "-"

function pointLabel(point: ChartPoint) {
  return String(point.label ?? point.name ?? point.category ?? point.title ?? "-")
}

function pointValue(point: ChartPoint) {
  return Number(point.value ?? point.total ?? point.amount ?? point.revenue ?? 0)
}

function columns(...items: Array<[string, string, ReportListColumn["align"]?, string?]>): ReportListColumn[] {
  return items.map(([id, label, align = "left", minWidth]) => ({ id, label, align, minWidth }))
}

function chartRows(points: ChartPoint[], valueLabel: string, format: (value: number) => string = currency) {
  return points.map((point, index) => ({
    id: `${index}`,
    label: pointLabel(point),
    value: format(pointValue(point)),
  }))
}

function dashboardRows(items: DashboardListItem[], valueLabel: string, formatValue?: (value: unknown) => string) {
  return {
    columns: columns(["label", "Nome", "left", "260px"], ["detail", "Detalhes", "left", "300px"], ["value", valueLabel, "right", "150px"]),
    rows: items.map((item, index) => ({
      id: item.id || `${index}`,
      label: item.title || "-",
      detail: item.subtitle || item.meta || "-",
      value: formatValue ? formatValue(item.value) : item.value || "-",
    })),
  }
}

function createReports(props: ReportsHubPageProps): ReportDefinition[] {
  const reports: ReportDefinition[] = []

  if (props.salesData) {
    reports.push({
      id: "vendas-por-periodo", category: "vendas", title: "Vendas por período",
      description: "Acompanhe a evolução da receita no período selecionado.", icon: AnalyticsIcon, minimumPlan: "crescer",
      columns: columns(["label", "Período", "left", "180px"], ["value", "Receita", "right", "160px"], ["previous", "Período anterior", "right", "180px"]),
      rows: props.salesData.evolution.map((point, index) => ({ id: `${index}`, label: point.label, value: currency(point.value), previous: currency(point.secondary) })),
    })
    reports.push({
      id: "vendas-por-canal", category: "vendas", title: "Vendas por canal",
      description: "Compare a receita gerada pelos diferentes canais de venda.", icon: ChartIcon, minimumPlan: "crescer",
      columns: columns(["label", "Canal", "left", "280px"], ["value", "Receita", "right", "170px"]), rows: chartRows(props.salesData.bySource, "Receita"),
    })
    reports.push({
      id: "vendas-por-pagamento", category: "vendas", title: "Vendas por forma de pagamento",
      description: "Veja como os clientes estão pagando pelas compras.", icon: MoneyIcon, minimumPlan: "crescer",
      columns: columns(["label", "Forma de pagamento", "left", "280px"], ["value", "Receita", "right", "170px"]), rows: chartRows(props.salesData.byPaymentMethod, "Receita"),
    })
    reports.push({
      id: "produtos-mais-vendidos", category: "vendas", title: "Produtos mais vendidos",
      description: "Ranking dos produtos com maior quantidade vendida.", icon: PackageIcon, minimumPlan: "crescer",
      columns: columns(["label", "Produto", "left", "320px"], ["detail", "Ranking", "left", "220px"], ["quantity", "Quantidade", "right", "150px"]),
      rows: props.salesData.topProducts.map((item) => ({ id: item.id, label: item.label, detail: item.subtitle || "-", quantity: integer(item.value) })),
    })
    reports.push({
      id: "margem-por-produto", category: "vendas", title: "Margem por produto",
      description: "Analise os produtos com maior margem estimada.", icon: ChartIcon, minimumPlan: "escalar",
      columns: columns(["label", "Produto", "left", "300px"], ["margin", "Margem", "right", "140px"], ["value", "Receita", "right", "160px"]),
      rows: props.salesData.topMarginProducts.map((item) => ({ id: item.id, label: item.label, margin: percent(item.margin), value: currency(item.value) })),
    })
  }

  if (props.productsData) {
    const idle = props.productsData.idleProducts
    reports.push({
      id: "estoque-parado", category: "produtos", title: "Produtos sem movimentação",
      description: "Identifique produtos parados que podem precisar de reposição, ajuste ou promoção.", icon: PackageIcon, minimumPlan: "crescer",
      columns: columns(["label", "Produto", "left", "300px"], ["detail", "Categoria", "left", "260px"], ["value", "Preço cadastrado", "right", "170px"]),
      rows: idle.map((item, index) => ({ id: item.id || `${index}`, label: item.title || "-", detail: item.subtitle || item.meta || "-", value: item.value || "-" })),
    })
    reports.push({
      id: "estoque-critico", category: "produtos", title: "Estoque crítico",
      description: "Veja os itens com estoque baixo ou próximo de acabar.", icon: PackageIcon, minimumPlan: "crescer",
      columns: columns(["label", "Produto", "left", "300px"], ["detail", "Categoria", "left", "260px"], ["value", "Estoque", "right", "140px"]),
      rows: props.productsData.criticalStock.map((item, index) => ({ id: item.id || `${index}`, label: item.title || "-", detail: item.subtitle || item.meta || "-", value: integer(item.value) })),
    })
    reports.push({
      id: "curva-abc", category: "produtos", title: "Curva ABC de produtos",
      description: "Classifique os produtos pela participação no faturamento.", icon: ChartIcon, minimumPlan: "escalar",
      columns: columns(["label", "Produto", "left", "300px"], ["category", "Classe", "center", "100px"], ["value", "Receita", "right", "160px"], ["cumulative", "Acumulado", "right", "150px"]),
      rows: (props.salesData?.abcCurve || []).map((item, index) => ({ id: `${index}`, label: item.label, category: item.category, value: currency(item.value), cumulative: percent(item.cumulative) })),
    })
  }

  if (props.financialData) {
    reports.push({
      id: "fluxo-de-caixa", category: "financeiro", title: "Fluxo de caixa",
      description: "Consulte a evolução das entradas e saídas do período.", icon: MoneyIcon, minimumPlan: "crescer",
      columns: columns(["label", "Período", "left", "220px"], ["income", "Entradas", "right", "160px"], ["expense", "Saídas", "right", "160px"]),
      rows: props.financialData.cashflow.map((point, index) => ({ id: `${index}`, label: pointLabel(point), income: currency(pointValue(point)), expense: currency(point.secondary) })),
    })
    reports.push({
      id: "receitas-e-despesas", category: "financeiro", title: "Receitas e despesas",
      description: "Compare a movimentação financeira no período selecionado.", icon: MoneyIcon, minimumPlan: "crescer",
      columns: columns(["label", "Período", "left", "220px"], ["value", "Receita recebida", "right", "180px"]), rows: chartRows(props.financialData.revenue, "Receita recebida"),
    })
    reports.push({
      id: "despesas-por-categoria", category: "financeiro", title: "Despesas por categoria",
      description: "Entenda onde o negócio está concentrando seus gastos.", icon: ChartIcon, minimumPlan: "crescer",
      columns: columns(["label", "Categoria", "left", "280px"], ["value", "Despesas", "right", "170px"]), rows: chartRows(props.financialData.expensesByCategory, "Despesas"),
    })
    reports.push({
      id: "contas-vencidas", category: "financeiro", title: "Contas vencidas",
      description: "Acompanhe os lançamentos que precisam de atenção.", icon: FileTextIcon, minimumPlan: "crescer",
      columns: columns(["label", "Descrição", "left", "280px"], ["detail", "Situação", "left", "240px"], ["date", "Vencimento", "center", "150px"], ["value", "Valor", "right", "150px"]),
      rows: props.financialData.overdueAccounts.map((item, index) => ({ id: item.id || `${index}`, label: item.title || "-", detail: item.subtitle || "-", date: item.meta || "-", value: item.value || "-" })),
    })
  }

  if (props.customerData) {
    reports.push({
      id: "clientes-maior-faturamento", category: "clientes", title: "Clientes com maior faturamento",
      description: "Veja quem mais compra e contribui para o faturamento.", icon: Users, minimumPlan: "crescer",
      columns: columns(["label", "Cliente", "left", "300px"], ["orders", "Pedidos", "right", "120px"], ["value", "Faturamento", "right", "180px"]),
      rows: props.customerData.topCustomers.map((item) => ({ id: item.id, label: item.label, orders: integer(item.orders), value: item.value })),
    })
    reports.push({
      id: "clientes-inativos", category: "clientes", title: "Clientes sem compras recentes",
      description: "Encontre clientes que podem receber uma nova ação comercial.", icon: Users, minimumPlan: "crescer",
      columns: columns(["label", "Cliente", "left", "260px"], ["lastOrder", "Último pedido", "center", "170px"], ["orders", "Pedidos", "right", "110px"], ["value", "Faturamento histórico", "right", "190px"]),
      rows: props.customerData.inactiveCustomerList.map((item) => ({ id: item.id, label: item.label, lastOrder: item.subtitle.replace("Último pedido: ", ""), orders: integer(item.orders), value: item.value })),
    })
    reports.push({
      id: "evolucao-da-carteira", category: "clientes", title: "Evolução da carteira",
      description: "Compare clientes ativos e novos ao longo do período.", icon: Users, minimumPlan: "escalar",
      columns: columns(["label", "Período", "left", "220px"], ["active", "Ativos", "right", "130px"], ["new", "Novos", "right", "130px"]),
      rows: props.customerData.customerEvolution.map((item, index) => ({ id: `${index}`, label: item.label, active: integer(item.ativos), new: integer(item.novos) })),
    })
  }

  if (props.servicesData) {
    const serviceRows = (items: DashboardListItem[]) => items.map((item, index) => ({
      id: item.id || `${index}`, label: item.title || "-", appointments: integer(String(item.subtitle || "").match(/^(\d+)/)?.[1] || 0), revenue: item.value || "-",
    }))
    reports.push({
      id: "servicos-por-desempenho", category: "servicos", title: "Serviços por desempenho",
      description: "Consulte os serviços mais procurados e a receita gerada.", icon: WrenchIcon, minimumPlan: "crescer",
      columns: columns(["label", "Serviço", "left", "300px"], ["appointments", "Atendimentos", "right", "150px"], ["revenue", "Receita", "right", "170px"]), rows: serviceRows(props.servicesData.serviceRows),
    })
    reports.push({
      id: "desempenho-por-profissional", category: "servicos", title: "Desempenho por profissional",
      description: "Compare a produção da equipe de atendimento.", icon: Users, minimumPlan: "escalar",
      columns: columns(["label", "Profissional", "left", "300px"], ["appointments", "Atendimentos", "right", "150px"], ["revenue", "Receita", "right", "170px"]), rows: serviceRows(props.servicesData.staffRows),
    })
  }

  if (props.appointmentsData) {
    reports.push({ id: "agendamentos-por-status", category: "servicos", title: "Agendamentos por status", description: "Veja a situação dos atendimentos do período.", icon: CalendarIcon, minimumPlan: "crescer", columns: columns(["label", "Status", "left", "280px"], ["value", "Agendamentos", "right", "170px"]), rows: chartRows(props.appointmentsData.statusBreakdown, "Agendamentos", integer) })
    reports.push({ id: "servicos-mais-agendados", category: "servicos", title: "Serviços mais agendados", description: "Identifique os serviços com maior procura.", icon: CalendarIcon, minimumPlan: "escalar", columns: columns(["label", "Serviço", "left", "280px"], ["value", "Agendamentos", "right", "170px"]), rows: chartRows(props.appointmentsData.servicePopularity, "Agendamentos", integer) })
  }

  if (props.serviceOrdersData) {
    reports.push({ id: "ordens-de-servico-por-status", category: "servicos", title: "Ordens de serviço por status", description: "Acompanhe o volume de OS abertas, em andamento e concluídas.", icon: FileTextIcon, minimumPlan: "escalar", columns: columns(["label", "Status", "left", "280px"], ["value", "Ordens", "right", "170px"]), rows: chartRows(props.serviceOrdersData.byStatus, "Ordens", integer) })
  }

  if (props.deliveryData) reports.push({ id: "entregas-por-status", category: "operacao", title: "Entregas por status", description: "Acompanhe pendências, entregas concluídas e atrasos.", icon: TruckIcon, minimumPlan: "crescer", columns: columns(["label", "Status", "left", "280px"], ["value", "Entregas", "right", "170px"]), rows: chartRows(props.deliveryData.byStatus, "Entregas", integer) })
  if (props.returnsData) {
    reports.push({ id: "devolucoes-por-motivo", category: "operacao", title: "Devoluções por motivo", description: "Entenda por que os clientes estão devolvendo pedidos.", icon: ReturnIcon, minimumPlan: "crescer", columns: columns(["label", "Motivo", "left", "280px"], ["value", "Devoluções", "right", "170px"]), rows: chartRows(props.returnsData.byReason, "Devoluções", integer) })
    reports.push({ id: "produtos-mais-devolvidos", category: "operacao", title: "Produtos mais devolvidos", description: "Identifique itens que merecem uma investigação comercial ou operacional.", icon: ReturnIcon, minimumPlan: "escalar", columns: columns(["label", "Produto", "left", "300px"], ["count", "Devoluções", "right", "140px"], ["quantity", "Quantidade", "right", "140px"]), rows: props.returnsData.topReturnedProducts.map((item, index) => ({ id: `${index}`, label: item.productName, count: integer(item.count), quantity: integer(item.totalQuantity) })) })
  }

  if (props.marketingData) {
    reports.push({ id: "marketing-por-canal", category: "marketing", title: "Receita por canal", description: "Compare a receita originada pelos canais de venda.", icon: MegaphoneIcon, minimumPlan: "crescer", columns: columns(["label", "Canal", "left", "280px"], ["value", "Receita", "right", "170px"]), rows: chartRows(props.marketingData.revenueBySource, "Receita") })
    reports.push({ id: "desempenho-de-cupons", category: "marketing", title: "Desempenho dos cupons", description: "Avalie utilização e descontos concedidos pelos cupons.", icon: MegaphoneIcon, minimumPlan: "escalar", columns: columns(["code", "Cupom", "left", "260px"], ["usage", "Utilizações", "right", "140px"], ["discount", "Desconto", "right", "160px"]), rows: props.marketingData.topCoupons.map((item) => ({ id: item.id, code: item.code, usage: integer(item.usageCount), discount: currency(item.discountValue) })) })
    reports.push({ id: "campanhas-promocionais", category: "marketing", title: "Campanhas promocionais", description: "Acompanhe campanhas ativas e o período de cada ação.", icon: MegaphoneIcon, minimumPlan: "escalar", columns: columns(["name", "Campanha", "left", "300px"], ["status", "Status", "left", "140px"], ["period", "Período", "center", "220px"]), rows: props.marketingData.campaigns.map((item) => ({ id: item.id, name: item.name, status: item.isActive ? "Ativa" : "Encerrada", period: `${dateOnly(item.startsAt)} até ${dateOnly(item.endsAt)}` })) })
  }

  if (props.subscriptionData) {
    reports.push({ id: "resumo-de-assinaturas", category: "assinaturas", title: "Resumo das assinaturas", description: "Acompanhe receita recorrente, renovação e cancelamentos.", icon: RepeatIcon, minimumPlan: "escalar", columns: columns(["metric", "Indicador", "left", "280px"], ["value", "Valor", "right", "180px"]), rows: [{ id: "mrr", metric: "MRR ativo", value: currency(props.subscriptionData.mrr) }, { id: "arr", metric: "ARR anualizado", value: currency(props.subscriptionData.arr) }, { id: "ltv", metric: "LTV médio", value: currency(props.subscriptionData.ltv) }, { id: "renewal", metric: "Taxa de renovação", value: percent(props.subscriptionData.renewalRate) }, { id: "churn", metric: "Churn em 30 dias", value: percent(props.subscriptionData.churnRate) }] })
    reports.push({ id: "assinaturas-por-status", category: "assinaturas", title: "Assinaturas por status", description: "Veja a composição da base recorrente.", icon: RepeatIcon, minimumPlan: "escalar", columns: columns(["status", "Status", "left", "280px"], ["count", "Quantidade", "right", "170px"]), rows: [{ id: "active", status: "Ativas", count: integer(props.subscriptionData.activeCount) }, { id: "paused", status: "Pausadas", count: integer(props.subscriptionData.pausedCount) }, { id: "delinquent", status: "Pendentes", count: integer(props.subscriptionData.delinquentCount) }, { id: "cancelled", status: "Canceladas", count: integer(props.subscriptionData.cancelledCount) }] })
  }

  if (props.productivityData) {
    reports.push({ id: "produtividade-da-equipe", category: "servicos", title: "Produtividade da equipe", description: "Compare atendimentos, receita e cancelamentos por profissional.", icon: Users, minimumPlan: "escalar", columns: columns(["label", "Profissional", "left", "260px"], ["appointments", "Atendimentos", "right", "140px"], ["revenue", "Receita", "right", "160px"], ["cancelled", "Cancelamentos", "right", "150px"]), rows: props.productivityData.staffRanking.map((item) => ({ id: item.id, label: item.label, appointments: integer(item.appointments), revenue: currency(item.revenue), cancelled: integer(item.cancelled) })) })
  }

  return reports
}

function withReportUrl(tab?: string) {
  const url = new URL(window.location.href)
  if (tab) url.searchParams.set("tab", tab)
  else url.searchParams.delete("tab")
  return `${url.pathname}${url.search}${url.hash}`
}

function planName(plan: PlanTierSlug) {
  return plan === "escalar" ? "Escalar" : "Crescer"
}

export function ReportsHubPage(props: ReportsHubPageProps) {
  const { setExportHandler } = useDashboard()
  const searchParams = useSearchParams()
  const { openPlanUpgrade } = usePlanUpgrade()
  const reports = useMemo(() => createReports(props), [props])
  const availableCategories = useMemo(() => CATEGORIES.filter((category) => reports.some((report) => report.category === category.id)), [reports])
  const tab = searchParams.get("tab")
  const selectedReport = reports.find((report) => report.id === tab) || null
  const [activeCategory, setActiveCategory] = useState<ReportCategory>(availableCategories[0]?.id || "vendas")
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (selectedReport) setActiveCategory(selectedReport.category)
  }, [selectedReport])

  useEffect(() => setPage(1), [selectedReport?.id])

  const exportSelected = useCallback(async (format: "csv" | "xlsx") => {
    if (!selectedReport || !hasMinimumPlan(props.planSlug, selectedReport.minimumPlan)) return
    const headers = selectedReport.columns.map((column) => column.label)
    const rows = selectedReport.rows.map((row) => selectedReport.columns.map((column) => String(row[column.id] ?? "-")))
    const filename = `relatorio-${selectedReport.id}`
    if (format === "csv") exportCSV(filename, headers, rows)
    else await exportXLSX(filename, [{ name: selectedReport.title.slice(0, 31), headers, rows }])
  }, [props.planSlug, selectedReport])

  useEffect(() => {
    setExportHandler(selectedReport && hasMinimumPlan(props.planSlug, selectedReport.minimumPlan) ? exportSelected : null)
    return () => setExportHandler(null)
  }, [exportSelected, props.planSlug, selectedReport, setExportHandler])

  const openReport = (report: ReportDefinition) => {
    if (!hasMinimumPlan(props.planSlug, report.minimumPlan)) {
      openPlanUpgrade(report.minimumPlan)
      return
    }
    pushUrl(withReportUrl(report.id))
  }

  const closeReport = () => pushUrl(withReportUrl())
  const currentRows = selectedReport?.rows || []
  const totalPages = Math.max(1, Math.ceil(currentRows.length / 8))
  const paginatedRows = currentRows.slice((page - 1) * 8, page * 8)

  if (selectedReport) {
    return (
      <div className="w-full space-y-6 pt-4 px-4 md:px-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading">{selectedReport.title}</h1>
            <p className="mt-1 text-sm font-medium text-brand-inactive-text dark:text-dark-body">{selectedReport.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={closeReport} leftIcon={<ArrowLeftIcon size={17} />}>Voltar</Button>
            <Button variant="outline" onClick={() => void exportSelected("xlsx")} leftIcon={<ExportFileIcon size={17} />}>Exportar Excel</Button>
            <GlobalPeriodFilter />
          </div>
        </header>

        <div className="w-full overflow-hidden rounded-xl">
          <div className="overflow-x-auto pb-4 custom-scrollbar">
            <table className="w-full min-w-[900px] text-left border-separate border-spacing-0">
              <thead>
                <tr className="bg-brand-gray dark:bg-dark-border/50">
                  {selectedReport.columns.map((column) => (
                    <th key={column.id} className={`px-2 py-3 text-xs font-bold text-brand-inactive-text dark:text-dark-body ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`} style={{ width: column.width, minWidth: column.minWidth }}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => <ReportListRow key={row.id} row={row} columns={selectedReport.columns} />)}
              </tbody>
            </table>
          </div>
        </div>

        {currentRows.length > 0 ? <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} /> : <div className="py-12 text-center text-sm font-medium text-brand-inactive-text dark:text-dark-body">Nenhum dado encontrado para este período.</div>}
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 pt-4 px-4 md:px-8">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading">Relatórios</h1>
          <p className="mt-1 text-sm font-medium text-brand-inactive-text dark:text-dark-body">Consulte os dados do seu negócio, filtre os resultados e escolha uma análise.</p>
        </div>
        <GlobalPeriodFilter />
      </header>

      {availableCategories.length > 0 ? (
        <Tabs value={activeCategory} onValueChange={(value) => setActiveCategory(value as ReportCategory)} className="w-full">
          <TabsList className="mb-6">
            {availableCategories.map((category) => <TabsTrigger key={category.id} value={category.id} icon={category.icon}>{category.label}</TabsTrigger>)}
          </TabsList>

          {availableCategories.map((category) => (
            <TabsContent key={category.id} value={category.id} className="mt-0">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {reports.filter((report) => report.category === category.id).map((report) => {
                  const locked = !hasMinimumPlan(props.planSlug, report.minimumPlan)
                  const star = planStarIconForTarget(report.minimumPlan)
                  const title: ReactNode = locked ? <span className="inline-flex items-center gap-2">{report.title}{star && <img src={star} alt="" className="h-4 w-4 object-contain" />}</span> : report.title
                  return <ListItem key={report.id} icon={report.icon} title={title} description={report.description} showChevron onClick={() => openReport(report)} className="px-4 py-3 gap-4" />
                })}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="rounded-2xl border border-brand-border bg-white p-8 text-center dark:border-dark-border dark:bg-dark-surface">
          <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Nenhum relatório disponível para os recursos ativos desta conta.</p>
        </div>
      )}
    </div>
  )
}
