"use client"

import React, { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/reusable"
import { ProductsTab } from "@/components/erp/dashboard/widgets/ProductsTab"
import { ServicesTab } from "@/components/erp/dashboard/widgets/ServicesTab"
import { FinancialTab } from "@/components/erp/dashboard/widgets/FinancialTab"
import { SummaryCards } from "@/components/erp/dashboard/LeftColumn"
import {
  DashboardPieChart, DashboardLineChart, DashboardBarChart, CHART_COLORS
} from "@/components/erp/dashboard/charts/DashboardCharts"
import { ListItem } from "@/components/reusable"
import { ReportExportButton } from "./shared"
import { exportCSV, exportXLSX } from "@/lib/utils/export-report"
import { formatCurrency as brl } from "@/lib/utils"
import {
  GridIcon, AnalyticsIcon, PackageIcon, WrenchIcon, TruckIcon, FileTextIcon,
  MoneyIcon, Users, MegaphoneIcon, AwardIcon, ReturnIcon,
  ChartIcon, ShoppingBagIcon, TagIcon, TrendingUpIcon, CreditCardIcon,
  ListIcon, AlertCircleIcon, CalendarIcon, ClockIcon, ArrowUpIcon, ArrowDownIcon,
  SparklesIcon, ShoppingCartIcon, StarIcon, TargetIcon,
} from "@/lib/icons"
import { ReportTableCard } from "./widgets"
import type { ProductsDashboardData, ServicesDashboardData, FinancialDashboardData } from "@/lib/data/dashboard"
import type {
  SalesReportData, CustomerReportData, ReturnsReportData,
  DeliveryReportData, MarketingReportData, ProductivityReportData,
  ServiceOrderReportData, GoalReportData,
} from "@/lib/data/reports"
import type { Period } from "@/lib/period-types"
import {
  generateSalesInsights, generateProductsInsights, generateServicesInsights,
  generateFinancialInsights, generateCustomerInsights, generateMarketingInsights,
  generateReturnsInsights, generateDeliveryInsights, generateProductivityInsights,
} from "./insights"
import type { Insight } from "./insights"

type TabId = "visao-geral" | "vendas" | "produtos" | "servicos" | "entregas" | "ordens-servico" | "financeiro" | "clientes" | "marketing" | "produtividade" | "trocas"

interface TabDefinition {
  id: TabId
  label: string
  icon: React.ElementType
}

const REPORT_TABS: TabDefinition[] = [
  { id: "visao-geral",   label: "Visão Geral",     icon: GridIcon },
  { id: "vendas",        label: "Vendas",           icon: AnalyticsIcon },
  { id: "produtos",      label: "Produtos",         icon: PackageIcon },
  { id: "servicos",      label: "Serviços",         icon: WrenchIcon },
  { id: "entregas",      label: "Entregas",         icon: TruckIcon },
  { id: "ordens-servico",label: "Ordens de Serviço",icon: FileTextIcon },
  { id: "financeiro",    label: "Financeiro",       icon: MoneyIcon },
  { id: "clientes",      label: "Clientes",         icon: Users },
  { id: "marketing",     label: "Marketing",        icon: MegaphoneIcon },
  { id: "produtividade", label: "Produtividade",    icon: AwardIcon },
  { id: "trocas",        label: "Trocas/Devoluções", icon: ReturnIcon },
]

const TONE_MAP: Record<string, React.ElementType> = {
  positive: ArrowUpIcon, negative: ArrowDownIcon, warning: AlertCircleIcon, info: SparklesIcon, neutral: SparklesIcon,
}
const TONE_COLORS: Record<string, string> = {
  positive: "text-brand-green", negative: "text-[#cc4745]", warning: "text-[#d97706]", info: "text-brand-dark", neutral: "text-brand-inactive-text",
}

function insightToList(insight: Insight) {
  const Icon = TONE_MAP[insight.tone] || SparklesIcon
  return { icon: Icon, title: insight.message, tone: insight.tone }
}

interface ReportsPageProps {
  sells: string[]
  period: Period
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
  goalData: GoalReportData | null
  stockValue: number
}

function useAvailableTabs(props: ReportsPageProps): TabDefinition[] {
  const { sells, productsData, servicesData, financialData, deliveryData } = props
  const sellsProducts = sells.includes("products")
  const sellsServices = sells.includes("services")
  return useMemo(() => REPORT_TABS.filter(tab => {
    switch (tab.id) {
      case "produtos": case "vendas": case "marketing": return sellsProducts && productsData !== null
      case "servicos": return sellsServices && servicesData !== null
      case "ordens-servico": return props.serviceOrdersData !== null
      case "entregas": return deliveryData !== null
      case "financeiro": return financialData !== null
      case "clientes": return props.customerData !== null
      case "produtividade": return props.productivityData !== null
      case "trocas": return props.returnsData !== null
      default: return true
    }
  }), [sellsProducts, sellsServices, productsData, servicesData, financialData, deliveryData, props.customerData, props.productivityData, props.returnsData, props.serviceOrdersData])
}

function InsightsCard({ insights, title = "Insights" }: { insights: Insight[]; title?: string }) {
  if (insights.length === 0) return null
  return (
    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
      <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2 mb-4">
        <SparklesIcon size={20} className="text-brand-dark dark:text-dark-heading opacity-80" />
        {title}
      </h3>
      <div className="space-y-2">
        {insights.slice(0, 5).map((insight, i) => {
          const { icon: Icon, title: msg, tone } = insightToList(insight)
          return <ListItem key={insight.id || i} icon={Icon} title={msg} titleClassName={TONE_COLORS[tone]} />
        })}
      </div>
    </div>
  )
}

function CardHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      <Icon size={20} className="text-brand-dark dark:text-dark-heading opacity-80" />
      <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h3>
    </div>
  )
}

