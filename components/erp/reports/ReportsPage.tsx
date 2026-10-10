"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsList, TabsTrigger, TabsContent, Button, ListItem, FormDropdown, Badge } from "@/components/reusable"
import { SummaryCards } from "@/components/erp/dashboard/LeftColumn"
import { InsightsRegister } from "@/components/erp/dashboard/InsightsRegister"
import { useDashboard } from "@/components/erp/dashboard/DashboardContext"
import {
    DashboardLineChart,
    DashboardBarChart,
    DashboardDonutChart,
    HorizontalBarRankingList,
    CHART_COLORS_VIVID,
    CHART_COLORS_CATEGORY,
} from "@/components/erp/dashboard/charts/DashboardCharts"
import { exportCSV, exportXLSX } from "@/lib/utils/export-report"
import { formatCurrency as brl, formatQuantityWithUnit } from "@/lib/utils"
import { hasMinimumPlan, type PlanTierSlug } from "@/lib/subscription/plan-tier"
import {
    AnalyticsIcon, PackageIcon, WrenchIcon, TruckIcon, FileTextIcon,
    MoneyIcon, Users, MegaphoneIcon, AwardIcon, ReturnIcon,
    ShoppingBagIcon, TagIcon, TrendingUpIcon, CreditCardIcon,
    ListIcon, ClockIcon, CalendarIcon, TargetIcon, BoxIcon, ExportFileIcon,
    AlertCircleIcon, HistoryIcon, ShoppingCartIcon,
    CheckCircleIcon, StarIcon, RepeatIcon,
} from "@/lib/icons"
import { ReportListCard, ReportRankingCard, FinancialCalendarCard } from "./widgets"
import type { ProductsDashboardData, ServicesDashboardData, FinancialDashboardData } from "@/lib/data/dashboard"
import type {
    SalesReportData, CustomerReportData, ReturnsReportData,
    DeliveryReportData, MarketingReportData, ProductivityReportData,
    ServiceOrderReportData, GoalReportData, SubscriptionReportData,
    AppointmentsReportData,
} from "@/lib/data/reports"
import type { Period } from "@/lib/period-types"
import { SERVICE_ORDER_STATUS_META, type ServiceOrderStatus } from "@/lib/types/service-order"
import { getDeliveryStatusMeta, getDeliveryStatusIcon } from "@/lib/orders/status"
import {
    generateSalesInsights, generateProductsInsights, generateServicesInsights,
    generateFinancialInsights, generateCustomerInsights, generateMarketingInsights,
    generateReturnsInsights, generateDeliveryInsights, generateProductivityInsights,
    generateAppointmentsInsights,
} from "./insights"

type TabId = "vendas" | "produtos" | "servicos" | "entregas" | "ordens-servico" | "financeiro" | "clientes" | "marketing" | "produtividade" | "trocas" | "agendamentos"

interface TabDefinition {
    id: TabId
    label: string
    icon: React.ElementType
}

const REPORT_TABS: TabDefinition[] = [
    { id: "vendas", label: "Vendas", icon: AnalyticsIcon },
    { id: "produtos", label: "Produtos", icon: PackageIcon },
    { id: "servicos", label: "Serviços", icon: WrenchIcon },
    { id: "agendamentos", label: "Agendamentos", icon: CalendarIcon },
    { id: "entregas", label: "Entregas", icon: TruckIcon },
    { id: "ordens-servico", label: "Ordens de Serviço", icon: FileTextIcon },
    { id: "financeiro", label: "Financeiro", icon: MoneyIcon },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "marketing", label: "Marketing", icon: MegaphoneIcon },
    { id: "produtividade", label: "Produtividade", icon: AwardIcon },
    { id: "trocas", label: "Trocas/Devoluções", icon: ReturnIcon },
]

/** Minimum plan required for each report tab */
const TAB_MINIMUM_PLAN: Record<TabId, PlanTierSlug> = {
    vendas: "crescer",
    produtos: "crescer",
    financeiro: "crescer",
    clientes: "crescer",
    entregas: "crescer",
    servicos: "escalar",
    agendamentos: "escalar",
    "ordens-servico": "escalar",
    marketing: "escalar",
    produtividade: "escalar",
    trocas: "escalar",
}

interface ReportsPageProps {
    sells?: string[]
    activeResources?: string[]
    period: Period
    planSlug: string
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
    appointmentsData: AppointmentsReportData | null
    goalData: GoalReportData | null
    subscriptionData: SubscriptionReportData | null
    stockValue: number
}

function useAvailableTabs(props: ReportsPageProps): TabDefinition[] {
    const { sells, activeResources, productsData, servicesData, financialData, deliveryData, planSlug } = props
    const resourcesList = activeResources || sells || ["products", "services"]
    const sellsProducts = resourcesList.includes("products")
    const sellsServices = resourcesList.includes("services")
    return useMemo(() => REPORT_TABS.filter(tab => {
        if (!hasMinimumPlan(planSlug, TAB_MINIMUM_PLAN[tab.id])) return false
        switch (tab.id) {
            case "produtos": case "vendas": case "marketing": return sellsProducts && productsData !== null
            case "servicos": return sellsServices && servicesData !== null
            case "agendamentos": return sellsServices && props.appointmentsData !== null
            case "ordens-servico": return props.serviceOrdersData !== null
            case "entregas": return deliveryData !== null
            case "financeiro": return financialData !== null
            case "clientes": return props.customerData !== null
            case "produtividade": return props.productivityData !== null
            case "trocas": return props.returnsData !== null
            default: return true
        }
    }), [sellsProducts, sellsServices, productsData, servicesData, financialData, deliveryData, props.customerData, props.productivityData, props.returnsData, props.serviceOrdersData, props.appointmentsData, planSlug])
}

const INSIGHT_COLORS: Record<string, "green" | "red" | "orange" | "blue" | "gray" | "yellow" | "purple"> = {
    positive: "green", negative: "red", warning: "orange", info: "blue", neutral: "gray",
}

/**
 * Standard Card Header:
 * Places the icon & title on the left, and legend items / action on the top-right in desktop,
 * and neatly below the title (above chart) in mobile/tablet.
 */
function CardHeader({
    icon: Icon,
    title,
    subtitle,
    legendItems,
    action,
}: {
    icon?: React.ElementType
    title: string
    subtitle?: string
    legendItems?: Array<{ label: string; color: string }>
    action?: React.ReactNode
}) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div className="flex items-center space-x-3">
                {Icon && (
                    <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                        <Icon size={18} className="text-brand-dark dark:text-dark-heading" />
                    </div>
                )}
                <div>
                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading leading-tight">{title}</h3>
                    {subtitle && (
                        <p className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body mt-0.5">{subtitle}</p>
                    )}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-3.5 sm:self-center">
                {legendItems && legendItems.length > 0 && (
                    <>
                        {legendItems.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                                <span className="text-[12px] font-bold text-brand-inactive-text dark:text-dark-body">
                                    {item.label}
                                </span>
                            </div>
                        ))}
                    </>
                )}
                {action && action}
            </div>
        </div>
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

function PlanUpgradeCTA({ tabId, currentPlan }: { tabId: TabId; currentPlan: string }) {
    const requiredPlan = TAB_MINIMUM_PLAN[tabId]
    const tab = REPORT_TABS.find(t => t.id === tabId)
    const label = requiredPlan === "escalar" ? "Escalar" : "Crescer"

    return (
        <div className="bg-white dark:bg-dark-surface rounded-[24px] p-8 border border-brand-border dark:border-dark-border flex flex-col items-center justify-center text-center min-h-[300px]">
            <div className="w-16 h-16 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center mb-4">
                <StarIcon size={28} className="text-brand-green" />
            </div>
            <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-2">
                {tab?.label} — Plano {label}
            </h3>
            <p className="text-sm text-brand-inactive-text dark:text-dark-body max-w-md mb-6">
                Este relatório está disponível no plano <strong>{label}</strong>.
                {requiredPlan === "escalar" && currentPlan === "crescer"
                    ? " Faça upgrade para acessar relatórios avançados."
                    : " Faça upgrade para acessar estatísticas do seu negócio."}
            </p>
        </div>
    )
}

export function ReportsPage(props: ReportsPageProps) {
    const availableTabs = useAvailableTabs(props)
    const initialTab = availableTabs.length > 0 ? availableTabs[0].id : ""
    const [, setActiveTab] = useState<string>(initialTab)

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
            <TabsContent value="vendas"><SalesSection {...props} productsData={props.productsData} /></TabsContent>
            {props.productsData && <TabsContent value="produtos"><ProductsSection productsData={props.productsData} stockValue={props.stockValue} returnsData={props.returnsData} salesData={props.salesData} /></TabsContent>}
            {props.servicesData && <TabsContent value="servicos"><ServicesSection servicesData={props.servicesData} /></TabsContent>}
            {props.appointmentsData && <TabsContent value="agendamentos"><AppointmentsSection appointmentsData={props.appointmentsData} /></TabsContent>}
            {props.deliveryData && <TabsContent value="entregas"><DeliveriesSection {...props} /></TabsContent>}
            {props.serviceOrdersData && <TabsContent value="ordens-servico"><ServiceOrdersSection {...props} /></TabsContent>}
            {props.financialData && <TabsContent value="financeiro"><FinancialSection financialData={props.financialData} /></TabsContent>}
            <TabsContent value="clientes"><CustomersSection {...props} /></TabsContent>
            <TabsContent value="marketing"><MarketingSection {...props} /></TabsContent>
            <TabsContent value="produtividade"><ProductivitySection productivityData={props.productivityData} goalData={props.goalData} /></TabsContent>
            <TabsContent value="trocas"><ReturnsSection {...props} /></TabsContent>
        </Tabs>
    )
}

