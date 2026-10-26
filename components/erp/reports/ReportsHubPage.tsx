"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/reusable"
import { GlobalPeriodFilter } from "@/components/erp/GlobalPeriodFilter"
import { useDashboard } from "@/components/erp/dashboard/DashboardContext"
import { ReportTableCard, type TableColumn, type TableRow } from "@/components/erp/reports/widgets/ReportTableCard"
import { exportCSV, exportXLSX } from "@/lib/utils/export-report"
import { hasMinimumPlan, type PlanTierSlug } from "@/lib/subscription/plan-tier"
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
  LockIcon,
  ExportFileIcon,
  ChartIcon,
  CalendarIcon,
  ReturnIcon,
} from "@/lib/icons"

type ReportCategory = "vendas" | "produtos" | "financeiro" | "clientes" | "servicos" | "operacao" | "marketing" | "assinaturas"
type CellValue = string | number

interface ReportDefinition {
  id: string
  category: ReportCategory
  title: string
  description: string
  icon: React.ElementType
  minimumPlan: PlanTierSlug
  columns: TableColumn[]
  rows: TableRow[]
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
  icon: React.ElementType
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

function pointLabel(point: ChartPoint) {
  return String(point.label ?? point.name ?? point.category ?? point.title ?? "-")
}

function pointValue(point: ChartPoint) {
  return Number(point.value ?? point.total ?? point.amount ?? point.revenue ?? 0)
}

function listLabel(item: DashboardListItem) {
  return item.title || item.subtitle || "-"
}

function listRows(items: DashboardListItem[], valueHeader = "Valor"): { columns: TableColumn[]; rows: TableRow[] } {
  return {
    columns: [
      { key: "label", header: "Nome" },
      { key: "detail", header: "Detalhes" },
      { key: "value", header: valueHeader, align: "right" },
    ],
    rows: items.map((item, index) => ({
      id: item.id || `${index}`,
      label: listLabel(item),
      detail: item.subtitle || item.meta || "-",
      value: item.value || "-",
    })),
  }
}

function metricRows(metrics: Array<{ title: string; value: string }>) {
  return {
    columns: [
      { key: "metric", header: "Indicador" },
      { key: "value", header: "Valor", align: "right" as const },
    ],
    rows: metrics.map((metric, index) => ({ id: `${index}`, metric: metric.title, value: metric.value })),
  }
}

function chartRows(points: ChartPoint[], valueHeader = "Valor", format: (value: number) => string = currency) {
  return {
    columns: [
      { key: "label", header: "Período" },
      { key: "value", header: valueHeader, align: "right" as const },
    ],
    rows: points.map((point, index) => ({ id: `${index}`, label: pointLabel(point), value: format(pointValue(point)) })),
  }
}

function createReports(props: ReportsHubPageProps): ReportDefinition[] {
  const reports: ReportDefinition[] = []

  if (props.salesData) {
    reports.push({
      id: "vendas-periodo",
      category: "vendas",
      title: "Vendas por período",
      description: "Acompanhe a evolução da receita no período selecionado.",
      icon: AnalyticsIcon,
      minimumPlan: "crescer",
      ...chartRows(props.salesData.evolution, "Receita"),
    })
    reports.push({
      id: "vendas-canal",
      category: "vendas",
      title: "Vendas por canal",
      description: "Compare a receita gerada pelos diferentes canais de venda.",
      icon: ChartIcon,
      minimumPlan: "crescer",
      ...chartRows(props.salesData.bySource, "Receita"),
    })
    reports.push({
      id: "vendas-pagamento",
      category: "vendas",
      title: "Vendas por forma de pagamento",
      description: "Veja como os clientes estão pagando pelas compras.",
      icon: MoneyIcon,
      minimumPlan: "crescer",
      ...chartRows(props.salesData.byPaymentMethod, "Receita"),
    })
    reports.push({
      id: "produtos-mais-vendidos",
      category: "vendas",
      title: "Produtos mais vendidos",
      description: "Ranking dos produtos com maior participação nas vendas.",
      icon: PackageIcon,
      minimumPlan: "crescer",
      columns: [
        { key: "label", header: "Produto" },
        { key: "detail", header: "Detalhes" },
        { key: "value", header: "Valor vendido", align: "right" },
      ],
      rows: props.salesData.topProducts.map((item) => ({ id: item.id, label: item.label, detail: item.subtitle || "-", value: currency(item.value) })),
    })
    reports.push({
      id: "margem-produtos",
      category: "vendas",
      title: "Margem por produto",
      description: "Analise os produtos com maior margem estimada.",
      icon: ChartIcon,
      minimumPlan: "escalar",
      columns: [
        { key: "label", header: "Produto" },
        { key: "margin", header: "Margem", align: "right" },
        { key: "value", header: "Valor vendido", align: "right" },
      ],
      rows: props.salesData.topMarginProducts.map((item) => ({ id: item.id, label: item.label, margin: percent(item.margin), value: currency(item.value) })),
    })
  }

  if (props.productsData) {
    const idle = listRows(props.productsData.idleProducts, "Estoque")
    reports.push({ id: "estoque-parado", category: "produtos", title: "Produtos sem movimentação", description: "Identifique produtos parados que podem precisar de reposição, ajuste ou promoção.", icon: PackageIcon, minimumPlan: "crescer", ...idle })
    const critical = listRows(props.productsData.criticalStock, "Estoque")
    reports.push({ id: "estoque-critico", category: "produtos", title: "Estoque crítico", description: "Veja os itens com estoque baixo ou próximo de acabar.", icon: PackageIcon, minimumPlan: "crescer", ...critical })
    reports.push({ id: "curva-abc", category: "produtos", title: "Curva ABC de produtos", description: "Classifique os produtos pela participação no faturamento.", icon: ChartIcon, minimumPlan: "escalar", columns: [{ key: "label", header: "Produto" }, { key: "category", header: "Classe", align: "center" }, { key: "value", header: "Valor", align: "right" }, { key: "cumulative", header: "Acumulado", align: "right" }], rows: (props.salesData?.abcCurve || []).map((item, index) => ({ id: `${index}`, label: item.label, category: item.category, value: currency(item.value), cumulative: percent(item.cumulative) })) })
  }

  if (props.financialData) {
    reports.push({ id: "fluxo-caixa", category: "financeiro", title: "Fluxo de caixa", description: "Consulte a evolução das entradas, saídas e resultado do período.", icon: MoneyIcon, minimumPlan: "crescer", ...chartRows(props.financialData.cashflow, "Resultado") })
    reports.push({ id: "receitas-despesas", category: "financeiro", title: "Receitas e despesas", description: "Compare a movimentação financeira no período selecionado.", icon: MoneyIcon, minimumPlan: "crescer", ...chartRows(props.financialData.revenue, "Valor") })
    reports.push({ id: "despesas-categoria", category: "financeiro", title: "Despesas por categoria", description: "Entenda onde o negócio está concentrando seus gastos.", icon: ChartIcon, minimumPlan: "crescer", ...chartRows(props.financialData.expensesByCategory, "Despesas") })
    reports.push({ id: "contas-vencidas", category: "financeiro", title: "Contas vencidas", description: "Acompanhe os lançamentos que precisam de atenção.", icon: FileTextIcon, minimumPlan: "crescer", ...listRows(props.financialData.overdueAccounts, "Valor") })
  }

  if (props.customerData) {
    reports.push({ id: "clientes-top", category: "clientes", title: "Clientes com maior faturamento", description: "Veja quem mais compra e contribui para o faturamento.", icon: Users, minimumPlan: "crescer", columns: [{ key: "label", header: "Cliente" }, { key: "orders", header: "Pedidos", align: "right" }, { key: "value", header: "Valor", align: "right" }], rows: props.customerData.topCustomers.map((item) => ({ id: item.id, label: item.label, orders: integer(item.orders), value: item.value })) })
    reports.push({ id: "clientes-inativos", category: "clientes", title: "Clientes sem compras recentes", description: "Encontre clientes que podem receber uma nova ação comercial.", icon: Users, minimumPlan: "crescer", columns: [{ key: "label", header: "Cliente" }, { key: "detail", header: "Última informação" }, { key: "orders", header: "Pedidos", align: "right" }], rows: props.customerData.inactiveCustomerList.map((item) => ({ id: item.id, label: item.label, detail: item.subtitle, orders: integer(item.orders) })) })
    reports.push({ id: "carteira-clientes", category: "clientes", title: "Evolução da carteira", description: "Compare clientes ativos e novos ao longo do período.", icon: Users, minimumPlan: "escalar", columns: [{ key: "label", header: "Período" }, { key: "active", header: "Ativos", align: "right" }, { key: "new", header: "Novos", align: "right" }], rows: props.customerData.customerEvolution.map((item, index) => ({ id: `${index}`, label: item.label, active: integer(item.ativos), new: integer(item.novos) })) })
  }

  if (props.servicesData || props.appointmentsData || props.serviceOrdersData || props.productivityData) {
    if (props.servicesData) {
      reports.push({ id: "servicos-catalogo", category: "servicos", title: "Serviços por desempenho", description: "Consulte os serviços mais procurados no período.", icon: WrenchIcon, minimumPlan: "crescer", ...listRows(props.servicesData.serviceRows, "Atendimentos") })
      reports.push({ id: "profissionais-servicos", category: "servicos", title: "Desempenho por profissional", description: "Compare a produção da equipe de atendimento.", icon: Users, minimumPlan: "escalar", ...listRows(props.servicesData.staffRows, "Atendimentos") })
    }
    if (props.appointmentsData) {
      reports.push({ id: "agendamentos-status", category: "servicos", title: "Agendamentos por status", description: "Veja a situação dos atendimentos do período.", icon: CalendarIcon, minimumPlan: "crescer", ...chartRows(props.appointmentsData.statusBreakdown, "Agendamentos", integer) })
      reports.push({ id: "agendamentos-servico", category: "servicos", title: "Serviços mais agendados", description: "Identifique os serviços com maior procura.", icon: CalendarIcon, minimumPlan: "escalar", ...chartRows(props.appointmentsData.servicePopularity, "Agendamentos", integer) })
    }
    if (props.serviceOrdersData) {
      reports.push({ id: "ordens-status", category: "servicos", title: "Ordens de serviço por status", description: "Acompanhe o volume de OS abertas, em andamento e concluídas.", icon: FileTextIcon, minimumPlan: "escalar", ...chartRows(props.serviceOrdersData.byStatus, "Ordens", integer) })
    }
  }

  if (props.deliveryData || props.returnsData) {
    if (props.deliveryData) reports.push({ id: "entregas-status", category: "operacao", title: "Entregas por status", description: "Acompanhe pendências, entregas concluídas e atrasos.", icon: TruckIcon, minimumPlan: "crescer", ...chartRows(props.deliveryData.byStatus, "Entregas", integer) })
    if (props.returnsData) {
      reports.push({ id: "devolucoes-motivo", category: "operacao", title: "Devoluções por motivo", description: "Entenda por que os clientes estão devolvendo pedidos.", icon: ReturnIcon, minimumPlan: "crescer", ...chartRows(props.returnsData.byReason, "Devoluções", integer) })
      reports.push({ id: "produtos-devolvidos", category: "operacao", title: "Produtos mais devolvidos", description: "Identifique itens que merecem uma investigação comercial ou operacional.", icon: ReturnIcon, minimumPlan: "escalar", columns: [{ key: "label", header: "Produto" }, { key: "count", header: "Devoluções", align: "right" }, { key: "quantity", header: "Quantidade", align: "right" }], rows: props.returnsData.topReturnedProducts.map((item, index) => ({ id: `${index}`, label: item.productName, count: integer(item.count), quantity: integer(item.totalQuantity) })) })
    }
  }

  if (props.marketingData) {
    reports.push({ id: "marketing-canais", category: "marketing", title: "Receita por canal", description: "Compare a receita originada pelos canais de venda.", icon: MegaphoneIcon, minimumPlan: "crescer", ...chartRows(props.marketingData.revenueBySource, "Receita") })
    reports.push({ id: "marketing-cupons", category: "marketing", title: "Desempenho dos cupons", description: "Avalie utilização e descontos concedidos pelos cupons.", icon: MegaphoneIcon, minimumPlan: "escalar", columns: [{ key: "code", header: "Cupom" }, { key: "usage", header: "Utilizações", align: "right" }, { key: "discount", header: "Desconto", align: "right" }], rows: props.marketingData.topCoupons.map((item) => ({ id: item.id, code: item.code, usage: integer(item.usageCount), discount: currency(item.discountValue) })) })
    reports.push({ id: "marketing-campanhas", category: "marketing", title: "Campanhas promocionais", description: "Acompanhe campanhas ativas e o período de cada ação.", icon: MegaphoneIcon, minimumPlan: "escalar", columns: [{ key: "name", header: "Campanha" }, { key: "status", header: "Status" }, { key: "period", header: "Período" }], rows: props.marketingData.campaigns.map((item) => ({ id: item.id, name: item.name, status: item.isActive ? "Ativa" : "Encerrada", period: `${item.startsAt ? item.startsAt.slice(0, 10) : "-"} até ${item.endsAt ? item.endsAt.slice(0, 10) : "-"}` })) })
  }

  if (props.subscriptionData) {
    reports.push({ id: "assinaturas-resumo", category: "assinaturas", title: "Resumo das assinaturas", description: "Acompanhe receita recorrente, renovação e cancelamentos.", icon: RepeatIcon, minimumPlan: "escalar", ...metricRows([{ title: "MRR ativo", value: currency(props.subscriptionData.mrr) }, { title: "ARR anualizado", value: currency(props.subscriptionData.arr) }, { title: "LTV médio", value: currency(props.subscriptionData.ltv) }, { title: "Taxa de renovação", value: percent(props.subscriptionData.renewalRate) }, { title: "Churn em 30 dias", value: percent(props.subscriptionData.churnRate) }]) })
    reports.push({ id: "assinaturas-status", category: "assinaturas", title: "Assinaturas por status", description: "Veja a composição da base recorrente.", icon: RepeatIcon, minimumPlan: "escalar", columns: [{ key: "status", header: "Status" }, { key: "count", header: "Quantidade", align: "right" }], rows: [{ id: "active", status: "Ativas", count: integer(props.subscriptionData.activeCount) }, { id: "paused", status: "Pausadas", count: integer(props.subscriptionData.pausedCount) }, { id: "delinquent", status: "Pendentes", count: integer(props.subscriptionData.delinquentCount) }, { id: "cancelled", status: "Canceladas", count: integer(props.subscriptionData.cancelledCount) }] })
  }

  if (props.productivityData) {
    reports.push({ id: "produtividade-equipe", category: "servicos", title: "Produtividade da equipe", description: "Compare atendimentos, receita e cancelamentos por profissional.", icon: Users, minimumPlan: "escalar", columns: [{ key: "label", header: "Profissional" }, { key: "appointments", header: "Atendimentos", align: "right" }, { key: "revenue", header: "Receita", align: "right" }, { key: "cancelled", header: "Cancelamentos", align: "right" }], rows: props.productivityData.staffRanking.map((item) => ({ id: item.id, label: item.label, appointments: integer(item.appointments), revenue: currency(item.revenue), cancelled: integer(item.cancelled) })) })
  }

  return reports
}

function UpgradeMessage({ minimumPlan }: { minimumPlan: PlanTierSlug }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[24px] border border-brand-border bg-white p-8 text-center dark:border-dark-border dark:bg-dark-surface">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-green-light text-brand-green dark:bg-dark-border/40">
        <LockIcon size={24} />
      </div>
      <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Relatório do plano {minimumPlan === "escalar" ? "Escalar" : "Crescer"}</h3>
      <p className="mt-2 max-w-md text-sm font-medium text-brand-inactive-text dark:text-dark-body">Faça upgrade do plano para liberar esta análise.</p>
    </div>
  )
}