// ─────────────────────────── Header ───────────────────────────

function SectionHeader({ title, onExport }: { title: string; onExport: (f: "csv" | "xlsx") => Promise<void> }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{title}</h2>
      <ReportExportButton onExport={onExport} />
    </div>
  )
}

export function ReportsPage(props: ReportsPageProps) {
  const availableTabs = useAvailableTabs(props)
  const initialTab = availableTabs.length > 0 ? availableTabs[0].id : ""
  const [activeTab, setActiveTab] = useState<string>(initialTab)

  if (availableTabs.length === 0) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-center">
        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Nenhum relatório disponível para seu perfil.</span>
      </div>
    )
  }

  return (
    <Tabs defaultValue={initialTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="mb-8">
        {availableTabs.map(tab => (
          <TabsTrigger key={tab.id} value={tab.id} icon={tab.icon}>{tab.label}</TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="visao-geral"><GeneralOverviewSection {...props} /></TabsContent>
      <TabsContent value="vendas"><SalesSection {...props} /></TabsContent>
      {props.productsData && <TabsContent value="produtos"><ProductsSection productsData={props.productsData} stockValue={props.stockValue} /></TabsContent>}
      {props.servicesData &&       <TabsContent value="servicos"><ServicesTab data={props.servicesData} /></TabsContent>}
      {props.deliveryData && <TabsContent value="entregas"><DeliveriesSection {...props} /></TabsContent>}
      {props.serviceOrdersData && <TabsContent value="ordens-servico"><ServiceOrdersSection {...props} /></TabsContent>}
      {props.financialData && <TabsContent value="financeiro"><FinancialTab data={props.financialData} /></TabsContent>}
      <TabsContent value="clientes"><CustomersSection {...props} /></TabsContent>
      <TabsContent value="marketing"><MarketingSection {...props} /></TabsContent>
      <TabsContent value="produtividade"><ProductivitySection productivityData={props.productivityData} goalData={props.goalData} /></TabsContent>
      <TabsContent value="trocas"><ReturnsSection {...props} /></TabsContent>
    </Tabs>
  )
}

// ─────────────────── 1. Visão Geral ───────────────────

function GeneralOverviewSection(props: ReportsPageProps) {
  const router = useRouter()
  const allInsights: Insight[] = [
    ...(props.salesData ? generateSalesInsights({
      revenue: props.salesData.metrics.revenue, previousRevenue: 0,
      orderCount: props.salesData.metrics.orderCount, previousOrderCount: 0,
      ticketMedio: props.salesData.metrics.ticketMedio, previousTicketMedio: 0,
    }) : []),
    ...(props.productsData ? generateProductsInsights({
      totalProducts: Number(props.productsData.metrics.find((m: any) => m.title.includes("ativos"))?.value || 0),
      outOfStock: Number(props.productsData.metrics.find((m: any) => m.title.includes("sem estoque"))?.value || 0),
      lowStock: Number(props.productsData.metrics.find((m: any) => m.title.includes("baixo"))?.value || 0),
      idleProductCount: (props.productsData.idleProducts || []).length,
    }) : []),
    ...(props.servicesData ? generateServicesInsights({
      todayAppointments: Number(props.servicesData.metrics.find((m: any) => m.title.includes("hoje"))?.value || 0),
      cancelledCount: Number(props.servicesData.metrics.find((m: any) => m.title.includes("Cancelados"))?.value || 0),
      totalAppointments: 0,
      attendanceRate: Number(String(props.servicesData.metrics.find((m: any) => m.title.includes("Comparecimento"))?.value || "0").replace("%", "")),
      topStaffName: props.servicesData.staffRows[0]?.title,
      topStaffRevenue: parseFloat(String(props.servicesData.staffRows[0]?.value || "0").replace(/[^\d,.-]/g, "").replace(",", ".")),
    }) : []),
  ]

  const kpis = [
    { title: "Receita", value: props.salesData?.metrics.revenueFormatted || "R$ 0,00", trend: props.salesData?.metrics.revenueTrend || "" },
    { title: "Pedidos", value: String(props.salesData?.metrics.orderCount || 0), trend: props.salesData?.metrics.orderTrend || "" },
    { title: "Ticket Médio", value: props.salesData?.metrics.ticketFormatted || "R$ 0,00", trend: props.salesData?.metrics.ticketTrend || "" },
    { title: "Clientes Ativos", value: String(props.customerData?.activeCustomers || 0), trend: "" },
    { title: "Novos Clientes", value: String(props.customerData?.newCustomers || 0), trend: "" },
  ].filter(k => k.value !== "R$ 0,00" && k.value !== "0").slice(0, 4)

  const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
    const headers = ["Indicador", "Valor"]
    const rows = [["Receita", props.salesData?.metrics.revenueFormatted || "-"], ["Pedidos", String(props.salesData?.metrics.orderCount || 0)]]
    if (fmt === "csv") exportCSV("visao-geral", headers, rows)
    else await exportXLSX("visao-geral", [{ name: "Visão Geral", headers, rows }])
  }, [props])

  const evoData = (props.salesData?.evolution || []).map(e => ({ label: e.label, value: e.value, secondary: e.secondary }))
  const sourceData = (props.marketingData?.revenueBySource || []).map(s => ({ label: s.label, value: s.value }))

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <SectionHeader title="Visão Geral dos Relatórios" onExport={onExport} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6 flex flex-col gap-6">
          <SummaryCards metrics={kpis} />
        </div>
        <div className="lg:col-span-6 flex flex-col gap-6">
          <InsightsCard insights={allInsights} />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TrendingUpIcon} title="Evolução de Vendas" />
            {evoData.length > 0 ? <DashboardLineChart data={evoData} /> : <p className="text-sm text-brand-inactive-text">Sem dados</p>}
          </div>
        </div>
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TagIcon} title="Receita por Canal" />
            {sourceData.length > 0 ? (
              <div className="flex justify-center">
                <DashboardPieChart data={sourceData} totalValue={props.marketingData?.totalRevenueFormatted || "R$ 0"} totalLabel="Total" innerRadius={68} outerRadius={92} className="h-[220px]" />
              </div>
            ) : <p className="text-sm text-brand-inactive-text">Sem dados</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────── 2. Vendas ───────────────────

function SalesSection({ salesData, period }: { salesData: SalesReportData | null; period: Period }) {
  const router = useRouter()
  if (!salesData) return <SectionPlaceholder title="Vendas" description="Ative o módulo de produtos para visualizar relatórios de vendas." />

  const insights = generateSalesInsights({
    revenue: salesData.metrics.revenue, previousRevenue: 0,
    orderCount: salesData.metrics.orderCount, previousOrderCount: 0,
    ticketMedio: salesData.metrics.ticketMedio, previousTicketMedio: 0,
  })

  const kpis = [
    { title: "Receita", value: salesData.metrics.revenueFormatted, trend: salesData.metrics.revenueTrend },
    { title: "Receita Líquida", value: salesData.metrics.netRevenueFormatted, trend: "" },
    { title: "Pedidos", value: String(salesData.metrics.orderCount), trend: salesData.metrics.orderTrend },
    { title: "Itens Vendidos", value: String(salesData.metrics.itemsSold), trend: "" },
    { title: "Cancelamento", value: salesData.metrics.cancellationRateFormatted, trend: "" },
    { title: "Ticket Médio", value: salesData.metrics.ticketFormatted, trend: salesData.metrics.ticketTrend },
    ...(salesData.metrics.costCoveragePct >= 50 ? [
      { title: "Lucro Bruto", value: salesData.metrics.estimatedGrossProfitFormatted, trend: "" },
      { title: "Margem", value: salesData.metrics.grossMarginFormatted, trend: "" },
    ] : []),
  ]

  const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
    const headers = ["Indicador", "Valor"]
    const rows = [["Receita", salesData.metrics.revenueFormatted], ["Pedidos", String(salesData.metrics.orderCount)]]
    if (fmt === "csv") exportCSV("relatorio-vendas", headers, rows)
    else await exportXLSX("relatorio-vendas", [{ name: "Vendas", headers, rows }])
  }, [salesData])

  const evoData = salesData.evolution.map(e => ({ label: e.label, value: e.value, secondary: e.secondary }))
  const paymentLabels: Record<string, string> = { credit: "Crédito", debit: "Débito", cash: "Dinheiro", pix: "Pix", credit_card: "Cartão Crédito", debit_card: "Cartão Débito", money: "Dinheiro", transfer: "Transferência", boleto: "Boleto" }
  const paymentData = salesData.byPaymentMethod.map(p => ({ label: paymentLabels[p.label.toLowerCase()] || p.label, value: p.value }))
  const sourceData = salesData.bySource.map(s => ({ label: s.label, value: s.value }))

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <SectionHeader title="Relatório de Vendas" onExport={onExport} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6"><SummaryCards metrics={kpis} /></div>
        <div className="lg:col-span-6"><InsightsCard insights={insights} /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TrendingUpIcon} title="Evolução de Vendas" />
            <DashboardLineChart data={evoData} />
          </div>
        </div>
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={ShoppingBagIcon} title="Produtos Mais Vendidos" />
            <DashboardBarChart data={salesData.topProducts.map(p => ({ label: p.label, value: p.value }))} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TagIcon} title="Vendas por Canal" />
            <div className="flex justify-center">
              <DashboardPieChart data={sourceData} totalValue={salesData.metrics.revenueFormatted} totalLabel="Faturamento" innerRadius={68} outerRadius={92} className="h-[220px]" />
            </div>
          </div>
        </div>
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={CreditCardIcon} title="Forma de Pagamento" />
            <div className="flex justify-center">
              <DashboardPieChart data={paymentData} totalValue={salesData.metrics.revenueFormatted} totalLabel="Faturamento" innerRadius={68} outerRadius={92} className="h-[220px]" />
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={ClockIcon} title="Pedidos por Hora" />
            <DashboardBarChart data={salesData.ordersByHour.map(h => ({ label: h.label, value: h.value }))} />
          </div>
        </div>
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={CalendarIcon} title="Pedidos por Dia da Semana" />
            <DashboardBarChart data={salesData.ordersByDayOfWeek.map(d => ({ label: d.label, value: d.value }))} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TargetIcon} title="Curva ABC" />
            <DashboardBarChart data={salesData.abcCurve.map(a => ({ label: a.label, value: a.value })).slice(0, 10)} />
          </div>
        </div>
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={PackageIcon} title="Menos Vendidos" />
            <div className="space-y-2">
              {salesData.leastSoldProducts.map(p => (
                <ListItem key={p.id} icon={PackageIcon} title={p.label} description={`${p.value} un. no período`} />
              ))}
            </div>
          </div>
        </div>
      </div>
      {salesData.topServices.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
          <div className="lg:col-span-6">
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
              <CardHeader icon={WrenchIcon} title="Serviços Mais Vendidos" />
              <DashboardBarChart data={salesData.topServices.map(s => ({ label: s.label, value: s.value }))} />
            </div>
          </div>
          <div className="lg:col-span-6">
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
              <CardHeader icon={TrendingUpIcon} title="Maior Margem" />
              <div className="space-y-2">
                {salesData.topMarginProducts.map(p => (
                  <ListItem key={p.id} icon={StarIcon} title={p.label} description={`${p.margin}% de margem · ${brl(p.value)}`} />
                ))}
                {salesData.topMarginProducts.length === 0 && <p className="text-sm text-brand-inactive-text">Adicione preço de custo aos produtos.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────── 3. Produtos ───────────────────

function ProductsSection({ productsData, stockValue }: { productsData: ProductsDashboardData | null; stockValue: number }) {
  if (!productsData) return <SectionPlaceholder title="Produtos" description="Ative o módulo de produtos." />
  const router = useRouter()
  const insights = generateProductsInsights({
    totalProducts: Number(productsData.metrics.find((m: any) => m.title.includes("ativos"))?.value || 0),
    outOfStock: Number(productsData.metrics.find((m: any) => m.title.includes("sem estoque"))?.value || 0),
    lowStock: Number(productsData.metrics.find((m: any) => m.title.includes("baixo"))?.value || 0),
    idleProductCount: (productsData.idleProducts || []).length,
    topProductName: productsData.topProducts[0]?.title,
    topProductSales: parseFloat(String(productsData.topProducts[0]?.value?.replace(" un.", "") || "0")),
    topProductPreviousSales: 0,
  })

  const kpis = [
    ...productsData.metrics.slice(0, 4).map((m: any) => ({ title: m.title, value: m.value, trend: m.detail || "" })),
    ...(stockValue > 0 ? [{ title: "Valor em Estoque", value: brl(stockValue), trend: "" }] : []),
  ]
  const catData = (productsData.categorySales || []).map(c => ({ label: c.label, value: Number(c.value) }))
  const evoData = (productsData.salesEvolution || []).map(e => ({ label: e.label, value: Number(e.value), secondary: Number(e.secondary || 0) }))
  const bestSellerData = (productsData.bestSellers || []).map(b => ({ label: b.label, value: Number(b.value) }))

  const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
    const rows = productsData.metrics.slice(0, 4).map((m: any) => [m.title, m.value])
    if (fmt === "csv") exportCSV("relatorio-produtos", ["Indicador", "Valor"], rows)
    else await exportXLSX("relatorio-produtos", [{ name: "Produtos", headers: ["Indicador", "Valor"], rows }])
  }, [productsData])

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <SectionHeader title="Relatório de Produtos" onExport={onExport} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6"><SummaryCards metrics={kpis} /></div>
        <div className="lg:col-span-6"><InsightsCard insights={insights} /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TagIcon} title="Categorias mais Vendidas" />
            <div className="flex justify-center">
              <DashboardPieChart data={catData} innerRadius={68} outerRadius={92} className="h-[220px]" />
            </div>
          </div>
        </div>
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TrendingUpIcon} title="Evolução de Vendas" />
            <DashboardLineChart data={evoData} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-8">
          <ReportTableCard
            title="Estoque Crítico"
            columns={[{ key: "title", header: "Produto" }, { key: "subtitle", header: "Categoria" }, { key: "value", header: "Estoque" }]}
            data={(productsData.criticalStock || []).map((s: any) => ({ id: s.id, title: s.title, subtitle: s.subtitle, value: s.value }))}
            onRowClick={() => router.push("/erp/products")}
          />
        </div>
        <div className="lg:col-span-4">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={StarIcon} title="Destaques" />
            <div className="space-y-2">
              {(productsData.topProducts || []).slice(0, 4).map((p: any) => (
                <ListItem key={p.id} icon={ShoppingBagIcon} title={p.title} description={p.value} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────── 5. Clientes ───────────────────

function CustomersSection({ customerData, period }: { customerData: CustomerReportData | null; period: Period }) {
  const router = useRouter()
  if (!customerData) return <SectionPlaceholder title="Clientes" description="Relatórios de clientes disponíveis com o plano Crescer." />

  const insights = generateCustomerInsights({
    totalCustomers: customerData.totalCustomers, newCustomers: customerData.newCustomers, activeCustomers: customerData.activeCustomers,
    avgTicket: customerData.avgTicket, previousAvgTicket: customerData.previousAvgTicket,
    topCustomerName: customerData.topCustomers[0]?.label,
    topCustomerRevenue: parseFloat(String(customerData.topCustomers[0]?.value || "0").replace(/[^\d,.-]/g, "").replace(",", ".")),
  })

  const kpis = [
    { title: "Total de Clientes", value: String(customerData.totalCustomers), trend: "" },
    { title: "Ativos", value: String(customerData.activeCustomers), trend: "" },
    { title: "Recorrentes", value: String(customerData.recurringCustomers), trend: "" },
    { title: "Novos", value: String(customerData.newCustomers), trend: "" },
    { title: "Inativos (90d)", value: String(customerData.inactiveCustomers), trend: "" },
    { title: "Ticket Médio", value: customerData.avgTicketFormatted, trend: "" },
    { title: "Frequência", value: `${customerData.purchaseFrequency} pedidos/cliente`, trend: "" },
    { title: "Intervalo Médio", value: `${customerData.avgDaysBetweenPurchases} dias`, trend: "" },
  ]

  const evoData = customerData.customerEvolution.map(d => ({ label: d.label, value: d.ativos, secondary: d.novos }))

  const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
    const rows = [["Total", String(customerData.totalCustomers)], ["Ativos", String(customerData.activeCustomers)]]
    if (fmt === "csv") exportCSV("relatorio-clientes", ["Indicador", "Valor"], rows)
    else await exportXLSX("relatorio-clientes", [{ name: "Clientes", headers: ["Indicador", "Valor"], rows }])
  }, [customerData])

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <SectionHeader title="Relatório de Clientes" onExport={onExport} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6"><SummaryCards metrics={kpis} /></div>
        <div className="lg:col-span-6"><InsightsCard insights={insights} /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TrendingUpIcon} title="Ativos vs Novos" />
            <DashboardLineChart data={evoData} />
          </div>
        </div>
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={StarIcon} title="Top Clientes" />
            <div className="space-y-2">
              {customerData.topCustomers.slice(0, 5).map(c => (
                <ListItem key={c.id} icon={Users} title={c.label} description={`${c.value} · ${c.subtitle}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={AwardIcon} title="Clientes VIP" />
            <div className="space-y-2">
              {customerData.vipCustomers.slice(0, 5).map(c => (
                <ListItem key={c.id} icon={StarIcon} title={c.label} description={`${c.value} · ${c.orders} pedidos`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────── 7. Entregas ───────────────────

function DeliveriesSection({ deliveryData }: { deliveryData: DeliveryReportData | null }) {
  const router = useRouter()
  if (!deliveryData) return <SectionPlaceholder title="Entregas" description="Sem dados de entregas." />
  const insights = generateDeliveryInsights({
    totalDeliveries: deliveryData.metrics.total, lateCount: deliveryData.metrics.late,
    avgTimeMinutes: deliveryData.metrics.avgTimeMinutes, previousAvgTimeMinutes: deliveryData.metrics.previousAvgTimeMinutes,
    onTimeRate: deliveryData.metrics.onTimeRate,
  })

  const kpis = [
    { title: "Total Entregas", value: String(deliveryData.metrics.total), trend: "" },
    { title: "Pendentes", value: String(deliveryData.metrics.pending), trend: "" },
    { title: "Atrasadas", value: String(deliveryData.metrics.late), trend: "" },
    { title: "No Prazo", value: `${deliveryData.metrics.onTimeRate}%`, trend: "" },
  ]

  const evoData = deliveryData.evolution.map(e => ({ label: e.label, value: e.value, secondary: e.secondary }))
  const statusData = deliveryData.byStatus.map(s => ({ label: s.label, value: s.value }))

  const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
    const rows = [["Total", String(deliveryData.metrics.total)], ["No Prazo", `${deliveryData.metrics.onTimeRate}%`]]
    if (fmt === "csv") exportCSV("relatorio-entregas", ["Indicador", "Valor"], rows)
    else await exportXLSX("relatorio-entregas", [{ name: "Entregas", headers: ["Indicador", "Valor"], rows }])
  }, [deliveryData])

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <SectionHeader title="Relatório de Entregas" onExport={onExport} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6"><SummaryCards metrics={kpis} /></div>
        <div className="lg:col-span-6"><InsightsCard insights={insights} /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TrendingUpIcon} title="Entregas por Período" />
            <DashboardLineChart data={evoData} />
          </div>
        </div>
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TruckIcon} title="Situação" />
            <div className="flex justify-center">
              <DashboardPieChart data={statusData} totalValue={String(deliveryData.metrics.total)} totalLabel="Total" innerRadius={68} outerRadius={92} className="h-[220px]" />
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-8">
          <ReportTableCard
            title="Últimas Entregas"
            columns={[{ key: "id", header: "ID", render: (v: string) => v.slice(0, 8) }, { key: "status", header: "Status" }, { key: "deliveryPerson", header: "Entregador" }, { key: "date", header: "Data" }, { key: "duration", header: "Duração" }]}
            data={deliveryData.recentDeliveries}
          />
        </div>
        <div className="lg:col-span-4">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={ClockIcon} title="Tempo de Entrega" />
            <div className="text-[32px] font-bold text-brand-dark dark:text-dark-heading">{deliveryData.metrics.avgTimeMinutes}min</div>
            <p className="text-[13px] font-medium text-brand-inactive-text">média por entrega</p>
          </div>
        </div>
      </div>
      {deliveryData.deliveryPersonRanking.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
          <div className="lg:col-span-6">
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
              <CardHeader icon={TruckIcon} title="Ranking de Entregadores" />
              <div className="space-y-2">
                {deliveryData.deliveryPersonRanking.slice(0, 6).map(p => (
                  <ListItem key={p.id} icon={AwardIcon} title={p.name} description={`${p.deliveries} entregas`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────── 8. Ordens de Serviço ───────────────────

function ServiceOrdersSection({ serviceOrdersData }: { serviceOrdersData: ServiceOrderReportData | null }) {
  const router = useRouter()
  if (!serviceOrdersData) return <SectionPlaceholder title="Ordens de Serviço" description="Sem dados de ordens de serviço." />

  const kpis = [
    { title: "Total OS", value: String(serviceOrdersData.metrics.total), trend: "" },
    { title: "Abertas", value: String(serviceOrdersData.metrics.open), trend: "" },
    { title: "Em Andamento", value: String(serviceOrdersData.metrics.inProgress), trend: "" },
    { title: "Concluídas", value: String(serviceOrdersData.metrics.completed), trend: "" },
    { title: "Canceladas", value: String(serviceOrdersData.metrics.cancelled), trend: "" },
    { title: "Receita", value: serviceOrdersData.metrics.totalRevenueFormatted, trend: "" },
  ]

  const evoData = serviceOrdersData.evolution.map(e => ({ label: e.label, value: e.value, secondary: e.secondary }))
  const statusData = serviceOrdersData.byStatus.map(s => ({ label: s.label, value: s.value }))

  const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
    const rows = [["Total", String(serviceOrdersData.metrics.total)], ["Receita", serviceOrdersData.metrics.totalRevenueFormatted]]
    if (fmt === "csv") exportCSV("ordens-servico", ["Indicador", "Valor"], rows)
    else await exportXLSX("ordens-servico", [{ name: "Ordens de Serviço", headers: ["Indicador", "Valor"], rows }])
  }, [serviceOrdersData])

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <SectionHeader title="Ordens de Serviço" onExport={onExport} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6"><SummaryCards metrics={kpis} /></div>
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={AwardIcon} title="Ranking por Responsável" />
            <div className="space-y-2">
              {serviceOrdersData.assigneeRanking.slice(0, 5).map(a => (
                <ListItem key={a.id} icon={Users} title={a.name} description={`${a.count} OS · ${brl(a.revenue)}`} />
              ))}
              {serviceOrdersData.assigneeRanking.length === 0 && <p className="text-sm text-brand-inactive-text">Nenhum responsável encontrado.</p>}
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TrendingUpIcon} title="Evolução" />
            <DashboardLineChart data={evoData} />
          </div>
        </div>
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={ListIcon} title="Por Status" />
            <div className="flex justify-center">
              <DashboardPieChart data={statusData} totalValue={String(serviceOrdersData.metrics.total)} totalLabel="Total" innerRadius={68} outerRadius={92} className="h-[220px]" />
            </div>
          </div>
        </div>
      </div>
      <ReportTableCard
        title="Últimas OS"
        columns={[{ key: "orderNumber", header: "Número" }, { key: "title", header: "Título" }, { key: "status", header: "Status" }, { key: "total", header: "Total" }, { key: "date", header: "Data" }]}
        data={serviceOrdersData.recentOrders}
        onRowClick={() => router.push("/erp/service-orders")}
      />
    </div>
  )
}

// ─────────────────── 9. Trocas ───────────────────

function ReturnsSection({ returnsData }: { returnsData: ReturnsReportData | null }) {
  const router = useRouter()
  if (!returnsData) return <SectionPlaceholder title="Trocas e Devoluções" description="Relatórios de devoluções disponíveis com o plano Crescer." />

  const insights = generateReturnsInsights({
    returnRate: returnsData.returnRate, previousReturnRate: returnsData.previousReturnRate,
    totalRefunded: returnsData.totalRefunded, topReason: returnsData.byReason[0]?.label,
    returnCount: returnsData.returnCount,
  })

  const kpis = [
    { title: "Total Devoluções", value: String(returnsData.returnCount), trend: "" },
    { title: "Taxa Devolução", value: `${returnsData.returnRate}%`, trend: "" },
    { title: "Reembolsado", value: returnsData.totalRefundedFormatted, trend: "" },
  ]

  const reasonData = returnsData.byReason.map(r => ({ label: r.label, value: r.value }))
  const statusData = returnsData.byStatus.map(s => ({ label: s.label, value: s.value }))

  const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
    const rows = [["Total", String(returnsData.returnCount)], ["Taxa", `${returnsData.returnRate}%`]]
    if (fmt === "csv") exportCSV("relatorio-trocas", ["Indicador", "Valor"], rows)
    else await exportXLSX("relatorio-trocas", [{ name: "Trocas", headers: ["Indicador", "Valor"], rows }])
  }, [returnsData])

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <SectionHeader title="Trocas e Devoluções" onExport={onExport} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6"><SummaryCards metrics={kpis} /></div>
        <div className="lg:col-span-6"><InsightsCard insights={insights} /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TagIcon} title="Por Motivo" />
            <div className="flex justify-center">
              <DashboardPieChart data={reasonData} totalValue={String(returnsData.returnCount)} totalLabel="Devoluções" innerRadius={68} outerRadius={92} className="h-[220px]" />
            </div>
          </div>
        </div>
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={ListIcon} title="Por Status" />
            <div className="flex justify-center">
              <DashboardPieChart data={statusData} totalValue={String(returnsData.byStatus.reduce((a: any, s: any) => a + s.value, 0))} totalLabel="Total" innerRadius={68} outerRadius={92} className="h-[220px]" />
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-12">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TrendingUpIcon} title="Evolução das Devoluções" />
            <DashboardBarChart data={returnsData.returnEvolution.map(e => ({ label: e.label, value: e.value }))} />
          </div>
        </div>
      </div>
      {returnsData.topReturnedProducts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
          <div className="lg:col-span-6">
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
              <CardHeader icon={PackageIcon} title="Produtos Mais Devolvidos" />
              <div className="space-y-2">
                {returnsData.topReturnedProducts.slice(0, 8).map((p, i) => (
                  <ListItem key={i} icon={ReturnIcon} title={p.productName} description={`${p.count}x devolvido · ${p.totalQuantity} un.`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <ReportTableCard
        title="Últimas Devoluções"
        columns={[{ key: "customer", header: "Cliente" }, { key: "reason", header: "Motivo" }, { key: "amount", header: "Valor" }, { key: "status", header: "Status" }, { key: "date", header: "Data" }]}
        data={returnsData.recentReturns}
        onRowClick={() => router.push("/erp/returns")}
      />
    </div>
  )
}

// ─────────────────── 10. Marketing ───────────────────

function MarketingSection({ marketingData }: { marketingData: MarketingReportData | null }) {
  const router = useRouter()
  if (!marketingData) return <SectionPlaceholder title="Marketing" description="Ative o módulo de vendas para visualizar relatórios de marketing." />

  const insights = generateMarketingInsights({
    totalCoupons: marketingData.couponStats.total, couponUsageRate: marketingData.couponStats.usageRate,
    revenueBySource: Object.fromEntries(marketingData.revenueBySource.map(s => [s.label, s.value])),
    topSource: marketingData.topSource, topSourcePercent: marketingData.topSourcePercent,
  })

  const kpis = [
    { title: "Faturamento", value: marketingData.totalRevenueFormatted, trend: "" },
    { title: "Top Canal", value: marketingData.topSource, trend: `${marketingData.topSourcePercent}% do total` },
    { title: "Cupons", value: String(marketingData.couponStats.total), trend: "" },
    { title: "Uso Cupons", value: `${marketingData.couponStats.usageRate}%`, trend: "" },
    ...(marketingData.campaigns.length > 0 ? [{ title: "Campanhas", value: String(marketingData.campaigns.filter(c => c.isActive).length), trend: `de ${marketingData.campaigns.length}` }] : []),
  ]

  const sourceData = marketingData.revenueBySource.map(s => ({ label: s.label, value: s.value }))
  const evoData = marketingData.evolution.map(d => ({ label: d.label, value: d.online + d.presencial + d.outros }))

  const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
    const rows = [["Faturamento", marketingData.totalRevenueFormatted], ["Top Canal", marketingData.topSource]]
    if (fmt === "csv") exportCSV("relatorio-marketing", ["Indicador", "Valor"], rows)
    else await exportXLSX("relatorio-marketing", [{ name: "Marketing", headers: ["Indicador", "Valor"], rows }])
  }, [marketingData])

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <SectionHeader title="Relatório de Marketing" onExport={onExport} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6"><SummaryCards metrics={kpis} /></div>
        <div className="lg:col-span-6"><InsightsCard insights={insights} /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TagIcon} title="Faturamento por Canal" />
            <div className="flex justify-center">
              <DashboardPieChart data={sourceData} totalValue={marketingData.totalRevenueFormatted} totalLabel="Total" innerRadius={68} outerRadius={92} className="h-[220px]" />
            </div>
          </div>
        </div>
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TrendingUpIcon} title="Evolução" />
            <DashboardLineChart data={evoData} />
          </div>
        </div>
      </div>
      {marketingData.topCoupons.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
          <div className="lg:col-span-6">
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
              <CardHeader icon={TagIcon} title="Cupons Mais Usados" />
              <div className="space-y-2">
                {marketingData.topCoupons.slice(0, 6).map(c => (
                  <ListItem key={c.id} icon={ShoppingBagIcon} title={c.code} description={`${c.usageCount} usos · ${c.discountType === "percentage" ? `${c.discountValue}%` : brl(c.discountValue)}`} />
                ))}
              </div>
            </div>
          </div>
          <div className="lg:col-span-6">
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
              <CardHeader icon={MegaphoneIcon} title="Campanhas" />
              <div className="space-y-2">
                {marketingData.campaigns.slice(0, 6).map(c => (
                  <ListItem key={c.id} icon={c.isActive ? StarIcon : CalendarIcon} title={c.name} description={c.isActive ? "Ativa" : "Inativa"} />
                ))}
                {marketingData.campaigns.length === 0 && <p className="text-sm text-brand-inactive-text">Nenhuma campanha cadastrada.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────── 11. Produtividade ───────────────────

function ProductivitySection({ productivityData, goalData }: { productivityData: ProductivityReportData | null; goalData: GoalReportData | null }) {
  const router = useRouter()
  if (!productivityData) return <SectionPlaceholder title="Produtividade" description="Ative o módulo de serviços." />

  const insights = generateProductivityInsights({
    topStaffName: productivityData.staffRanking[0]?.label, topStaffRevenue: productivityData.staffRanking[0]?.revenue,
    staffCount: productivityData.staffRanking.length, totalRevenue: productivityData.metrics.totalRevenue,
  })

  const kpis = [
    { title: "Atendimentos", value: String(productivityData.metrics.totalAppointments), trend: "" },
    { title: "Receita", value: productivityData.metrics.totalRevenueFormatted, trend: "" },
    { title: "Ticket Médio", value: brl(productivityData.metrics.avgTicketPerStaff), trend: "" },
    { title: "Tempo Médio", value: `${productivityData.metrics.avgDuration}min`, trend: "" },
    { title: "Comparecimento", value: `${productivityData.metrics.attendanceRate}%`, trend: "" },
    ...(goalData && goalData.totalCount > 0 ? [{ title: "Metas", value: `${goalData.achievedCount}/${goalData.totalCount}`, trend: `${goalData.overallProgress}%` }] : []),
  ]

  const evoData = productivityData.dailyEvolution.map(d => ({ label: d.label, value: d.atendimentos, secondary: d.receita }))

  const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
    const rows = [["Atendimentos", String(productivityData.metrics.totalAppointments)], ["Receita", productivityData.metrics.totalRevenueFormatted]]
    if (fmt === "csv") exportCSV("relatorio-produtividade", ["Indicador", "Valor"], rows)
    else await exportXLSX("relatorio-produtividade", [{ name: "Produtividade", headers: ["Indicador", "Valor"], rows }])
  }, [productivityData])

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <SectionHeader title="Relatório de Produtividade" onExport={onExport} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6"><SummaryCards metrics={kpis} /></div>
        <div className="lg:col-span-6"><InsightsCard insights={insights} /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={TrendingUpIcon} title="Atendimentos por Dia" />
            <DashboardLineChart data={evoData} />
          </div>
        </div>
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
            <CardHeader icon={StarIcon} title="Ranking da Equipe" />
            <div className="space-y-2">
              {productivityData.staffRanking.slice(0, 5).map(s => (
                <ListItem key={s.id} icon={AwardIcon} title={s.label} description={`${s.appointments} atendimentos · Ticket médio: R$ ${s.ticketMedio}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
      {goalData && goalData.totalCount > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
          <div className="lg:col-span-12">
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
              <CardHeader icon={TargetIcon} title="Progresso das Metas" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {goalData.goals.slice(0, 6).map(g => (
                  <div key={g.id} className="bg-brand-bg dark:bg-dark-elevated rounded-[16px] p-4 border border-brand-border dark:border-dark-border">
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{g.name}</p>
                    <p className="text-xs text-brand-inactive-text mt-1">Meta: {g.targetFormatted}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-2 bg-brand-border dark:bg-dark-border rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${g.achieved ? "bg-brand-green" : g.progressPct >= 80 ? "bg-[#d97706]" : "bg-brand-dark dark:bg-dark-heading"}`} style={{ width: `${Math.min(g.progressPct, 100)}%` }} />
                      </div>
                      <span className={`text-[13px] font-bold ${g.achieved ? "text-brand-green" : "text-brand-dark dark:text-dark-heading"}`}>{g.progressPct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────── Placeholder ───────────────────

function SectionPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-8 border border-brand-border dark:border-dark-border">
      <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-3">{title}</h3>
      <p className="text-sm text-brand-inactive-text dark:text-dark-body">{description}</p>
    </div>
  )
}
