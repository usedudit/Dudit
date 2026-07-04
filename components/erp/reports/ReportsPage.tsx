"use client"

import React, { useState, useMemo } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/reusable"
import { ProductsTab } from "@/components/erp/dashboard/widgets/ProductsTab"
import { ServicesTab } from "@/components/erp/dashboard/widgets/ServicesTab"
import { FinancialTab } from "@/components/erp/dashboard/widgets/FinancialTab"
import { OperationsTab } from "@/components/erp/dashboard/widgets/OperationsTab"
import {
  GridIcon,
  AnalyticsIcon,
  PackageIcon,
  WrenchIcon,
  TruckIcon,
  FileTextIcon,
  MoneyIcon,
  Users,
  MegaphoneIcon,
  AwardIcon,
  ReturnIcon,
} from "@/lib/icons"
import {
  ReportMetricCard,
  ReportChartCard,
  ReportTableCard,
  ReportRankingCard,
  ReportComparisonCard,
  ReportInsightCard,
} from "./widgets"
import type {
  ProductsDashboardData,
  ServicesDashboardData,
  FinancialDashboardData,
} from "@/lib/data/dashboard"
import type {
  SalesReportData,
  CustomerReportData,
  ReturnsReportData,
  DeliveryReportData,
  MarketingReportData,
  ProductivityReportData,
} from "@/lib/data/reports"
import type { Period } from "@/lib/period-types"
import {
  generateSalesInsights,
  generateProductsInsights,
  generateServicesInsights,
  generateFinancialInsights,
  generateCustomerInsights,
  generateMarketingInsights,
  generateReturnsInsights,
  generateDeliveryInsights,
  generateProductivityInsights,
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
}

function useAvailableTabs(props: ReportsPageProps): TabDefinition[] {
  const { sells, productsData, servicesData, financialData, deliveryData } = props
  const sellsProducts = sells.includes("products")
  const sellsServices = sells.includes("services")

  return useMemo(() => {
    return REPORT_TABS.filter((tab) => {
      switch (tab.id) {
        case "produtos":
        case "vendas":
        case "marketing":
          return sellsProducts && productsData !== null
        case "servicos":
        case "ordens-servico":
          return sellsServices && servicesData !== null
        case "entregas":
          return deliveryData !== null
        case "financeiro":
          return financialData !== null
        case "clientes":
          return props.customerData !== null
        case "produtividade":
          return props.productivityData !== null
        case "trocas":
          return props.returnsData !== null
        default:
          return true
      }
    })
  }, [sellsProducts, sellsServices, productsData, servicesData, financialData, deliveryData, props.customerData, props.productivityData, props.returnsData])
}

export function ReportsPage(props: ReportsPageProps) {
  const availableTabs = useAvailableTabs(props)
  const initialTab = availableTabs.length > 0 ? availableTabs[0].id : ""
  const [activeTab, setActiveTab] = useState<string>(initialTab)

  if (availableTabs.length === 0) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-center">
        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
          Nenhum relatório disponível para seu perfil.
        </span>
      </div>
    )
  }

  return (
    <Tabs defaultValue={initialTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="mb-8">
        {availableTabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} icon={tab.icon}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="visao-geral">
        <GeneralOverviewSection {...props} />
      </TabsContent>

      <TabsContent value="vendas">
        <SalesSection {...props} />
      </TabsContent>

      {props.productsData && (
        <TabsContent value="produtos">
          <ProductsSection productsData={props.productsData} />
        </TabsContent>
      )}

      {props.servicesData && (
        <TabsContent value="servicos">
          <ServicesTab data={props.servicesData} />
        </TabsContent>
      )}

      {props.deliveryData && (
        <TabsContent value="entregas">
          <DeliveriesSection deliveryData={props.deliveryData} />
        </TabsContent>
      )}

      <TabsContent value="ordens-servico">
        <ServiceOrdersSection {...props} />
      </TabsContent>

      {props.financialData && (
        <TabsContent value="financeiro">
          <FinancialTab data={props.financialData} />
        </TabsContent>
      )}

      <TabsContent value="clientes">
        <CustomersSection {...props} />
      </TabsContent>

      <TabsContent value="marketing">
        <MarketingSection {...props} />
      </TabsContent>

      <TabsContent value="produtividade">
        <ProductivitySection {...props} />
      </TabsContent>

      <TabsContent value="trocas">
        <ReturnsSection {...props} />
      </TabsContent>
    </Tabs>
  )
}

function SectionPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-8 border border-brand-border dark:border-dark-border">
      <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-3">{title}</h3>
      <p className="text-sm text-brand-inactive-text dark:text-dark-body">{description}</p>
    </div>
  )
}