// ─────────────────────────────────────────────────────────────
// 1. ABA DE VENDAS
// ─────────────────────────────────────────────────────────────
function SalesSection({ salesData, productsData }: { salesData: SalesReportData | null; productsData?: ProductsDashboardData | null; period: Period }) {
    const { setExportHandler } = useDashboard()
    const [channelView, setChannelView] = useState<"pedidos" | "dinheiro">("pedidos")

    const insights = useMemo(() => {
        if (!salesData) return []
        return generateSalesInsights({
            revenue: salesData.metrics.revenue, previousRevenue: salesData.metrics.previousRevenue,
            orderCount: salesData.metrics.orderCount, previousOrderCount: salesData.metrics.previousOrderCount,
            ticketMedio: salesData.metrics.ticketMedio, previousTicketMedio: salesData.metrics.previousTicketMedio,
        })
    }, [salesData])

    const mappedInsights = useMemo(() => insights.map(ins => ({
        message: ins.message,
        color: INSIGHT_COLORS[ins.tone] || "blue"
    })), [insights])

    const kpis = useMemo(() => {
        if (!salesData) return []
        return [
            { title: "Receita", value: salesData.metrics.revenueFormatted, trend: salesData.metrics.revenueTrend, icon: MoneyIcon },
            { title: "Ticket Médio", value: salesData.metrics.ticketFormatted, trend: salesData.metrics.ticketTrend, icon: CreditCardIcon },
            { title: "Pedidos", value: String(salesData.metrics.orderCount), trend: salesData.metrics.orderTrend, icon: ShoppingCartIcon },
            { title: "Itens Vendidos", value: String(salesData.metrics.itemsSold), trend: "", icon: PackageIcon },
        ]
    }, [salesData])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        if (!salesData) return
        const headers = ["Indicador", "Valor"]
        const rows = [["Receita", salesData.metrics.revenueFormatted], ["Pedidos", String(salesData.metrics.orderCount)]]
        if (fmt === "csv") exportCSV("relatorio-vendas", headers, rows)
        else await exportXLSX("relatorio-vendas", [{ name: "Vendas", headers, rows }])
    }, [salesData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    if (!salesData) return <SectionPlaceholder title="Vendas" description="Ative o módulo de produtos para visualizar relatórios de vendas." />

    const evoData = salesData.evolution.map(e => ({ label: e.label, value: e.value, secondary: e.secondary }))
    const paymentData = salesData.byPaymentMethod.map(p => ({ label: p.label, value: p.value }))

    const channelOptions = [
        { value: "pedidos", label: "Pedidos" },
        { value: "dinheiro", label: "Receita" },
    ]

    const channelChartData = channelView === "dinheiro"
        ? salesData.bySource.map(s => ({ label: s.label, value: s.value, fill: CHART_COLORS_CATEGORY[salesData.bySource.indexOf(s) % CHART_COLORS_CATEGORY.length] }))
        : salesData.ordersBySource.map(s => ({ label: s.label, value: s.value, fill: CHART_COLORS_CATEGORY[salesData.ordersBySource.indexOf(s) % CHART_COLORS_CATEGORY.length] }))

    const channelTotalValue = channelView === "dinheiro"
        ? salesData.metrics.revenueFormatted
        : String(salesData.metrics.orderCount)
    const channelTotalLabel = channelView === "dinheiro" ? "Receita" : "Pedidos"
    const channelFormat: "currency" | "number" = channelView === "dinheiro" ? "currency" : "number"

    const combinedItems = [
        ...salesData.topProducts.map(p => ({ label: p.label, value: p.value })),
        ...(salesData.topServices || []).map(s => ({ label: s.label, value: s.count })),
    ].sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 5)

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            {/* Row 1: KPI Horizontal */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12">
                    <SummaryCards metrics={kpis} variant="horizontal" />
                </div>
            </div>

            {/* Row 2: Evolução de Vendas (8) + Canal (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={TrendingUpIcon}
                            title="Evolução de Vendas"
                            legendItems={[{ label: "Este Período", color: "#059669" }, { label: "Período Anterior", color: "#94a3b8" }]}
                        />
                        <DashboardLineChart data={evoData} format="currency" />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={TagIcon}
                            title="Vendas por Origem"
                            action={
                                <FormDropdown
                                    options={channelOptions}
                                    value={channelView}
                                    setValue={(v) => setChannelView(v as "pedidos" | "dinheiro")}
                                    width="w-[140px]"
                                />
                            }
                        />
                        <DashboardDonutChart
                            data={channelChartData}
                            totalValue={channelTotalValue}
                            totalLabel={channelTotalLabel}
                            colors={CHART_COLORS_CATEGORY}
                            format={channelFormat}
                        />
                    </div>
                </div>
            </div>

            {/* Row 3: Pedidos por Hora (8) + Itens Mais Vendidos (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={ClockIcon}
                            title="Pedidos por Hora"
                            legendItems={[{ label: "Volume de Pedidos", color: "#059669" }]}
                        />
                        <DashboardBarChart data={salesData.ordersByHour.map(h => ({ label: h.label, value: h.value }))} colors={["#059669"]} legendLabels={{ value: "Volume de Pedidos" }} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={ShoppingBagIcon} title="Itens Mais Vendidos" />
                        <HorizontalBarRankingList items={combinedItems} colors={CHART_COLORS_VIVID} maxItems={5} format="quantity" />
                    </div>
                </div>
            </div>

            {/* Row 4: 3 Cards Iguais (4 + 4 + 4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={CreditCardIcon} title="Formas de Pagamento" />
                        <DashboardDonutChart
                            data={paymentData}
                            totalValue={salesData.metrics.revenueFormatted}
                            totalLabel="Faturamento"
                            colors={CHART_COLORS_CATEGORY}
                            format="currency"
                        />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TagIcon} title="Principais Categorias" legendItems={[{ label: "Receita", color: "#059669" }]} />
                        <DashboardBarChart
                            data={(productsData?.categorySales || salesData.topProducts || []).slice(0, 6).map((p, i) => ({
                                label: p.label || (p as any).title || "",
                                value: Number(p.value || 0),
                                fill: CHART_COLORS_VIVID[i % CHART_COLORS_VIVID.length],
                            }))}
                            colors={CHART_COLORS_VIVID}
                            format="currency"
                            height="h-[200px]"
                            legendLabels={{ value: "Receita" }}
                        />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Maior Margem"
                        items={salesData.topMarginProducts.slice(0, 6).map(p => ({ id: p.id, label: p.label, value: `${p.margin}%` }))}
                        variant="compact"
                        icon={AwardIcon}
                        className="h-full"
                    />
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// 2. ABA DE PRODUTOS
// ─────────────────────────────────────────────────────────────
function ProductsSection({ productsData, stockValue, returnsData, salesData }: { productsData: ProductsDashboardData | null; stockValue: number; returnsData: ReturnsReportData | null; salesData: SalesReportData | null }) {
    const { setExportHandler } = useDashboard()
    const insights = useMemo(() => {
        if (!productsData) return []
        return generateProductsInsights({
            totalProducts: Number(productsData.metrics.find((m: any) => m.title.includes("ativos"))?.value || 0),
            outOfStock: Number(productsData.metrics.find((m: any) => m.title.includes("sem estoque"))?.value || 0),
            lowStock: Number(productsData.metrics.find((m: any) => m.title.includes("baixo"))?.value || 0),
            idleProductCount: (productsData.idleProducts || []).length,
            topProductName: productsData.topProducts[0]?.title,
            topProductSales: Number(productsData.topProducts[0]?.value ?? 0),
            topProductPreviousSales: 0,
        })
    }, [productsData])

    const mappedInsights = useMemo(() => insights.map(ins => ({
        message: ins.message,
        color: INSIGHT_COLORS[ins.tone] || "blue"
    })), [insights])

    const kpis = useMemo(() => {
        if (!productsData) return []
        return [
            ...(stockValue > 0 ? [{ title: "Valor em Estoque", value: brl(stockValue), trend: "", icon: MoneyIcon }] : []),
            ...productsData.metrics.slice(3, 6).map((m: any) => ({
                title: m.title,
                value: m.value,
                trend: m.detail || "",
                icon: m.title.includes("estoque") ? AlertCircleIcon : PackageIcon,
            })),
        ]
    }, [stockValue, productsData])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        if (!productsData) return
        const rows = kpis.map((m: any) => [m.title, m.value])
        if (fmt === "csv") exportCSV("relatorio-produtos", ["Indicador", "Valor"], rows)
        else await exportXLSX("relatorio-produtos", [{ name: "Produtos", headers: ["Indicador", "Valor"], rows }])
    }, [kpis, productsData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    if (!productsData) return <SectionPlaceholder title="Produtos" description="Ative o módulo de produtos." />

    const catData = (productsData.categorySales || []).map(c => ({ label: c.label, value: Number(c.value) }))
    const evoData = (productsData.salesEvolution || []).map(e => ({ label: e.label, value: Number(e.value), secondary: Number(e.secondary || 0) }))
    const returnEvoData = (returnsData?.returnEvolution || []).map(r => ({ label: r.label, value: r.value }))
    const idleData = (productsData.idleProducts || []).map(p => ({ id: p.id, label: p.title, value: p.value || "R$ 0,00", subtitle: p.subtitle || "Sem categoria" }))

    const allLabels = [...new Set([...evoData.map(e => e.label), ...returnEvoData.map(r => r.label)])]
    const mergedEvolution = allLabels.map(label => {
        const sold = evoData.find(e => e.label === label)
        const ret = returnEvoData.find(r => r.label === label)
        return { label, vendidos: sold?.value || 0, devolvidos: ret?.value || 0 }
    })

    const vendidoTotal = evoData.reduce((s, e) => s + e.value, 0)
    const devolvidoTotal = returnEvoData.reduce((s, e) => s + e.value, 0)
    const faturamentoData = [
        { label: "Valor Vendido", value: vendidoTotal },
        { label: "Valor Devolvido", value: devolvidoTotal },
        { label: "Líquido Faturado", value: Math.max(vendidoTotal - devolvidoTotal, 0) },
    ]

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            {/* Row 1: KPI Horizontal */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12">
                    <SummaryCards metrics={kpis} variant="horizontal" />
                </div>
            </div>

            {/* Row 2: Evolução de Vendas e Devoluções (8) + Categorias (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={TrendingUpIcon}
                            title="Evolução de Vendas e Devoluções"
                            legendItems={[{ label: "Produtos Vendidos", color: "#059669" }, { label: "Produtos Devolvidos", color: "#ef4444" }]}
                        />
                        <DashboardLineChart data={mergedEvolution} colors={["#059669", "#ef4444"]} format="currency" legendLabels={{ vendidos: "Produtos Vendidos", devolvidos: "Produtos Devolvidos" }} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={ShoppingBagIcon} title="Vendas por Categoria" />
                        <DashboardDonutChart
                            data={catData}
                            totalValue={String(productsData.metrics.find((m: any) => m.title.includes("ativos"))?.value || 0)}
                            totalLabel="Produtos"
                            colors={CHART_COLORS_CATEGORY}
                            format="currency"
                        />
                    </div>
                </div>
            </div>

            {/* Row 3: Faturamento vs Devoluções (8) + Produtos Mais Vendidos (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={MoneyIcon}
                            title="Faturamento vs Devoluções"
                            legendItems={[{ label: "Vendido", color: "#059669" }, { label: "Devolvido", color: "#ef4444" }, { label: "Líquido", color: "#0284c7" }]}
                        />
                        <DashboardBarChart data={faturamentoData} colors={["#059669", "#ef4444", "#0284c7"]} format="currency" />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={AwardIcon} title="Mais Vendidos" />
                        <HorizontalBarRankingList
                            items={productsData.topProducts.slice(0, 5).map(p => ({ label: p.title, value: Number(String(p.value).replace(/[^\d]/g, "")) || 0 }))}
                            colors={CHART_COLORS_VIVID}
                        />
                    </div>
                </div>
            </div>

            {/* Row 4: 3 Cards Iguais (4 + 4 + 4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Produtos Parados (sem venda)"
                        items={idleData.slice(0, 6)}
                        variant="compact"
                        icon={AlertCircleIcon}
                        className="h-full"
                    />
                </div>
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Menor Estoque"
                        items={productsData.criticalStock.slice(0, 6).map(p => ({ id: p.id, label: p.title, value: Number(String(p.value).replace(/[^\d]/g, "")) || 0, subtitle: p.subtitle ?? "" }))}
                        variant="compact"
                        icon={AlertCircleIcon}
                        className="h-full"
                    />
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={TargetIcon}
                            title="Curva ABC"
                            subtitle={salesData?.abcCurve?.length ? `${salesData.abcCurve.filter(a => a.category === "A").length} prod. A · ${salesData.abcCurve.filter(a => a.category === "B").length} prod. B · ${salesData.abcCurve.filter(a => a.category === "C").length} prod. C` : undefined}
                            legendItems={[
                                { label: "Classe A (≤50%)", color: "#059669" },
                                { label: "Classe B (50-80%)", color: "#f59e0b" },
                                { label: "Classe C (>80%)", color: "#ef4444" },
                            ]}
                        />
                        <DashboardBarChart
                            data={(salesData?.abcCurve || []).slice(0, 6).map(a => ({
                                label: a.label,
                                value: a.value,
                                fill: a.category === "A" ? "#059669" : a.category === "B" ? "#f59e0b" : "#ef4444",
                            }))}
                            colors={["#059669", "#f59e0b", "#ef4444"]}
                            format="currency"
                            height="h-[200px]"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// 3. ABA DE SERVIÇOS
// ─────────────────────────────────────────────────────────────
function ServicesSection({ servicesData }: { servicesData: ServicesDashboardData }) {
    const { setExportHandler } = useDashboard()

    const parseBrl = (val?: string) => {
        if (!val) return 0
        const clean = val.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
        return Number(clean) || 0
    }

    const totalCategoryServices = (servicesData.categoryRows || []).reduce((acc, c) => acc + (Number(c.value) || 0), 0)
    const serviceChartData = (servicesData.serviceRows || []).map(s => ({ label: s.title, value: parseBrl(s.value) }))
    const todayCount = servicesData.todayAppointments?.length || 0
    const topStaffName = servicesData.staffRows?.[0]?.title
    const topStaffRevenue = parseBrl(servicesData.staffRows?.[0]?.value)

    const insights = useMemo(() => generateServicesInsights({
        todayAppointments: todayCount,
        cancelledCount: Number(servicesData.metrics.find((m: any) => m.title.includes("Cancelados"))?.value || 0),
        totalAppointments: Number(servicesData.metrics.find((m: any) => m.title.includes("Total de agendamentos"))?.value || 0),
        attendanceRate: Number(String(servicesData.metrics.find((m: any) => m.title.includes("Comparecimento"))?.value || "100").replace("%", "")),
        topStaffName,
        topStaffRevenue,
    }), [servicesData, todayCount, topStaffName, topStaffRevenue])

    const mappedInsights = useMemo(() => insights.map(ins => ({
        message: ins.message,
        color: INSIGHT_COLORS[ins.tone] || "blue"
    })), [insights])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        const rows = [["Atendimentos", String(servicesData.metrics[0]?.value || "0")]]
        if (fmt === "csv") exportCSV("servicos", ["Indicador", "Valor"], rows)
        else await exportXLSX("servicos", [{ name: "Serviços", headers: ["Indicador", "Valor"], rows }])
    }, [servicesData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            {/* Row 1: KPI Horizontal */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12"><SummaryCards metrics={servicesData.metrics} variant="horizontal" /></div>
            </div>

            {/* Row 2: Faturamento por Serviço (8) + Categorias (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={WrenchIcon}
                            title="Faturamento por Serviço"
                            legendItems={[{ label: "Receita", color: "#059669" }]}
                        />
                        <DashboardLineChart data={serviceChartData} legendLabels={{ value: "Receita" }} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TagIcon} title="Distribuição por Categoria" />
                        <DashboardDonutChart
                            data={(servicesData.categoryRows || []).map(c => ({ label: c.title, value: Number(c.value || 0) }))}
                            totalValue={String(totalCategoryServices)}
                            totalLabel="Serviços"
                            colors={CHART_COLORS_CATEGORY}
                            format="currency"
                        />
                    </div>
                </div>
            </div>

            {/* Row 3: Agendamentos de Hoje (8) + Serviços Mais Realizados (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={CalendarIcon} title="Agendamentos de Hoje" />
                        {todayCount === 0 ? (
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body py-10 text-center">Nenhum agendamento para hoje.</p>
                        ) : (
                            <div className="space-y-2 my-auto">
                                {(servicesData.todayAppointments || []).slice(0, 5).map(a => (
                                    <div key={a.id} className="flex items-center justify-between py-2.5 border-b border-brand-border dark:border-dark-border last:border-0">
                                        <div>
                                            <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{a.title}</p>
                                            <p className="text-[11px] text-brand-inactive-text dark:text-dark-body">{a.subtitle}{a.meta ? ` · ${a.meta}` : ""}</p>
                                        </div>
                                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{a.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={ShoppingBagIcon} title="Receita por Serviço" />
                        <HorizontalBarRankingList
                            items={(servicesData.serviceRows || []).slice(0, 5).map(s => ({ label: s.title, value: parseBrl(s.value) }))}
                            colors={CHART_COLORS_VIVID}
                            format="currency"
                        />
                    </div>
                </div>
            </div>

            {/* Row 4: 3 Cards Iguais (4 + 4 + 4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Ranking da Equipe"
                        items={(servicesData.staffRows || []).slice(0, 6).map(s => ({ id: s.id, label: s.title, value: s.value || "0", subtitle: s.subtitle }))}
                        variant="compact"
                        icon={AwardIcon}
                        className="h-full"
                    />
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TagIcon} title="Distribuição por Categoria" />
                        <DashboardDonutChart
                            data={(servicesData.categoryRows || []).slice(0, 5).map(c => ({ label: c.title, value: Number(c.value || 0) }))}
                            totalValue={String(totalCategoryServices)}
                            totalLabel="Atendimentos"
                            colors={CHART_COLORS_CATEGORY}
                        />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={MoneyIcon} title="Receita por Serviço" />
                        <HorizontalBarRankingList
                            items={(servicesData.serviceRows || []).slice(0, 5).map(s => ({ label: s.title, value: parseBrl(s.value) }))}
                            colors={CHART_COLORS_VIVID}
                            format="currency"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// 3b. ABA DE AGENDAMENTOS
// ─────────────────────────────────────────────────────────────
function AppointmentsSection({ appointmentsData }: { appointmentsData: AppointmentsReportData }) {
    const { setExportHandler } = useDashboard()

    const parseBrl = (val?: string) => {
        if (!val) return 0
        const clean = val.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
        return Number(clean) || 0
    }

    const totalAppts = appointmentsData.metrics.find((m: any) => m.title.includes("Total") || m.title.includes("total"))
    const totalCount = Number(totalAppts?.value || 0)
    const cancelledMetric = appointmentsData.metrics.find((m: any) => m.title.includes("Cancel") || m.title.includes("cancel"))
    const cancelledCount = Number(cancelledMetric?.value || 0)
    const noShowMetric = appointmentsData.metrics.find((m: any) => m.title.includes("Ausên") || m.title.includes("ausên") || m.title.includes("No-show"))
    const noShowCount = Number(noShowMetric?.value || 0)
    const topService = appointmentsData.servicePopularity?.[0]

    const insights = useMemo(() => generateAppointmentsInsights({
        totalAppointments: totalCount,
        completedCount: totalCount - cancelledCount - noShowCount,
        cancelledCount,
        noShowCount,
        repeatCustomerRate: appointmentsData.repeatCustomerRate || 0,
        avgDuration: appointmentsData.avgDuration || 0,
        topServiceName: topService?.label,
        topServiceCount: topService?.value,
        totalRevenue: appointmentsData.metrics.reduce((sum: number, m: any) => {
            if (m.title.includes("Receita") || m.title.includes("receita") || m.title.includes("Faturamento")) return sum + parseBrl(m.value)
            return sum
        }, 0),
    }), [appointmentsData, totalCount, cancelledCount, noShowCount, topService])

    const mappedInsights = useMemo(() => insights.map(ins => ({
        message: ins.message,
        color: INSIGHT_COLORS[ins.tone] || "blue"
    })), [insights])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        const rows = appointmentsData.metrics.map((m: any) => [m.title, String(m.value)])
        if (fmt === "csv") exportCSV("relatorio-agendamentos", ["Indicador", "Valor"], rows)
        else await exportXLSX("relatorio-agendamentos", [{ name: "Agendamentos", headers: ["Indicador", "Valor"], rows }])
    }, [appointmentsData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    const evoData = (appointmentsData.dailyEvolution || []).map(e => ({ label: e.label, value: e.value, secondary: e.secondary }))
    const statusData = (appointmentsData.statusBreakdown || []).map(s => ({ label: s.label, value: s.value }))
    const hourlyData = (appointmentsData.hourlyDistribution || []).map(h => ({ label: h.label, value: h.value }))
    const serviceData = (appointmentsData.servicePopularity || []).map(s => ({ label: s.label, value: s.value }))

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            {/* Row 1: KPI Horizontal */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12"><SummaryCards metrics={appointmentsData.metrics} variant="horizontal" /></div>
            </div>

            {/* Row 2: Evolução Diária (8) + Status (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={CalendarIcon}
                            title="Evolução de Agendamentos"
                            legendItems={[{ label: "Este Período", color: "#059669" }, { label: "Período Anterior", color: "#94a3b8" }]}
                        />
                        <DashboardLineChart data={evoData} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TagIcon} title="Status dos Agendamentos" />
                        <DashboardDonutChart
                            data={statusData}
                            totalValue={String(totalCount)}
                            totalLabel="Agendamentos"
                            colors={CHART_COLORS_CATEGORY}
                        />
                    </div>
                </div>
            </div>

            {/* Row 3: Agendamentos por Hora (8) + Serviços Populares (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={ClockIcon}
                            title="Agendamentos por Hora"
                            legendItems={[{ label: "Volume", color: "#059669" }]}
                        />
                        <DashboardBarChart data={hourlyData} colors={["#059669"]} legendLabels={{ value: "Volume" }} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={ShoppingBagIcon} title="Serviços Mais Agendados" />
                        <HorizontalBarRankingList items={serviceData.slice(0, 5)} colors={CHART_COLORS_VIVID} format="quantity" />
                    </div>
                </div>
            </div>

            {/* Row 4: Comparecimento (4) + Equipe (4) + Recentes (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TargetIcon} title="Taxa de Comparecimento" />
                        <DashboardDonutChart
                            data={[
                                { label: "Presentes", value: appointmentsData.attendanceRate, fill: "#059669" },
                                { label: "Ausentes", value: Math.max(100 - appointmentsData.attendanceRate, 0), fill: "#ef4444" },
                            ]}
                            totalValue={`${appointmentsData.attendanceRate}%`}
                            totalLabel="Taxa"
                            colors={["#059669", "#ef4444"]}
                        />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Ranking da Equipe"
                        items={(appointmentsData.staffPerformance || []).slice(0, 6).map(s => ({ id: s.id, label: s.label, value: s.value, subtitle: `${s.appointments} atend.` }))}
                        variant="compact"
                        icon={AwardIcon}
                        className="h-full"
                    />
                </div>
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Agendamentos Recentes"
                        items={(appointmentsData.recentAppointments || []).slice(0, 6).map(a => ({ id: a.id, label: a.title, value: a.value || "", subtitle: a.subtitle }))}
                        variant="compact"
                        icon={CalendarIcon}
                        className="h-full"
                    />
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// 4. ABA DE ENTREGAS
// ─────────────────────────────────────────────────────────────
function DeliveriesSection({ deliveryData }: { deliveryData: DeliveryReportData | null }) {
    const router = useRouter()
    const { setExportHandler } = useDashboard()

    const insights = useMemo(() => {
        if (!deliveryData) return []
        return generateDeliveryInsights({
            totalDeliveries: deliveryData.metrics.total, lateCount: deliveryData.metrics.late,
            avgTimeMinutes: deliveryData.metrics.avgTimeMinutes, previousAvgTimeMinutes: deliveryData.metrics.previousAvgTimeMinutes,
            onTimeRate: deliveryData.metrics.onTimeRate,
        })
    }, [deliveryData])

    const mappedInsights = useMemo(() => insights.map(ins => ({
        message: ins.message,
        color: INSIGHT_COLORS[ins.tone] || "blue"
    })), [insights])

    const kpis = useMemo(() => {
        if (!deliveryData) return []
        return [
            { title: "Total", value: String(deliveryData.metrics.total), trend: "", icon: TruckIcon },
            { title: "Pendentes", value: String(deliveryData.metrics.pending), trend: "", icon: ClockIcon },
            { title: "Atrasadas", value: String(deliveryData.metrics.late), trend: "", icon: AlertCircleIcon },
            { title: "No Prazo", value: `${deliveryData.metrics.onTimeRate}%`, trend: "", icon: CheckCircleIcon },
        ]
    }, [deliveryData])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        if (!deliveryData) return
        const rows = [["Total", String(deliveryData.metrics.total)], ["No Prazo", `${deliveryData.metrics.onTimeRate}%`]]
        if (fmt === "csv") exportCSV("relatorio-entregas", ["Indicador", "Valor"], rows)
        else await exportXLSX("relatorio-entregas", [{ name: "Entregas", headers: ["Indicador", "Valor"], rows }])
    }, [deliveryData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    if (!deliveryData) return <SectionPlaceholder title="Entregas" description="Sem dados de entregas." />

    const evoData = deliveryData.evolution.map(e => ({ label: e.label, value: e.value, secondary: e.secondary }))
    const statusData = deliveryData.byStatus.map(s => ({ label: s.label, value: s.value }))

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            {/* Row 1: KPI Horizontal */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12"><SummaryCards metrics={kpis} variant="horizontal" /></div>
            </div>

            {/* Row 2: Entregas por Período (8) + Situação (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={TrendingUpIcon}
                            title="Entregas por Período"
                            legendItems={[{ label: "Este Período", color: "#059669" }, { label: "Período Anterior", color: "#94a3b8" }]}
                        />
                        <DashboardLineChart data={evoData} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TruckIcon} title="Situação das Entregas" />
                        <DashboardDonutChart
                            data={statusData}
                            totalValue={String(deliveryData.metrics.total)}
                            totalLabel="Total"
                            colors={CHART_COLORS_CATEGORY}
                        />
                    </div>
                </div>
            </div>

            {/* Row 3: Últimas Entregas (8) + Ranking de Entregadores (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <ReportListCard
                        title="Últimas Entregas"
                        icon={TruckIcon}
                        columns={[
                            { id: "delivery", label: "Entrega", width: "220px" },
                            { id: "deliveryPerson", label: "Entregador", width: "180px" },
                            { id: "duration", label: "Duração", width: "110px" },
                            { id: "status", label: "Status", align: "center", width: "160px" },
                        ]}
                        data={deliveryData.recentDeliveries}
                        onRowClick={(row) => router.push(`/erp/entregas?view=${row.id}`)}
                        renderCell={(colId, row) => {
                            switch (colId) {
                                case "delivery":
                                    return (
                                        <div className="flex items-center gap-3 text-left">
                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                <TruckIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                            </div>
                                            <div className="flex flex-col text-left min-w-0">
                                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[140px]">
                                                    {row.id}
                                                </span>
                                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                    {row.date}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                case "deliveryPerson":
                                    return (
                                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate max-w-[180px] block">
                                            {row.deliveryPerson || "-"}
                                        </span>
                                    )
                                case "duration":
                                    return (
                                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                            {row.duration || "-"}
                                        </span>
                                    )
                                case "status": {
                                    const meta = getDeliveryStatusMeta(row.statusKey)
                                    return (
                                        <Badge variant={meta.variant} icon={getDeliveryStatusIcon(row.statusKey)}>
                                            {meta.label}
                                        </Badge>
                                    )
                                }
                                default:
                                    return row[colId] ?? "-"
                            }
                        }}
                        className="h-full"
                    />
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={AwardIcon} title="Ranking de Entregadores" />
                        <HorizontalBarRankingList
                            items={deliveryData.deliveryPersonRanking.slice(0, 5).map(p => ({ label: p.name, value: p.deliveries }))}
                            colors={CHART_COLORS_VIVID}
                        />
                    </div>
                </div>
            </div>

            {/* Row 4: 3 Cards Iguais (4 + 4 + 4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={ClockIcon} title="Tempo Médio" />
                        <div className="my-auto text-center py-4">
                            <p className="text-[44px] font-extrabold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                {deliveryData.metrics.avgTimeMinutes}<span className="text-xl font-bold text-brand-inactive-text ml-1">min</span>
                            </p>
                            <p className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body mt-2">Duração média por entrega</p>
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TargetIcon} title="Pontualidade" />
                        <DashboardDonutChart
                            data={[
                                { label: "No Prazo", value: deliveryData.metrics.onTimeRate, fill: "#059669" },
                                { label: "Atrasadas", value: Math.max(100 - deliveryData.metrics.onTimeRate, 0), fill: "#ef4444" },
                            ]}
                            totalValue={`${deliveryData.metrics.onTimeRate}%`}
                            totalLabel="No Prazo"
                            colors={["#059669", "#ef4444"]}
                        />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={HistoryIcon} title="Comparativo de Período" />
                        <div className="space-y-4 my-auto">
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">Este período</span>
                                <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">{deliveryData.metrics.total} entregas</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">Período anterior</span>
                                <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">{deliveryData.metrics.previousAvgTimeMinutes > 0 ? `${deliveryData.metrics.previousAvgTimeMinutes} min médio` : "-"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">Tempo médio atual</span>
                                <span className="text-[15px] font-bold text-brand-green">{deliveryData.metrics.avgTimeMinutes} min</span>
                            </div>
                            {deliveryData.metrics.previousAvgTimeMinutes > 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">Variação</span>
                                    <span className={`text-[15px] font-bold ${deliveryData.metrics.avgTimeMinutes <= deliveryData.metrics.previousAvgTimeMinutes ? "text-brand-green" : "text-brand-red"}`}>
                                        {deliveryData.metrics.avgTimeMinutes <= deliveryData.metrics.previousAvgTimeMinutes ? "↓" : "↑"} {Math.abs(deliveryData.metrics.avgTimeMinutes - deliveryData.metrics.previousAvgTimeMinutes)} min
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// 5. ABA DE ORDENS DE SERVIÇO
// ─────────────────────────────────────────────────────────────
function ServiceOrdersSection({ serviceOrdersData }: { serviceOrdersData: ServiceOrderReportData | null }) {
    const router = useRouter()
    const { setExportHandler } = useDashboard()

    const kpis = useMemo(() => {
        if (!serviceOrdersData) return []
        return [
            { title: "Total OS", value: String(serviceOrdersData.metrics.total), trend: "", icon: FileTextIcon },
            { title: "Abertas", value: String(serviceOrdersData.metrics.open), trend: "", icon: ClockIcon },
            { title: "Em Andamento", value: String(serviceOrdersData.metrics.inProgress), trend: "", icon: WrenchIcon },
            { title: "Concluídas", value: String(serviceOrdersData.metrics.completed), trend: "", icon: CheckCircleIcon },
            { title: "Canceladas", value: String(serviceOrdersData.metrics.cancelled), trend: "", icon: AlertCircleIcon },
            { title: "Receita", value: serviceOrdersData.metrics.totalRevenueFormatted, trend: "", icon: MoneyIcon },
        ]
    }, [serviceOrdersData])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        if (!serviceOrdersData) return
        const rows = [["Total", String(serviceOrdersData.metrics.total)], ["Receita", serviceOrdersData.metrics.totalRevenueFormatted]]
        if (fmt === "csv") exportCSV("ordens-servico", ["Indicador", "Valor"], rows)
        else await exportXLSX("ordens-servico", [{ name: "Ordens de Serviço", headers: ["Indicador", "Valor"], rows }])
    }, [serviceOrdersData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    if (!serviceOrdersData) return <SectionPlaceholder title="Ordens de Serviço" description="Sem dados de ordens de serviço." />

    const evoData = serviceOrdersData.evolution.map(e => ({ label: e.label, value: e.value, secondary: e.secondary }))
    const statusData = serviceOrdersData.byStatus.map(s => ({ label: s.label, value: s.value }))

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            {/* Row 1: KPI Horizontal */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12"><SummaryCards metrics={kpis} variant="horizontal" /></div>
            </div>

            {/* Row 2: Evolução (8) + Por Status (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={TrendingUpIcon}
                            title="Evolução de Ordens de Serviço"
                            legendItems={[{ label: "Ordens", color: "#059669" }, { label: "Período Anterior", color: "#94a3b8" }]}
                        />
                        <DashboardLineChart data={evoData} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={ListIcon} title="OS por Status" />
                        <DashboardDonutChart
                            data={statusData}
                            totalValue={String(serviceOrdersData.metrics.total)}
                            totalLabel="Total"
                            colors={CHART_COLORS_CATEGORY}
                        />
                    </div>
                </div>
            </div>

            {/* Row 3: Últimas OS (8) + Ranking Responsável (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <ReportListCard
                        title="Últimas Ordens de Serviço"
                        icon={FileTextIcon}
                        columns={[
                            { id: "order", label: "N° OS", width: "180px" },
                            { id: "title", label: "Título", width: "250px" },
                            { id: "total", label: "Total", width: "120px" },
                            { id: "status", label: "Status", align: "center", width: "160px" },
                            { id: "actions", label: "Ações", align: "center", width: "80px" },
                        ]}
                        data={serviceOrdersData.recentOrders}
                        onRowClick={(row) => router.push(`/erp/ordens-de-servico?view=${row.id}`)}
                        renderCell={(colId, row) => {
                            switch (colId) {
                                case "order":
                                    return (
                                        <div className="flex items-center gap-3 text-left">
                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                <WrenchIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                            </div>
                                            <div className="flex flex-col text-left min-w-0">
                                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[120px]">
                                                    {row.orderNumber}
                                                </span>
                                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                    {row.date}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                case "title":
                                    return (
                                        <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate max-w-[220px] block">
                                            {row.title}
                                        </span>
                                    )
                                case "total":
                                    return (
                                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                            {row.total}
                                        </span>
                                    )
                                case "status": {
                                    const meta = SERVICE_ORDER_STATUS_META[row.statusKey as ServiceOrderStatus]
                                    return (
                                        <Badge variant={meta?.variant || "gray"}>
                                            {meta?.label || row.status}
                                        </Badge>
                                    )
                                }
                                default:
                                    return row[colId] ?? "-"
                            }
                        }}
                        className="h-full"
                    />
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={AwardIcon} title="Ranking por Responsável" />
                        <HorizontalBarRankingList
                            items={serviceOrdersData.assigneeRanking.slice(0, 5).map(a => ({ label: a.name, value: a.count }))}
                            colors={CHART_COLORS_VIVID}
                        />
                    </div>
                </div>
            </div>

            {/* Row 4: 3 Cards Iguais (4 + 4 + 4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TargetIcon} title="Taxa de Conclusão" />
                        <div className="my-auto text-center py-4">
                            <p className="text-[44px] font-extrabold text-brand-green dark:text-dark-heading leading-none">
                                {serviceOrdersData.metrics.total > 0 ? Math.round((serviceOrdersData.metrics.completed / serviceOrdersData.metrics.total) * 100) : 0}%
                            </p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-2">concluídas</p>
                            <p className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body mt-1">
                                {serviceOrdersData.metrics.completed} de {serviceOrdersData.metrics.total} OS
                            </p>
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TagIcon} title="Receita por Status" />
                        <div className="space-y-3 my-auto">
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">Abertas</span>
                                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{serviceOrdersData.metrics.open}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">Em Andamento</span>
                                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{serviceOrdersData.metrics.inProgress}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">Concluídas</span>
                                <span className="text-[13px] font-bold text-brand-green">{serviceOrdersData.metrics.completed}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">Canceladas</span>
                                <span className="text-[13px] font-bold text-brand-red">{serviceOrdersData.metrics.cancelled}</span>
                            </div>
                            <div className="flex items-center justify-between border-t border-brand-border dark:border-dark-border pt-2">
                                <span className="text-[13px] font-semibold text-brand-dark dark:text-dark-heading">Receita Total</span>
                                <span className="text-[13px] font-bold text-brand-green">{serviceOrdersData.metrics.totalRevenueFormatted}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TargetIcon} title="Faturamento por Membro" />
                        <HorizontalBarRankingList
                            items={serviceOrdersData.assigneeRanking.slice(0, 5).map(a => ({ label: a.name, value: a.revenue }))}
                            colors={CHART_COLORS_VIVID}
                            format="currency"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// 6. ABA FINANCEIRO
// ─────────────────────────────────────────────────────────────
function FinancialSection({ financialData }: { financialData: FinancialDashboardData }) {
    const { setExportHandler } = useDashboard()

    const totalExpenses = useMemo(() => {
        return (financialData.expensesByCategory || []).reduce((acc, e) => acc + Number(e.value), 0)
    }, [financialData.expensesByCategory])

    const cashflowData = useMemo(() => {
        return (financialData.cashflow || []).map(p => ({
            label: p.label,
            value: Number(p.value),
            secondary: Number(p.secondary || 0),
        }))
    }, [financialData.cashflow])

    const alertsList = useMemo(() => {
        if (financialData.alertsAndPendings && financialData.alertsAndPendings.length > 0) {
            return financialData.alertsAndPendings
        }
        return (financialData.overdueAccounts || []).map(a => ({
            id: a.id,
            title: a.title,
            subtitle: a.subtitle ? `${a.subtitle}${a.meta ? ` · ${a.meta}` : ""}` : (a.meta ? `Vencimento: ${a.meta}` : ""),
            value: a.value,
            tone: a.tone || "red",
            statusLabel: a.tone === "red" ? "Vencido" : "Próximo",
        }))
    }, [financialData.alertsAndPendings, financialData.overdueAccounts])

    const expensesByDay = useMemo(() => {
        return Object.entries(financialData.dailyMovements || {})
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-14)
            .map(([date, mov]) => ({
                label: date.slice(5, 10).split("-").reverse().join("/"),
                value: mov.expense,
            }))
    }, [financialData.dailyMovements])

    const insights = useMemo(() => generateFinancialInsights({
        balance: Number(financialData.metrics.find((m: any) => m.title.toLowerCase().includes("saldo"))?.value?.replace(/[^\d,.-]/g, "").replace(",", ".") || 0),
        receivable: 0,
        payable: 0,
        incomeTotal: Number(financialData.metrics.find((m: any) => m.title.toLowerCase().includes("receita"))?.value?.replace(/[^\d,.-]/g, "").replace(",", ".") || 0),
        expenseTotal: totalExpenses || Number(financialData.metrics.find((m: any) => m.title.toLowerCase().includes("despesa"))?.value?.replace(/[^\d,.-]/g, "").replace(",", ".") || 0),
    }), [financialData, totalExpenses])

    const mappedInsights = useMemo(() => insights.map(ins => ({
        message: ins.message,
        color: INSIGHT_COLORS[ins.tone] || "blue"
    })), [insights])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        const rows = [
            ["Receitas do mês", financialData.metrics.find((m: any) => m.title.includes("Receitas"))?.value || "R$ 0,00"],
            ["Despesas do mês", financialData.metrics.find((m: any) => m.title.includes("Despesas"))?.value || "R$ 0,00"],
            ["Resultado do mês", financialData.metrics.find((m: any) => m.title.includes("Resultado"))?.value || "R$ 0,00"],
            ["Saldo atual", financialData.metrics.find((m: any) => m.title.includes("Saldo"))?.value || "R$ 0,00"],
        ]
        if (fmt === "csv") exportCSV("financeiro", ["Indicador", "Valor"], rows)
        else await exportXLSX("financeiro", [{ name: "Financeiro", headers: ["Indicador", "Valor"], rows }])
    }, [financialData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            {/* Row 1: KPI Horizontal */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12"><SummaryCards metrics={financialData.metrics} variant="horizontal" /></div>
            </div>

            {/* Row 2: Fluxo de Caixa (8) + Saídas por Dia (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={MoneyIcon}
                            title="Fluxo de Caixa"
                            legendItems={[{ label: "Entradas", color: "#059669" }, { label: "Saídas", color: "#ef4444" }]}
                        />
                        <DashboardLineChart data={cashflowData} colors={["#059669", "#ef4444"]} format="currency" />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TagIcon} title="Saídas por Dia" />
                        <DashboardBarChart
                            data={expensesByDay}
                            colors={["#ef4444"]}
                            format="currency"
                            height="h-[260px]"
                        />
                    </div>
                </div>
            </div>

            {/* Row 3: Calendário Financeiro (8) + Alertas e Pendências (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <FinancialCalendarCard dailyMovements={financialData.dailyMovements} className="h-full" />
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={AlertCircleIcon} title="Alertas e Pendências" />
                        <div className="flex-1 space-y-2">
                            {alertsList.length === 0 ? (
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body py-8 text-center">Nenhum alerta pendente.</p>
                            ) : (
                                alertsList.slice(0, 4).map(item => {
                                    const isOverdue = item.statusLabel === "Vencido" || item.tone === "red"
                                    return (
                                        <ListItem
                                            key={item.id}
                                            left={
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isOverdue
                                                    ? "bg-rose-50 dark:bg-rose-950/40 text-rose-500"
                                                    : "bg-amber-50 dark:bg-amber-950/40 text-amber-500"
                                                    }`}>
                                                    {isOverdue ? <AlertCircleIcon size={18} /> : <ClockIcon size={18} />}
                                                </div>
                                            }
                                            title={item.title}
                                            description={item.subtitle}
                                            titleClassName="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate"
                                            descriptionClassName="text-[11px] text-brand-inactive-text dark:text-dark-body font-medium truncate"
                                            className="!border-0 !bg-transparent px-2 py-2"
                                            right={
                                                <Badge variant={isOverdue ? "red" : "orange"} icon={null}>
                                                    {item.statusLabel || (isOverdue ? "Vencido" : "Próximo")}
                                                </Badge>
                                            }
                                        />
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Row 4: Maiores Despesas (8) + Últimas Movimentações (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={TagIcon}
                            title="Maiores Despesas"
                            legendItems={[{ label: "Categoria", color: "#059669" }]}
                        />
                        <DashboardBarChart
                            data={(financialData.expensesByCategory || []).slice(0, 6).map(e => ({ label: String(e.label), value: Number(e.value) }))}
                            colors={CHART_COLORS_VIVID}
                            format="currency"
                            height="h-[260px]"
                        />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={ListIcon} title="Últimas Movimentações" />
                        <div className="flex-1 space-y-2">
                            {(financialData.latestMovements || []).slice(0, 6).map(m => (
                                <div key={m.id} className="flex items-center justify-between py-2 border-b border-brand-border dark:border-dark-border last:border-0">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.tone === "red"
                                            ? "bg-rose-50 dark:bg-rose-950/40 text-brand-red"
                                            : "bg-emerald-50 dark:bg-emerald-950/40 text-brand-green"
                                            }`}>
                                            <MoneyIcon size={15} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">{m.title}</p>
                                            <p className="text-[11px] text-brand-inactive-text dark:text-dark-body truncate">{m.subtitle}{m.meta ? ` · ${m.meta}` : ""}</p>
                                        </div>
                                    </div>
                                    <span className={`text-[13px] font-bold shrink-0 ${m.tone === "red" ? "text-brand-red" : "text-brand-green"}`}>{m.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// 7. ABA DE CLIENTES
// ─────────────────────────────────────────────────────────────
function CustomersSection({ customerData }: { customerData: CustomerReportData | null; period: Period }) {
    const { setExportHandler } = useDashboard()

    const insights = useMemo(() => {
        if (!customerData) return []
        return generateCustomerInsights({
            totalCustomers: customerData.totalCustomers, newCustomers: customerData.newCustomers, activeCustomers: customerData.activeCustomers,
            avgTicket: customerData.avgTicket, previousAvgTicket: customerData.previousAvgTicket,
            topCustomerName: customerData.topCustomers[0]?.label,
            topCustomerRevenue: parseFloat(String(customerData.topCustomers[0]?.value || "0").replace(/[^\d,]/g, "").replace(",", ".")),
        })
    }, [customerData])

    const mappedInsights = useMemo(() => insights.map(ins => ({
        message: ins.message,
        color: INSIGHT_COLORS[ins.tone] || "blue"
    })), [insights])

    const kpis = useMemo(() => {
        if (!customerData) return []
        return [
            { title: "Total", value: String(customerData.totalCustomers), trend: "", icon: Users },
            { title: "Ativos", value: String(customerData.activeCustomers), trend: "", icon: CheckCircleIcon },
            { title: "Recorrentes", value: String(customerData.recurringCustomers), trend: "", icon: RepeatIcon },
            { title: "Novos", value: String(customerData.newCustomers), trend: "", icon: TrendingUpIcon },
            { title: "Inativos 90d", value: String(customerData.inactiveCustomers), trend: "", icon: AlertCircleIcon },
            { title: "Ticket Médio", value: customerData.avgTicketFormatted, trend: "", icon: CreditCardIcon },
        ]
    }, [customerData])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        if (!customerData) return
        const rows = [["Total", String(customerData.totalCustomers)], ["Ativos", String(customerData.activeCustomers)]]
        if (fmt === "csv") exportCSV("relatorio-clientes", ["Indicador", "Valor"], rows)
        else await exportXLSX("relatorio-clientes", [{ name: "Clientes", headers: ["Indicador", "Valor"], rows }])
    }, [customerData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    if (!customerData) return <SectionPlaceholder title="Clientes" description="Relatórios de clientes disponíveis com o plano Crescer." />

    const evoData = customerData.customerEvolution.map(d => ({ label: d.label, value: d.ativos, secondary: d.novos }))
    const statusPie = [
        { label: "Ativos", value: customerData.activeCustomers, fill: "#059669" },
        { label: "Recorrentes", value: customerData.recurringCustomers, fill: "#2563eb" },
        { label: "Novos", value: customerData.newCustomers, fill: "#f59e0b" },
        { label: "Inativos 90d", value: customerData.inactiveCustomers, fill: "#94a3b8" },
    ]

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            {/* Row 1: KPI Horizontal */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12"><SummaryCards metrics={kpis} variant="horizontal" /></div>
            </div>

            {/* Row 2: Ativos vs Novos (8) + Segmentação (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={TrendingUpIcon}
                            title="Ativos vs Novos Clientes"
                            legendItems={[{ label: "Ativos", color: "#059669" }, { label: "Novos", color: "#2563eb" }]}
                        />
                        <DashboardLineChart data={evoData} colors={["#059669", "#2563eb"]} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={Users} title="Segmentação de Clientes" />
                        <DashboardDonutChart
                            data={statusPie}
                            totalValue={String(customerData.totalCustomers)}
                            totalLabel="Clientes"
                            colors={CHART_COLORS_CATEGORY}
                        />
                    </div>
                </div>
            </div>

            {/* Row 3: Frequência e Recorrência (8) + Top Clientes (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={ClockIcon} title="Frequência e Intervalo de Compras" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-auto">
                            <div className="bg-brand-gray/40 dark:bg-dark-border/20 rounded-2xl p-6 text-center border border-brand-border/60 dark:border-dark-border/60">
                                <p className="text-[36px] font-extrabold text-brand-dark dark:text-dark-heading">{customerData.purchaseFrequency}</p>
                                <p className="text-sm font-bold text-brand-inactive-text dark:text-dark-body mt-1">pedidos por cliente</p>
                            </div>
                            <div className="bg-brand-gray/40 dark:bg-dark-border/20 rounded-2xl p-6 text-center border border-brand-border/60 dark:border-dark-border/60">
                                <p className="text-[36px] font-extrabold text-brand-dark dark:text-dark-heading">{customerData.avgDaysBetweenPurchases} <span className="text-xl">dias</span></p>
                                <p className="text-sm font-bold text-brand-inactive-text dark:text-dark-body mt-1">intervalo médio entre compras</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={AwardIcon} title="Top Clientes" />
                        <HorizontalBarRankingList
                            items={customerData.topCustomers.slice(0, 5).map(c => ({ label: c.label, value: parseFloat(String(c.value || "0").replace(/[^\d,]/g, "").replace(",", ".")) || 0 }))}
                            colors={CHART_COLORS_VIVID}
                            format="currency"
                        />
                    </div>
                </div>
            </div>

            {/* Row 4: 3 Cards Iguais (4 + 4 + 4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={CreditCardIcon} title="Ticket Médio" />
                        <div className="my-auto text-center py-4">
                            <p className="text-[44px] font-extrabold text-brand-green dark:text-dark-heading leading-none">
                                {customerData.avgTicketFormatted}
                            </p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-2">por cliente ativo</p>
                            <p className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body mt-1">média de gasto no período</p>
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={Users} title="Recorrência" />
                        <div className="my-auto text-center py-4">
                            <p className="text-[44px] font-extrabold text-brand-green dark:text-dark-heading leading-none">
                                {customerData.recurringCustomers}
                            </p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-2">clientes recorrentes</p>
                            <p className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body mt-1">de {customerData.totalCustomers} cadastrados</p>
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Clientes Inativos (+90d)"
                        items={customerData.inactiveCustomerList?.slice(0, 6) || []}
                        variant="compact"
                        icon={AlertCircleIcon}
                        className="h-full"
                    />
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// 8. ABA DE MARKETING
// ─────────────────────────────────────────────────────────────
function MarketingSection({ marketingData }: { marketingData: MarketingReportData | null }) {
    const { setExportHandler } = useDashboard()

    const insights = useMemo(() => {
        if (!marketingData) return []
        return generateMarketingInsights({
            totalCoupons: marketingData.couponStats.total, couponUsageRate: marketingData.couponStats.usageRate,
            revenueBySource: Object.fromEntries(marketingData.revenueBySource.map(s => [s.label, s.value])),
            topSource: marketingData.topSource, topSourcePercent: marketingData.topSourcePercent,
        })
    }, [marketingData])

    const mappedInsights = useMemo(() => insights.map(ins => ({
        message: ins.message,
        color: INSIGHT_COLORS[ins.tone] || "blue"
    })), [insights])

    const kpis = useMemo(() => {
        if (!marketingData) return []
        return [
            { title: "Faturamento", value: marketingData.totalRevenueFormatted, trend: "", icon: MoneyIcon },
            { title: "Top Canal", value: marketingData.topSource, trend: `${marketingData.topSourcePercent}% do total`, icon: TagIcon },
            { title: "Cupons", value: String(marketingData.couponStats.total), trend: "", icon: CreditCardIcon },
            { title: "Uso Cupons", value: `${marketingData.couponStats.usageRate}%`, trend: "", icon: CheckCircleIcon },
            ...(marketingData.campaigns.length > 0 ? [{ title: "Campanhas", value: String(marketingData.campaigns.filter(c => c.isActive).length), trend: `de ${marketingData.campaigns.length}`, icon: MegaphoneIcon }] : []),
        ]
    }, [marketingData])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        if (!marketingData) return
        const rows = [["Faturamento", marketingData.totalRevenueFormatted], ["Top Canal", marketingData.topSource]]
        if (fmt === "csv") exportCSV("relatorio-marketing", ["Indicador", "Valor"], rows)
        else await exportXLSX("relatorio-marketing", [{ name: "Marketing", headers: ["Indicador", "Valor"], rows }])
    }, [marketingData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    if (!marketingData) return <SectionPlaceholder title="Marketing" description="Ative o módulo de vendas para visualizar relatórios de marketing." />

    const sourceData = marketingData.revenueBySource.map(s => ({ label: s.label, value: s.value }))
    const evoMultiLine = marketingData.evolution.map(d => ({ label: d.label, online: d.online, presencial: d.presencial, outros: d.outros }))

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            {/* Row 1: KPI Horizontal */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12"><SummaryCards metrics={kpis} variant="horizontal" /></div>
            </div>

            {/* Row 2: Evolução por Canal (8) + Faturamento Canal (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={TrendingUpIcon}
                            title="Evolução de Faturamento por Canal"
                            legendItems={[{ label: "Online", color: "#059669" }, { label: "Presencial", color: "#2563eb" }, { label: "Outros", color: "#f59e0b" }]}
                        />
                        <DashboardLineChart data={evoMultiLine} colors={["#059669", "#2563eb", "#f59e0b"]} format="currency" legendLabels={{ online: "Online", presencial: "Presencial", outros: "Outros" }} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TagIcon} title="Faturamento por Canal" />
                        <DashboardDonutChart
                            data={sourceData}
                            totalValue={marketingData.totalRevenueFormatted}
                            totalLabel="Total"
                            colors={CHART_COLORS_CATEGORY}
                            format="currency"
                        />
                    </div>
                </div>
            </div>

            {/* Row 3: Campanhas (8) + Cupons Mais Usados (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={MegaphoneIcon} title="Campanhas Ativas" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 my-auto">
                            {marketingData.campaigns.slice(0, 6).map(c => (
                                <div key={c.id} className={`rounded-2xl p-4 border ${c.isActive ? "border-brand-green/40 bg-green-50/50 dark:bg-green-900/10" : "border-brand-border dark:border-dark-border"}`}>
                                    <p className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">{c.name}</p>
                                    <p className={`text-[12px] font-bold mt-1 ${c.isActive ? "text-brand-green" : "text-brand-inactive-text"}`}>{c.isActive ? "● Ativa" : "○ Inativa"}</p>
                                </div>
                            ))}
                            {marketingData.campaigns.length === 0 && <p className="text-sm text-brand-inactive-text col-span-2 py-8 text-center">Nenhuma campanha cadastrada.</p>}
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TagIcon} title="Cupons Mais Usados" />
                        <HorizontalBarRankingList
                            items={marketingData.topCoupons.slice(0, 5).map(c => ({ label: c.code, value: c.usageCount }))}
                            colors={CHART_COLORS_VIVID}
                        />
                    </div>
                </div>
            </div>

            {/* Row 4: 3 Cards Iguais (4 + 4 + 4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Top Cupons de Desconto"
                        items={marketingData.topCoupons.slice(0, 6).map(c => ({
                            id: c.id,
                            label: c.code,
                            value: `${c.usageCount} usos`,
                            subtitle: c.discountType === "percentage" ? `${c.discountValue}%` : brl(c.discountValue),
                        }))}
                        variant="compact"
                        icon={TagIcon}
                        className="h-full"
                    />
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={MoneyIcon} title="Desconto Total" />
                        <div className="my-auto text-center py-4">
                            <p className="text-[44px] font-extrabold text-brand-green dark:text-dark-heading leading-none">
                                {marketingData.couponStats.totalDiscountFormatted}
                            </p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-2">concedido via cupons</p>
                            <p className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body mt-1">{marketingData.couponStats.used} cupons utilizados</p>
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={CreditCardIcon} title="Resumo de Cupons" />
                        <div className="space-y-3 my-auto">
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold text-brand-dark dark:text-dark-heading">Total de cupons</span>
                                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{marketingData.couponStats.total}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold text-brand-dark dark:text-dark-heading">Utilizados</span>
                                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{marketingData.couponStats.used}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold text-brand-dark dark:text-dark-heading">Taxa de uso</span>
                                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{marketingData.couponStats.usageRate}%</span>
                            </div>
                            {marketingData.couponStats.totalDiscount > 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-[13px] font-semibold text-brand-dark dark:text-dark-heading">Desconto total</span>
                                    <span className="text-[13px] font-bold text-brand-red">{marketingData.couponStats.totalDiscountFormatted}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// 9. ABA DE PRODUTIVIDADE
// ─────────────────────────────────────────────────────────────
function ProductivitySection({ productivityData, goalData }: { productivityData: ProductivityReportData | null; goalData: GoalReportData | null }) {
    const { setExportHandler } = useDashboard()

    const insights = useMemo(() => {
        if (!productivityData) return []
        return generateProductivityInsights({
            topStaffName: productivityData.staffRanking[0]?.label, topStaffRevenue: productivityData.staffRanking[0]?.revenue,
            staffCount: productivityData.staffRanking.length, totalRevenue: productivityData.metrics.totalRevenue,
        })
    }, [productivityData])

    const mappedInsights = useMemo(() => insights.map(ins => ({
        message: ins.message,
        color: INSIGHT_COLORS[ins.tone] || "blue"
    })), [insights])

    const kpis = useMemo(() => {
        if (!productivityData) return []
        return [
            { title: "Atendimentos", value: String(productivityData.metrics.totalAppointments), trend: "", icon: CalendarIcon },
            { title: "Receita", value: productivityData.metrics.totalRevenueFormatted, trend: "", icon: MoneyIcon },
            { title: "Ticket Médio", value: brl(productivityData.metrics.avgTicketPerStaff), trend: "", icon: CreditCardIcon },
            { title: "Tempo Médio", value: `${productivityData.metrics.avgDuration}min`, trend: "", icon: ClockIcon },
            { title: "Comparecimento", value: `${productivityData.metrics.attendanceRate}%`, trend: "", icon: CheckCircleIcon },
            ...(goalData && goalData.totalCount > 0 ? [{ title: "Metas", value: `${goalData.achievedCount}/${goalData.totalCount}`, trend: `${goalData.overallProgress}%`, icon: TargetIcon }] : []),
        ]
    }, [productivityData, goalData])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        if (!productivityData) return
        const rows = [["Atendimentos", String(productivityData.metrics.totalAppointments)], ["Receita", productivityData.metrics.totalRevenueFormatted]]
        if (fmt === "csv") exportCSV("relatorio-produtividade", ["Indicador", "Valor"], rows)
        else await exportXLSX("relatorio-produtividade", [{ name: "Produtividade", headers: ["Indicador", "Valor"], rows }])
    }, [productivityData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    if (!productivityData) return <SectionPlaceholder title="Produtividade" description="Ative o módulo de serviços." />

    const evoData = productivityData.dailyEvolution.map(d => ({ label: d.label, value: d.atendimentos }))
    const staffPieData = productivityData.staffRanking.map(s => ({ label: s.label, value: s.appointments }))

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            {/* Row 1: KPI Horizontal */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12"><SummaryCards metrics={kpis} variant="horizontal" /></div>
            </div>

            {/* Row 2: Atendimentos por Dia (8) + Atendimentos por Membro (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={TrendingUpIcon}
                            title="Atendimentos por Dia"
                            legendItems={[{ label: "Atendimentos", color: "#059669" }]}
                        />
                        <DashboardLineChart data={evoData} colors={["#059669"]} legendLabels={{ value: "Atendimentos" }} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={Users} title="Atendimentos por Membro" />
                        <DashboardDonutChart
                            data={staffPieData}
                            totalValue={String(productivityData.metrics.totalAppointments)}
                            totalLabel="Total"
                            colors={CHART_COLORS_CATEGORY}
                        />
                    </div>
                </div>
            </div>

            {/* Row 3: Progresso das Metas (8) + Ranking Equipe (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TargetIcon} title="Progresso das Metas" />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 my-auto">
                            {(goalData?.goals || []).slice(0, 6).map(g => {
                                const pct = Math.min(g.progressPct, 100)
                                const barColor = g.achieved ? "bg-brand-green" : pct >= 80 ? "bg-brand-orange" : pct >= 50 ? "bg-brand-blue" : "bg-brand-red"
                                const textColor = g.achieved ? "text-brand-green" : "text-brand-dark dark:text-dark-heading"
                                return (
                                    <div key={g.id} className="bg-brand-bg dark:bg-dark-elevated rounded-2xl p-4 border border-brand-border dark:border-dark-border">
                                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{g.name}</p>
                                        <p className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body mt-1">Meta: {g.targetFormatted}</p>
                                        <div className="mt-3 flex items-center gap-2">
                                            <div className="flex-1 h-2 bg-brand-border dark:bg-dark-border rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                                            </div>
                                            <span className={`text-[12px] font-bold ${textColor}`}>{g.achieved ? "100%" : `${pct}%`}</span>
                                        </div>
                                    </div>
                                )
                            })}
                            {(!goalData || goalData.goals.length === 0) && (
                                <p className="text-sm text-brand-inactive-text col-span-3 py-8 text-center">Nenhuma meta configurada no período.</p>
                            )}
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={AwardIcon} title="Ranking da Equipe" />
                        <HorizontalBarRankingList
                            items={productivityData.staffRanking.slice(0, 5).map(s => ({ label: s.label, value: s.appointments }))}
                            colors={CHART_COLORS_VIVID}
                        />
                    </div>
                </div>
            </div>

            {/* Row 4: 3 Cards Iguais (4 + 4 + 4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Top Profissionais"
                        items={productivityData.staffRanking.slice(0, 6).map(s => ({
                            id: s.id,
                            label: s.label,
                            value: `${s.appointments} atd.`,
                            subtitle: `Ticket: ${brl(s.ticketMedio || 0)}`,
                        }))}
                        variant="compact"
                        icon={AwardIcon}
                        className="h-full"
                    />
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TagIcon} title="Receita por Membro" />
                        <HorizontalBarRankingList
                            items={productivityData.staffRanking.slice(0, 5).map(s => ({ label: s.label, value: s.revenue }))}
                            colors={CHART_COLORS_VIVID}
                            format="currency"
                        />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={ShoppingBagIcon} title="Serviços Mais Realizados" />
                        <DashboardDonutChart
                            data={productivityData.serviceRanking.slice(0, 6).map(s => ({ label: s.label, value: s.count }))}
                            totalValue={String(productivityData.metrics.totalAppointments)}
                            totalLabel="Atendimentos"
                            colors={CHART_COLORS_CATEGORY}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// 10. ABA DE TROCAS E DEVOLUÇÕES
// ─────────────────────────────────────────────────────────────
function getReturnStatusMeta(status: string): { variant: "green" | "red" | "orange" | "blue" | "gray" } {
    const s = (status || "").toLowerCase()
    if (s.includes("recus") || s.includes("cancel")) return { variant: "red" }
    if (s.includes("concl") || s.includes("aprov") || s.includes("reembols") || s.includes("fechado")) return { variant: "green" }
    if (s.includes("pend") || s.includes("aguard") || s.includes("análise") || s.includes("analise") || s.includes("aberto") || s.includes("process")) return { variant: "orange" }
    if (s.includes("trânsito") || s.includes("transito")) return { variant: "blue" }
    return { variant: "gray" }
}

function ReturnsSection({ returnsData }: { returnsData: ReturnsReportData | null }) {
    const router = useRouter()
    const { setExportHandler } = useDashboard()

    const insights = useMemo(() => {
        if (!returnsData) return []
        return generateReturnsInsights({
            returnRate: returnsData.returnRate, previousReturnRate: returnsData.previousReturnRate,
            totalRefunded: returnsData.totalRefunded, topReason: returnsData.byReason[0]?.label,
            returnCount: returnsData.returnCount,
        })
    }, [returnsData])

    const mappedInsights = useMemo(() => insights.map(ins => ({
        message: ins.message,
        color: INSIGHT_COLORS[ins.tone] || "blue"
    })), [insights])

    const kpis = useMemo(() => {
        if (!returnsData) return []
        return [
            { title: "Total Devoluções", value: String(returnsData.returnCount), trend: "" },
            { title: "Taxa Devolução", value: `${returnsData.returnRate}%`, trend: "" },
            { title: "Reembolsado", value: returnsData.totalRefundedFormatted, trend: "" },
            { title: "Ticket Médio", value: brl(returnsData.returnCount > 0 ? returnsData.totalRefunded / returnsData.returnCount : 0), trend: "" },
        ]
    }, [returnsData])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        if (!returnsData) return
        const rows = [["Total", String(returnsData.returnCount)], ["Taxa", `${returnsData.returnRate}%`]]
        if (fmt === "csv") exportCSV("relatorio-trocas", ["Indicador", "Valor"], rows)
        else await exportXLSX("relatorio-trocas", [{ name: "Trocas", headers: ["Indicador", "Valor"], rows }])
    }, [returnsData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    if (!returnsData) return <SectionPlaceholder title="Trocas e Devoluções" description="Relatórios de devoluções disponíveis com o plano Crescer." />

    const reasonData = returnsData.byReason.map(r => ({ label: r.label, value: r.value }))

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            {/* Row 1: KPI Horizontal */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12"><SummaryCards metrics={kpis} variant="horizontal" /></div>
            </div>

            {/* Row 2: Evolução (8) + Por Motivo (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader
                            icon={TrendingUpIcon}
                            title="Evolução das Devoluções"
                            legendItems={[{ label: "Devoluções", color: "#ef4444" }]}
                        />
                        <DashboardBarChart data={returnsData.returnEvolution.map(e => ({ label: e.label, value: e.value }))} colors={["#ef4444"]} legendLabels={{ value: "Devoluções" }} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TagIcon} title="Devoluções por Motivo" />
                        <DashboardDonutChart
                            data={reasonData}
                            totalValue={String(returnsData.returnCount)}
                            totalLabel="Devoluções"
                            colors={CHART_COLORS_CATEGORY}
                        />
                    </div>
                </div>
            </div>

            {/* Row 3: Últimas Devoluções (8) + Produtos Mais Devolvidos (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <ReportListCard
                        title="Últimas Devoluções"
                        icon={ReturnIcon}
                        columns={[
                            { id: "return", label: "Devolução", width: "200px" },
                            { id: "customer", label: "Cliente", width: "170px" },
                            { id: "reason", label: "Motivo", width: "180px" },
                            { id: "amount", label: "Valor", width: "110px" },
                            { id: "status", label: "Status", align: "center", width: "150px" },
                        ]}
                        data={returnsData.recentReturns.slice(0, 5)}
                        onRowClick={() => router.push("/erp/devolucoes")}
                        renderCell={(colId, row) => {
                            switch (colId) {
                                case "return":
                                    return (
                                        <div className="flex items-center gap-3 text-left">
                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                <ReturnIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                            </div>
                                            <div className="flex flex-col text-left min-w-0">
                                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[120px]">
                                                    {String(row.id).slice(0, 8)}
                                                </span>
                                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                    {row.date}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                case "customer":
                                    return (
                                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate max-w-[170px] block">
                                            {row.customer || "-"}
                                        </span>
                                    )
                                case "reason":
                                    return (
                                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate max-w-[180px] block" title={row.reason}>
                                            {row.reason || "-"}
                                        </span>
                                    )
                                case "amount":
                                    return (
                                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                            {row.amount}
                                        </span>
                                    )
                                case "status": {
                                    const meta = getReturnStatusMeta(row.status)
                                    return (
                                        <Badge variant={meta.variant}>
                                            {row.status || "Pendente"}
                                        </Badge>
                                    )
                                }
                                default:
                                    return row[colId] ?? "-"
                            }
                        }}
                        className="h-full"
                    />
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={ShoppingBagIcon} title="Produtos Mais Devolvidos" />
                        <HorizontalBarRankingList
                            items={returnsData.topReturnedProducts.slice(0, 5).map(p => ({ label: p.productName, value: p.count }))}
                            colors={["#ef4444", "#f97316", "#f59e0b", "#ec4899", "#8b5cf6"]}
                        />
                    </div>
                </div>
            </div>

            {/* Row 4: 3 Cards Iguais (4 + 4 + 4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={MoneyIcon} title="Ticket Médio de Devolução" />
                        <div className="my-auto text-center py-4">
                            <p className="text-[38px] font-extrabold text-brand-red leading-none">
                                {brl(returnsData.returnCount > 0 ? returnsData.totalRefunded / returnsData.returnCount : 0)}
                            </p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-2">valor médio reembolsado</p>
                            <p className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body mt-1">{returnsData.returnCount} devoluções no período</p>
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Ranking de Itens Devolvidos"
                        items={returnsData.topReturnedProducts.slice(0, 6).map(p => ({ id: String(p.productName), label: p.productName, value: `${p.count}x`, subtitle: formatQuantityWithUnit(p.totalQuantity, (p as any).unit) }))}
                        variant="compact"
                        icon={AlertCircleIcon}
                        className="h-full"
                    />
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={MoneyIcon} title="Impacto Financeiro" />
                        <div className="my-auto text-center py-4">
                            <p className="text-[38px] font-extrabold text-brand-red leading-none">
                                {returnsData.totalRefundedFormatted}
                            </p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-2">total reembolsado</p>
                            <p className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body mt-1">Taxa de devolução: {returnsData.returnRate}%</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// 11. ABA DE ASSINATURAS
// ─────────────────────────────────────────────────────────────
function SubscriptionSection({ subscriptionData }: { subscriptionData: SubscriptionReportData | null }) {
    const { setExportHandler } = useDashboard()

    const kpis = useMemo(() => {
        if (!subscriptionData) return []
        return [
            { title: "MRR (Ativo)", value: brl(subscriptionData.mrr), trend: "" },
            { title: "ARR (Anual)", value: brl(subscriptionData.arr), trend: "" },
            { title: "LTV Médio", value: brl(subscriptionData.ltv), trend: "" },
            { title: "Renovação", value: `${subscriptionData.renewalRate.toFixed(1)}%`, trend: "" },
            { title: "Churn (30d)", value: `${subscriptionData.churnRate.toFixed(1)}%`, trend: "" },
        ]
    }, [subscriptionData])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        if (!subscriptionData) return
        const rows = [
            ["MRR Ativo", brl(subscriptionData.mrr)],
            ["ARR Anualizado", brl(subscriptionData.arr)],
            ["LTV Médio", brl(subscriptionData.ltv)],
            ["Taxa de Renovação", `${subscriptionData.renewalRate.toFixed(1)}%`],
            ["Churn Rate (30d)", `${subscriptionData.churnRate.toFixed(1)}%`],
        ]
        if (fmt === "csv") exportCSV("relatorio-assinaturas", ["Indicador", "Valor"], rows)
        else await exportXLSX("relatorio-assinaturas", [{ name: "Assinaturas", headers: ["Indicador", "Valor"], rows }])
    }, [subscriptionData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    if (!subscriptionData) return <SectionPlaceholder title="Assinaturas Recorrentes" description="Dados e métricas de assinaturas indisponíveis." />

    const statusDonutData = [
        { label: "Ativas", value: subscriptionData.activeCount, fill: "#059669" },
        { label: "Pausadas", value: subscriptionData.pausedCount, fill: "#f59e0b" },
        { label: "Pendentes", value: subscriptionData.delinquentCount, fill: "#ef4444" },
        { label: "Canceladas", value: subscriptionData.cancelledCount, fill: "#94a3b8" },
    ]

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            {/* Header controls */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Analytics de Assinaturas</h2>
                    <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Desempenho recorrente e demanda prevista de produtos.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => onExport("csv")} variant="outline" size="sm" leftIcon={<ExportFileIcon size={18} />}>Exportar CSV</Button>
                    <Button onClick={() => onExport("xlsx")} variant="outline" size="sm" leftIcon={<ExportFileIcon size={18} />}>Exportar Excel</Button>
                </div>
            </div>

            {/* Row 1: KPI Horizontal */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12"><SummaryCards metrics={kpis} variant="horizontal" /></div>
            </div>

            {/* Row 2: Previsão Financeira (8) + Status das Assinaturas (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TrendingUpIcon} title="Faturamento Previsto (Próximos 30 dias)" />
                        <div className="my-auto space-y-4 max-w-lg mx-auto w-full py-4">
                            <div className="flex justify-between items-center pb-3 border-b border-brand-border dark:border-dark-border">
                                <span className="text-sm font-bold text-brand-inactive-text dark:text-dark-body">Ciclos Previstos</span>
                                <span className="text-lg font-bold text-brand-dark dark:text-dark-heading">{subscriptionData.projectedOrders30Days} ciclos</span>
                            </div>
                            <div className="flex justify-between items-center pb-3 border-b border-brand-border dark:border-dark-border">
                                <span className="text-sm font-bold text-brand-inactive-text dark:text-dark-body">Previsão Financeira</span>
                                <span className="text-2xl font-extrabold text-brand-green">{brl(subscriptionData.projectedRevenue30Days)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TagIcon} title="Status das Assinaturas" />
                        <DashboardDonutChart
                            data={statusDonutData}
                            totalValue={String(subscriptionData.activeCount + subscriptionData.pausedCount + subscriptionData.delinquentCount + subscriptionData.cancelledCount)}
                            totalLabel="Total"
                            colors={["#059669", "#f59e0b", "#ef4444", "#94a3b8"]}
                        />
                    </div>
                </div>
            </div>

            {/* Row 3: Demanda de Produtos (8) + Créditos (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={BoxIcon} title="Demanda Prevista de Produtos (Próximos 30 dias)" />
                        {subscriptionData.projectedProducts.length === 0 ? (
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body py-10 text-center">Nenhuma demanda prevista.</p>
                        ) : (
                            <div className="overflow-x-auto my-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-brand-border dark:border-dark-border text-brand-inactive-text font-semibold">
                                            <th className="pb-3">Produto</th>
                                            <th className="pb-3 text-right">Qtd Prevista</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                        {subscriptionData.projectedProducts.slice(0, 5).map((p) => (
                                            <tr key={p.id}>
                                                <td className="py-3 font-medium text-brand-dark dark:text-dark-heading">{p.name}</td>
                                                <td className="py-3 text-right font-bold text-brand-dark dark:text-dark-heading">{formatQuantityWithUnit(p.quantity, (p as any).unit)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={CreditCardIcon} title="Uso de Créditos" />
                        <div className="grid grid-cols-2 gap-4 my-auto">
                            <div className="bg-brand-gray/40 dark:bg-dark-border/20 rounded-2xl p-4 text-center border border-brand-border/60 dark:border-dark-border/60">
                                <span className="text-xs font-bold text-brand-inactive-text dark:text-dark-body">Utilizados</span>
                                <p className="text-2xl font-extrabold text-brand-green mt-1">{subscriptionData.creditsUsedCount}</p>
                            </div>
                            <div className="bg-brand-gray/40 dark:bg-dark-border/20 rounded-2xl p-4 text-center border border-brand-border/60 dark:border-dark-border/60">
                                <span className="text-xs font-bold text-brand-inactive-text dark:text-dark-body">Expirados</span>
                                <p className="text-2xl font-extrabold text-brand-red mt-1">{subscriptionData.creditsExpiredCount}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Row 4: 3 Cards Iguais (4 + 4 + 4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TargetIcon} title="Retenção de Assinantes" />
                        <DashboardDonutChart
                            data={[
                                { label: "Renovados", value: subscriptionData.renewalRate, fill: "#059669" },
                                { label: "Churn", value: subscriptionData.churnRate, fill: "#ef4444" },
                            ]}
                            totalValue={`${subscriptionData.renewalRate.toFixed(0)}%`}
                            totalLabel="Retenção"
                            colors={["#059669", "#ef4444"]}
                        />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={BoxIcon} title="Top Produtos Assinados" />
                        <HorizontalBarRankingList
                            items={subscriptionData.projectedProducts.slice(0, 5).map(p => ({ label: p.name, value: p.quantity }))}
                            colors={CHART_COLORS_VIVID}
                        />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Resumo de Status"
                        items={[
                            { id: "1", label: "Assinaturas Ativas", value: String(subscriptionData.activeCount), trendDirection: "up", trend: "Ativo" },
                            { id: "2", label: "Em Pausa", value: String(subscriptionData.pausedCount) },
                            { id: "3", label: "Aguardando Reposição", value: String(subscriptionData.delinquentCount), trendDirection: "down", trend: "Pendente" },
                            { id: "4", label: "Canceladas", value: String(subscriptionData.cancelledCount) },
                        ]}
                        variant="compact"
                        icon={AwardIcon}
                        className="h-full"
                    />
                </div>
            </div>
        </div>
    )
}