export function ReportsHubPage(props: ReportsHubPageProps) {
  const { setExportHandler } = useDashboard()
  const reports = useMemo(() => createReports(props), [props])
  const availableCategories = useMemo(() => CATEGORIES.filter((category) => reports.some((report) => report.category === category.id)), [reports])
  const [activeCategory, setActiveCategory] = useState<ReportCategory>(availableCategories[0]?.id || "vendas")
  const categoryReports = reports.filter((report) => report.category === activeCategory)
  const [selectedId, setSelectedId] = useState(categoryReports[0]?.id || "")
  const selectedReport = categoryReports.find((report) => report.id === selectedId) || categoryReports[0]

  useEffect(() => {
    if (!availableCategories.some((category) => category.id === activeCategory)) {
      setActiveCategory(availableCategories[0]?.id || "vendas")
    }
  }, [activeCategory, availableCategories])

  useEffect(() => {
    setSelectedId(categoryReports[0]?.id || "")
  }, [activeCategory, categoryReports])

  const exportSelected = useCallback(async (format: "csv" | "xlsx") => {
    if (!selectedReport || !hasMinimumPlan(props.planSlug, selectedReport.minimumPlan)) return
    const headers = selectedReport.columns.map((column) => column.header)
    const rows = selectedReport.rows.map((row) => selectedReport.columns.map((column) => String(row[column.key] ?? "-")))
    const filename = `relatorio-${selectedReport.id}`
    if (format === "csv") exportCSV(filename, headers, rows)
    else await exportXLSX(filename, [{ name: selectedReport.title.slice(0, 31), headers, rows }])
  }, [props.planSlug, selectedReport])

  useEffect(() => {
    setExportHandler(selectedReport && hasMinimumPlan(props.planSlug, selectedReport.minimumPlan) ? exportSelected : null)
    return () => setExportHandler(null)
  }, [exportSelected, props.planSlug, selectedReport, setExportHandler])

  return (
    <div className="w-full space-y-6 pt-4 px-4 md:px-8">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-[32px] font-bold text-brand-dark dark:text-dark-heading">Relatórios</h1>
          <p className="mt-1 text-sm font-medium text-brand-inactive-text dark:text-dark-body">Consulte os dados do seu negócio, filtre os resultados e exporte a análise selecionada.</p>
        </div>
        <GlobalPeriodFilter />
      </header>

      {availableCategories.length > 0 ? (
        <Tabs value={activeCategory} onValueChange={(value) => setActiveCategory(value as ReportCategory)} className="w-full">
          <TabsList className="mb-6">
            {availableCategories.map((category) => (
              <TabsTrigger key={category.id} value={category.id} icon={category.icon}>{category.label}</TabsTrigger>
            ))}
          </TabsList>

          {availableCategories.map((category) => (
            <TabsContent key={category.id} value={category.id} className="mt-0">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {categoryReports.map((report) => {
                  const locked = !hasMinimumPlan(props.planSlug, report.minimumPlan)
                  const Icon = report.icon
                  const selected = report.id === selectedReport?.id
                  return (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => setSelectedId(report.id)}
                      className={`rounded-[24px] border p-5 text-left transition-colors ${selected ? "border-brand-green bg-brand-green-light/30 dark:border-brand-green dark:bg-dark-border/30" : "border-brand-border bg-white hover:border-brand-green/60 dark:border-dark-border dark:bg-dark-surface"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-green-light text-brand-dark dark:bg-dark-border/40 dark:text-dark-heading">
                          <Icon size={18} />
                        </div>
                        {locked && <LockIcon size={16} className="text-brand-inactive-text dark:text-dark-body" />}
                      </div>
                      <h2 className="mt-4 text-lg font-bold text-brand-dark dark:text-dark-heading">{report.title}</h2>
                      <p className="mt-2 text-sm font-medium leading-relaxed text-brand-inactive-text dark:text-dark-body">{report.description}</p>
                      <span className="mt-4 block text-[13px] font-bold text-brand-green">{locked ? `Plano ${report.minimumPlan === "escalar" ? "Escalar" : "Crescer"}` : `${report.rows.length} registro${report.rows.length === 1 ? "" : "s"}`}</span>
                    </button>
                  )
                })}
              </div>

              {selectedReport && (
                <div className="mt-6 rounded-[24px] border border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                  <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{selectedReport.title}</h2>
                      <p className="mt-1 text-sm font-medium text-brand-inactive-text dark:text-dark-body">{selectedReport.description}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-brand-inactive-text dark:text-dark-body">
                      <ExportFileIcon size={16} />
                      Use o botão de exportação no filtro de período
                    </div>
                  </div>
                  {hasMinimumPlan(props.planSlug, selectedReport.minimumPlan) ? (
                    <ReportTableCard columns={selectedReport.columns} data={selectedReport.rows} pageSize={8} emptyMessage="Nenhum dado encontrado para este período." />
                  ) : (
                    <UpgradeMessage minimumPlan={selectedReport.minimumPlan} />
                  )}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="rounded-[24px] border border-brand-border bg-white p-8 text-center dark:border-dark-border dark:bg-dark-surface">
          <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Nenhum relatório disponível para os recursos ativos desta conta.</p>
        </div>
      )}
    </div>
  )
}