function InsightRow({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ReportInsightCard insights={insights.slice(0, 4)} title="" />
    </div>
  )
}

function GeneralOverviewSection(props: ReportsPageProps) {
  const allInsights: Insight[] = [
    ...(props.salesData ? generateSalesInsights({
      revenue: props.salesData.metrics.revenue,
      previousRevenue: 0,
      orderCount: props.salesData.metrics.orderCount,
      previousOrderCount: 0,
      ticketMedio: props.salesData.metrics.ticketMedio,
      previousTicketMedio: 0,
    }) : []),
    ...(props.productsData ? generateProductsInsights({
      totalProducts: Number(props.productsData.metrics.find(m => m.title.includes("ativos"))?.value || 0),
      outOfStock: Number(props.productsData.metrics.find(m => m.title.includes("sem estoque"))?.value || 0),
      lowStock: Number(props.productsData.metrics.find(m => m.title.includes("baixo"))?.value || 0),
      idleProductCount: (props.productsData.idleProducts || []).length,
    }) : []),
    ...(props.servicesData ? generateServicesInsights({
      todayAppointments: Number(props.servicesData.metrics.find(m => m.title.includes("hoje"))?.value || 0),
      cancelledCount: Number(props.servicesData.metrics.find(m => m.title.includes("Cancelados"))?.value || 0),
      totalAppointments: 0,
      attendanceRate: Number(props.servicesData.metrics.find(m => m.title.includes("Comparecimento"))?.value?.replace("%", "") || 0),
      topStaffName: props.servicesData.staffRows[0]?.title,
      topStaffRevenue: parseFloat(String(props.servicesData.staffRows[0]?.value || "0").replace(/[^\d,.-]/g, "").replace(",", ".")),
    }) : []),
  ]

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <InsightRow insights={allInsights} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {props.salesData && (
          <ReportMetricCard data={{ title: "Receita", value: props.salesData.metrics.revenueFormatted, trend: props.salesData.metrics.revenueTrend, tone: "green" }} />
        )}
        {props.salesData && (
          <ReportMetricCard data={{ title: "Pedidos", value: String(props.salesData.metrics.orderCount), trend: props.salesData.metrics.orderTrend, tone: "blue" }} />
        )}
        {props.salesData && (
          <ReportMetricCard data={{ title: "Ticket Médio", value: props.salesData.metrics.ticketFormatted, trend: props.salesData.metrics.ticketTrend, tone: "default" }} />
        )}
        {props.productsData && (
          <ReportMetricCard data={{
            title: "Estoque Crítico",
            value: String((props.productsData.criticalStock || []).length),
            tone: (props.productsData.criticalStock || []).length > 0 ? "red" : "green",
          }} />
        )}
      </div>

      <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Indicadores Rápidos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {props.financialData && (
            <div className="p-4 bg-brand-green-light/30 dark:bg-dark-border/20 rounded-[16px]">
              <div className="text-[13px] font-semibold text-brand-inactive-text">Saldo atual</div>
              <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-1">
                {props.financialData.metrics.find(m => m.title.includes("Saldo"))?.value || "-"}
              </div>
            </div>
          )}
          {props.customerData && (
            <div className="p-4 bg-brand-green-light/30 dark:bg-dark-border/20 rounded-[16px]">
              <div className="text-[13px] font-semibold text-brand-inactive-text">Clientes ativos</div>
              <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-1">
                {props.customerData.activeCustomers}
              </div>
            </div>
          )}
          {props.marketingData && (
            <div className="p-4 bg-brand-green-light/30 dark:bg-dark-border/20 rounded-[16px]">
              <div className="text-[13px] font-semibold text-brand-inactive-text">Top canal</div>
              <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-1">
                {props.marketingData.topSource}
              </div>
              <div className="text-xs text-brand-inactive-text mt-1">{props.marketingData.topSourcePercent}% do faturamento</div>
            </div>
          )}
          {props.deliveryData && (
            <div className="p-4 bg-brand-green-light/30 dark:bg-dark-border/20 rounded-[16px]">
              <div className="text-[13px] font-semibold text-brand-inactive-text">Entregas no prazo</div>
              <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-1">
                {props.deliveryData.metrics.onTimeRate}%
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SalesSection({ salesData, sells }: { salesData: SalesReportData | null; sells: string[] }) {
  if (!salesData) {
    return <SectionPlaceholder title="Vendas" description="Ative o módulo de produtos para visualizar relatórios de vendas." />
  }

  const insights = generateSalesInsights({
    revenue: salesData.metrics.revenue,
    previousRevenue: 0,
    orderCount: salesData.metrics.orderCount,
    previousOrderCount: 0,
    ticketMedio: salesData.metrics.ticketMedio,
    previousTicketMedio: 0,
  })

  const paymentLabels: Record<string, string> = {
    credit: "Crédito", debit: "Débito", cash: "Dinheiro", pix: "Pix",
    credit_card: "Cartão Crédito", debit_card: "Cartão Débito", money: "Dinheiro",
    transfer: "Transferência", bank_transfer: "Transferência", boleto: "Boleto",
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <InsightRow insights={insights} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <ReportMetricCard data={{ title: "Receita", value: salesData.metrics.revenueFormatted, trend: salesData.metrics.revenueTrend, tone: "green" }} />
        <ReportMetricCard data={{ title: "Pedidos", value: String(salesData.metrics.orderCount), trend: salesData.metrics.orderTrend, tone: "blue" }} />
        <ReportMetricCard data={{ title: "Ticket Médio", value: salesData.metrics.ticketFormatted, trend: salesData.metrics.ticketTrend, tone: "default" }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportChartCard
          title="Evolução de Vendas"
          subtitle="Comparativo com período anterior"
          chartType="line"
          data={salesData.evolution}
        />
        <ReportRankingCard
          title="Produtos Mais Vendidos"
          items={salesData.topProducts.map(p => ({ id: p.id, label: p.label, value: `${p.value} un.`, subtitle: p.subtitle }))}
          valueLabel="unidades"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportChartCard
          title="Vendas por Canal"
          chartType="pie"
          data={salesData.bySource}
          totalValue={salesData.metrics.revenueFormatted}
          totalLabel="Faturamento"
        />
        <ReportChartCard
          title="Vendas por Forma de Pagamento"
          chartType="pie"
          data={salesData.byPaymentMethod.map(p => ({ label: paymentLabels[p.label.toLowerCase()] || p.label, value: p.value }))}
          totalValue={salesData.metrics.revenueFormatted}
          totalLabel="Faturamento"
        />
      </div>
    </div>
  )
}

function ProductsSection({ productsData }: { productsData: ProductsDashboardData }) {
  const insights = generateProductsInsights({
    totalProducts: Number(productsData.metrics.find(m => m.title.includes("ativos"))?.value || 0),
    outOfStock: Number(productsData.metrics.find(m => m.title.includes("sem estoque"))?.value || 0),
    lowStock: Number(productsData.metrics.find(m => m.title.includes("baixo"))?.value || 0),
    idleProductCount: (productsData.idleProducts || []).length,
    topProductName: productsData.topProducts[0]?.title,
    topProductSales: parseFloat(String(productsData.topProducts[0]?.value?.replace(" un.", "") || "0")),
    topProductPreviousSales: 0,
  })

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <InsightRow insights={insights} />
      <ProductsTab data={productsData} />
    </div>
  )
}

function ServiceOrdersSection({ servicesData }: { servicesData: ServicesDashboardData | null }) {
  if (!servicesData) {
    return <SectionPlaceholder title="Ordens de Serviço" description="Ative o módulo de serviços para acompanhar as ordens de serviço." />
  }

  const todayAppts = servicesData.todayAppointments || []

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {servicesData.metrics.slice(0, 6).map((m, i) => (
          <ReportMetricCard key={i} data={{ title: m.title, value: m.value, subtitle: m.detail, tone: m.tone }} />
        ))}
      </div>

      {todayAppts.length > 0 && (
        <ReportTableCard
          title="Ordens de Serviço de Hoje"
          columns={[
            { key: "title", header: "Cliente" },
            { key: "subtitle", header: "Serviço" },
            { key: "meta", header: "Horário" },
            { key: "value", header: "Profissional" },
          ]}
          data={todayAppts.slice(0, 8).map(a => ({ id: a.id, title: a.title, subtitle: a.subtitle, meta: a.meta, value: a.value }))}
        />
      )}
    </div>
  )
}

function DeliveriesSection({ deliveryData }: { deliveryData: DeliveryReportData }) {
  const insights = generateDeliveryInsights({
    totalDeliveries: deliveryData.metrics.total,
    lateCount: deliveryData.metrics.late,
    avgTimeMinutes: deliveryData.metrics.avgTimeMinutes,
    previousAvgTimeMinutes: deliveryData.metrics.previousAvgTimeMinutes,
    onTimeRate: deliveryData.metrics.onTimeRate,
  })

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <InsightRow insights={insights} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <ReportMetricCard data={{ title: "Total", value: String(deliveryData.metrics.total), tone: "default" }} />
        <ReportMetricCard data={{ title: "Pendentes", value: String(deliveryData.metrics.pending), tone: deliveryData.metrics.pending > 0 ? "orange" : "green" }} />
        <ReportMetricCard data={{ title: "Atrasadas", value: String(deliveryData.metrics.late), tone: deliveryData.metrics.late > 0 ? "red" : "green" }} />
        <ReportMetricCard data={{ title: "No prazo", value: `${deliveryData.metrics.onTimeRate}%`, tone: deliveryData.metrics.onTimeRate >= 80 ? "green" : "orange" }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportChartCard title="Entregas por Período" chartType="line" data={deliveryData.evolution} />
        <ReportChartCard title="Situação das Entregas" chartType="pie" data={deliveryData.byStatus} totalValue={String(deliveryData.metrics.total)} totalLabel="Total" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportTableCard
          title="Últimas Entregas"
          columns={[
            { key: "id", header: "ID", render: (v: string) => v.slice(0, 8) },
            { key: "status", header: "Status" },
            { key: "date", header: "Data" },
            { key: "duration", header: "Duração" },
          ]}
          data={deliveryData.recentDeliveries}
        />
        <ReportComparisonCard
          title="Tempo de Entrega"
          currentPeriodLabel="Atual"
          previousPeriodLabel="Anterior"
          items={[
            { label: "Tempo médio", current: `${deliveryData.metrics.avgTimeMinutes}min`, previous: `${deliveryData.metrics.previousAvgTimeMinutes}min`, format: "string", trend: deliveryData.metrics.avgTimeMinutes <= deliveryData.metrics.previousAvgTimeMinutes ? "down" : "up" },
            { label: "Taxa no prazo", current: `${deliveryData.metrics.onTimeRate}%`, previous: 0, format: "percent", trend: deliveryData.metrics.onTimeRate >= 80 ? "up" : "down" },
          ]}
        />
      </div>
    </div>
  )
}

function CustomersSection({ customerData }: { customerData: CustomerReportData | null }) {
  if (!customerData) {
    return <SectionPlaceholder title="Clientes" description="Relatórios de clientes disponíveis com o plano Crescer." />
  }

  const insights = generateCustomerInsights({
    totalCustomers: customerData.totalCustomers,
    newCustomers: customerData.newCustomers,
    activeCustomers: customerData.activeCustomers,
    avgTicket: customerData.avgTicket,
    previousAvgTicket: customerData.previousAvgTicket,
    topCustomerName: customerData.topCustomers[0]?.label,
    topCustomerRevenue: parseFloat(String(customerData.topCustomers[0]?.value || "0").replace(/[^\d,.-]/g, "").replace(",", ".")),
  })

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <InsightRow insights={insights} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <ReportMetricCard data={{ title: "Total de Clientes", value: String(customerData.totalCustomers), tone: "blue" }} />
        <ReportMetricCard data={{ title: "Clientes Ativos", value: String(customerData.activeCustomers), subtitle: "compraram no período", tone: "green" }} />
        <ReportMetricCard data={{ title: "Novos Clientes", value: String(customerData.newCustomers), subtitle: "no período", tone: "green" }} />
        <ReportMetricCard data={{ title: "Ticket Médio", value: customerData.avgTicketFormatted, tone: "default" }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportRankingCard
          title="Top Clientes por Receita"
          items={customerData.topCustomers.map(c => ({
            id: c.id,
            label: c.label,
            value: c.value,
            subtitle: c.subtitle,
          }))}
        />
        <ReportChartCard
          title="Clientes por Período"
          subtitle="Ativos vs Novos"
          chartType="line"
          data={customerData.customerEvolution.map(d => ({
            label: d.label,
            value: d.ativos,
            secondary: d.novos,
          }))}
        />
      </div>
    </div>
  )
}

function MarketingSection({ marketingData }: { marketingData: MarketingReportData | null }) {
  if (!marketingData) {
    return <SectionPlaceholder title="Marketing" description="Ative o módulo de vendas para visualizar relatórios de marketing." />
  }

  const insights = generateMarketingInsights({
    totalCoupons: marketingData.couponStats.total,
    couponUsageRate: marketingData.couponStats.usageRate,
    revenueBySource: Object.fromEntries(marketingData.revenueBySource.map(s => [s.label, s.value])),
    topSource: marketingData.topSource,
    topSourcePercent: marketingData.topSourcePercent,
  })

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <InsightRow insights={insights} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <ReportMetricCard data={{ title: "Faturamento Total", value: marketingData.totalRevenueFormatted, tone: "green" }} />
        <ReportMetricCard data={{ title: "Principal Canal", value: marketingData.topSource, subtitle: `${marketingData.topSourcePercent}% do total`, tone: "blue" }} />
        <ReportMetricCard data={{ title: "Cupons Criados", value: String(marketingData.couponStats.total), tone: "default" }} />
        <ReportMetricCard data={{ title: "Uso de Cupons", value: `${marketingData.couponStats.usageRate}%`, tone: marketingData.couponStats.usageRate > 30 ? "orange" : "green" }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportChartCard title="Faturamento por Canal" chartType="pie" data={marketingData.revenueBySource} totalValue={marketingData.totalRevenueFormatted} totalLabel="Total" />
        <ReportChartCard
          title="Evolução por Canal"
          subtitle="Online vs Presencial"
          chartType="line"
          data={marketingData.evolution.map(d => ({ label: d.label, value: d.online, secondary: d.presencial }))}
        />
      </div>
    </div>
  )
}

function ProductivitySection({ productivityData }: { productivityData: ProductivityReportData | null }) {
  if (!productivityData) {
    return <SectionPlaceholder title="Produtividade" description="Ative o módulo de serviços para acompanhar a produtividade da equipe." />
  }

  const insights = generateProductivityInsights({
    topStaffName: productivityData.staffRanking[0]?.label,
    topStaffRevenue: productivityData.staffRanking[0]?.revenue,
    staffCount: productivityData.staffRanking.length,
    totalRevenue: productivityData.metrics.totalRevenue,
  })

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <InsightRow insights={insights} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <ReportMetricCard data={{ title: "Atendimentos", value: String(productivityData.metrics.totalAppointments), tone: "blue" }} />
        <ReportMetricCard data={{ title: "Receita", value: productivityData.metrics.totalRevenueFormatted, tone: "green" }} />
        <ReportMetricCard data={{ title: "Tempo Médio", value: `${productivityData.metrics.avgDuration}min`, tone: "default" }} />
        <ReportMetricCard data={{ title: "Comparecimento", value: `${productivityData.metrics.attendanceRate}%`, tone: productivityData.metrics.attendanceRate >= 80 ? "green" : "orange" }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportRankingCard
          title="Ranking da Equipe"
          items={productivityData.staffRanking.map(s => ({
            id: s.id,
            label: s.label,
            value: s.value,
            subtitle: `${s.appointments} atendimentos · ${s.cancelled} cancelamentos`,
          }))}
        />
        <ReportRankingCard
          title="Serviços mais Realizados"
          items={productivityData.serviceRanking.map(s => ({
            id: s.id,
            label: s.label,
            value: s.value,
          }))}
        />
      </div>

      <ReportChartCard
        title="Atendimentos por Dia"
        chartType="line"
        data={productivityData.dailyEvolution.map(d => ({ label: d.label, value: d.atendimentos, secondary: d.receita }))}
      />
    </div>
  )
}

function ReturnsSection({ returnsData }: { returnsData: ReturnsReportData | null }) {
  if (!returnsData) {
    return <SectionPlaceholder title="Trocas e Devoluções" description="Relatórios de devoluções disponíveis com o plano Crescer." />
  }

  const totalReturns = returnsData.byStatus.reduce((a, s) => a + s.value, 0)
  const insights = generateReturnsInsights({
    returnRate: returnsData.returnRate,
    previousReturnRate: returnsData.previousReturnRate,
    totalRefunded: returnsData.totalRefunded,
    topReason: returnsData.byReason[0]?.label,
    returnCount: returnsData.returnCount,
  })

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <InsightRow insights={insights} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <ReportMetricCard data={{ title: "Total Devoluções", value: String(returnsData.returnCount), tone: returnsData.returnCount > 0 ? "orange" : "green" }} />
        <ReportMetricCard data={{ title: "Taxa de Devolução", value: `${returnsData.returnRate}%`, tone: returnsData.returnRate > 10 ? "red" : "default" }} />
        <ReportMetricCard data={{ title: "Total Reembolsado", value: returnsData.totalRefundedFormatted, tone: "red" }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportChartCard title="Por Motivo" chartType="pie" data={returnsData.byReason} totalValue={String(returnsData.returnCount)} totalLabel="Devoluções" />
        <ReportChartCard title="Por Status" chartType="pie" data={returnsData.byStatus} totalValue={String(totalReturns)} totalLabel="Total" />
      </div>

      <ReportTableCard
        title="Últimas Devoluções"
        columns={[
          { key: "customer", header: "Cliente" },
          { key: "reason", header: "Motivo" },
          { key: "amount", header: "Valor" },
          { key: "status", header: "Status" },
          { key: "date", header: "Data" },
        ]}
        data={returnsData.recentReturns}
      />
    </div>
  )
}
