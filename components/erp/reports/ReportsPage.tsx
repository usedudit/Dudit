"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsList, TabsTrigger, TabsContent, InfoCard, Button } from "@/components/reusable"
import { SummaryCards } from "@/components/erp/dashboard/LeftColumn"
import { InsightsRegister } from "@/components/erp/dashboard/InsightsRegister"
import { useDashboard } from "@/components/erp/dashboard/DashboardContext"
import {
    DashboardPieChart, DashboardLineChart, DashboardBarChart, CHART_COLORS, CHART_COLORS_VIVID, CHART_COLORS_CATEGORY
} from "@/components/erp/dashboard/charts/DashboardCharts"
import { exportCSV, exportXLSX } from "@/lib/utils/export-report"

import { formatCurrency as brl } from "@/lib/utils"
import {
    AnalyticsIcon, PackageIcon, WrenchIcon, TruckIcon, FileTextIcon,
    MoneyIcon, Users, MegaphoneIcon, AwardIcon, ReturnIcon,
    ChartIcon, ShoppingBagIcon, TagIcon, TrendingUpIcon, CreditCardIcon,
    ListIcon, ClockIcon, CalendarIcon, TargetIcon, BoxIcon, ExportFileIcon,
} from "@/lib/icons"
import { ReportTableCard, ReportRankingCard } from "./widgets"
import type { ProductsDashboardData, ServicesDashboardData, FinancialDashboardData } from "@/lib/data/dashboard"
import type {
    SalesReportData, CustomerReportData, ReturnsReportData,
    DeliveryReportData, MarketingReportData, ProductivityReportData,
    ServiceOrderReportData, GoalReportData, SubscriptionReportData,
} from "@/lib/data/reports"
import type { Period } from "@/lib/period-types"
import {
    generateSalesInsights, generateProductsInsights, generateServicesInsights,
    generateFinancialInsights, generateCustomerInsights, generateMarketingInsights,
    generateReturnsInsights, generateDeliveryInsights, generateProductivityInsights,
} from "./insights"
import type { Insight } from "./insights"

type TabId = "vendas" | "produtos" | "servicos" | "entregas" | "ordens-servico" | "financeiro" | "clientes" | "marketing" | "produtividade" | "trocas" | "assinaturas"

interface TabDefinition {
    id: TabId
    label: string
    icon: React.ElementType
}

const REPORT_TABS: TabDefinition[] = [
    { id: "vendas", label: "Vendas", icon: AnalyticsIcon },
    { id: "produtos", label: "Produtos", icon: PackageIcon },
    { id: "servicos", label: "Serviços", icon: WrenchIcon },
    { id: "entregas", label: "Entregas", icon: TruckIcon },
    { id: "ordens-servico", label: "Ordens de Serviço", icon: FileTextIcon },
    { id: "financeiro", label: "Financeiro", icon: MoneyIcon },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "marketing", label: "Marketing", icon: MegaphoneIcon },
    { id: "produtividade", label: "Produtividade", icon: AwardIcon },
    { id: "trocas", label: "Trocas/Devoluções", icon: ReturnIcon },
    { id: "assinaturas", label: "Assinaturas", icon: CalendarIcon },
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
    serviceOrdersData: ServiceOrderReportData | null
    goalData: GoalReportData | null
    subscriptionData: SubscriptionReportData | null
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
            case "assinaturas": return props.subscriptionData !== null
            default: return true
        }
    }), [sellsProducts, sellsServices, productsData, servicesData, financialData, deliveryData, props.customerData, props.productivityData, props.returnsData, props.serviceOrdersData, props.subscriptionData])
}

const INSIGHT_COLORS: Record<string, "green" | "red" | "orange" | "blue" | "gray" | "yellow" | "purple"> = {
    positive: "green", negative: "red", warning: "orange", info: "blue", neutral: "gray",
}

function CardHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
    return (
        <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                <Icon size={18} className="text-brand-dark dark:text-dark-heading" />
            </div>
            <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h3>
        </div>
    )
}

// ─────────────────────────── Header ───────────────────────────

function SectionHeader({ title, onExport }: { title: string; onExport: (f: "csv" | "xlsx") => Promise<void> }) {
    return null
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
            <TabsContent value="vendas"><SalesSection {...props} /></TabsContent>
            {props.productsData && <TabsContent value="produtos"><ProductsSection productsData={props.productsData} stockValue={props.stockValue} returnsData={props.returnsData} /></TabsContent>}
            {props.servicesData && <TabsContent value="servicos"><ServicesSection servicesData={props.servicesData} /></TabsContent>}
            {props.deliveryData && <TabsContent value="entregas"><DeliveriesSection {...props} /></TabsContent>}
            {props.serviceOrdersData && <TabsContent value="ordens-servico"><ServiceOrdersSection {...props} /></TabsContent>}
            {props.financialData && <TabsContent value="financeiro"><FinancialSection financialData={props.financialData} /></TabsContent>}
            <TabsContent value="clientes"><CustomersSection {...props} /></TabsContent>
            <TabsContent value="marketing"><MarketingSection {...props} /></TabsContent>
            <TabsContent value="produtividade"><ProductivitySection productivityData={props.productivityData} goalData={props.goalData} /></TabsContent>
            <TabsContent value="trocas"><ReturnsSection {...props} /></TabsContent>
            <TabsContent value="assinaturas"><SubscriptionSection subscriptionData={props.subscriptionData} /></TabsContent>
        </Tabs>
    )
}

// ─────────────────── Vendas ───────────────────

function SalesSection({ salesData, period }: { salesData: SalesReportData | null; period: Period }) {
    const router = useRouter()
    const { setExportHandler } = useDashboard()
    if (!salesData) return <SectionPlaceholder title="Vendas" description="Ative o módulo de produtos para visualizar relatórios de vendas." />

    const insights = useMemo(() => generateSalesInsights({
        revenue: salesData.metrics.revenue, previousRevenue: 0,
        orderCount: salesData.metrics.orderCount, previousOrderCount: 0,
        ticketMedio: salesData.metrics.ticketMedio, previousTicketMedio: 0,
    }), [salesData])

    const mappedInsights = useMemo(() => {
        return insights.map(ins => ({
            message: ins.message,
            color: INSIGHT_COLORS[ins.tone] || "blue"
        }))
    }, [insights])

    const kpis = useMemo(() => [
        { title: "Receita", value: salesData.metrics.revenueFormatted, trend: salesData.metrics.revenueTrend },
        { title: "Ticket Médio", value: salesData.metrics.ticketFormatted, trend: salesData.metrics.ticketTrend },
        { title: "Pedidos", value: String(salesData.metrics.orderCount), trend: salesData.metrics.orderTrend },
        { title: "Itens Vendidos", value: String(salesData.metrics.itemsSold), trend: "" },
    ], [salesData])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        const headers = ["Indicador", "Valor"]
        const rows = [["Receita", salesData.metrics.revenueFormatted], ["Pedidos", String(salesData.metrics.orderCount)]]
        if (fmt === "csv") exportCSV("relatorio-vendas", headers, rows)
        else await exportXLSX("relatorio-vendas", [{ name: "Vendas", headers, rows }])
    }, [salesData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    const evoData = salesData.evolution.map(e => ({ label: e.label, value: e.value, secondary: e.secondary }))
    const paymentLabels: Record<string, string> = { credit: "Crédito", debit: "Débito", cash: "Dinheiro", pix: "Pix", credit_card: "Cartão Crédito", debit_card: "Cartão Débito", money: "Dinheiro", transfer: "Transferência", boleto: "Boleto" }
    const paymentData = salesData.byPaymentMethod.map(p => ({ label: paymentLabels[p.label.toLowerCase()] || p.label, value: p.value }))
    const sourceData = salesData.bySource.map(s => ({ label: s.label, value: s.value }))

    const combinedItems = [
        ...salesData.topProducts.map(p => ({ label: p.label, value: p.value })),
        ...(salesData.topServices || []).map(s => ({ label: s.label, value: s.value })),
    ].sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 10)

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12">
                    <SummaryCards metrics={kpis} variant="horizontal" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={TrendingUpIcon} title="Evolução de Vendas" />
                        <DashboardLineChart data={evoData} showLegend legendLabels={{ value: "Este Período", secondary: "Anterior" }} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={ShoppingBagIcon} title="Itens Mais Vendidos" />
                        <DashboardBarChart data={combinedItems.slice(0, 5)} colors={CHART_COLORS_VIVID} layout="horizontal" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={ClockIcon} title="Pedidos por Hora" />
                        <DashboardBarChart data={salesData.ordersByHour.map(h => ({ label: h.label, value: h.value }))} colors={[CHART_COLORS_VIVID[0]]} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={TagIcon} title="Canal" />
                        <DashboardPieChart data={sourceData} totalValue={String(salesData.metrics.orderCount)} totalLabel="Pedidos" half innerRadius={60} outerRadius={80} className="mt-4" showLegend colors={CHART_COLORS_CATEGORY} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                        <CardHeader icon={CreditCardIcon} title="Pagamento" />
                        <DashboardPieChart data={paymentData} totalValue={salesData.metrics.revenueFormatted} totalLabel="Faturamento" innerRadius={60} outerRadius={80} className="h-[190px]" showLegend colors={CHART_COLORS_CATEGORY} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                        <CardHeader icon={TargetIcon} title="Curva ABC" />
                        <DashboardBarChart data={salesData.abcCurve.map(a => ({ label: a.label, value: a.value })).slice(0, 5)} colors={["#f97316"]} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Maior Margem"
                        items={salesData.topMarginProducts.slice(0, 6).map(p => ({ id: p.id, label: p.label, value: `${p.margin}%` }))}
                        variant="compact"
                        icon={AwardIcon}
                    />
                </div>
            </div>
        </div>
    )
}

// ─────────────────── 3. Produtos ───────────────────

function ProductsSection({ productsData, stockValue, returnsData }: { productsData: ProductsDashboardData | null; stockValue: number; returnsData: ReturnsReportData | null }) {
    if (!productsData) return <SectionPlaceholder title="Produtos" description="Ative o módulo de produtos." />
    const router = useRouter()
    const { setExportHandler } = useDashboard()
    const insights = useMemo(() => generateProductsInsights({
        totalProducts: Number(productsData.metrics.find((m: any) => m.title.includes("ativos"))?.value || 0),
        outOfStock: Number(productsData.metrics.find((m: any) => m.title.includes("sem estoque"))?.value || 0),
        lowStock: Number(productsData.metrics.find((m: any) => m.title.includes("baixo"))?.value || 0),
        idleProductCount: (productsData.idleProducts || []).length,
        topProductName: productsData.topProducts[0]?.title,
        topProductSales: parseFloat(String(productsData.topProducts[0]?.value?.replace(" un.", "") || "0")),
        topProductPreviousSales: 0,
    }), [productsData])

    const mappedInsights = useMemo(() => {
        return insights.map(ins => ({
            message: ins.message,
            color: INSIGHT_COLORS[ins.tone] || "blue"
        }))
    }, [insights])

    const kpis = useMemo(() => [
        ...(stockValue > 0 ? [{ title: "Valor em Estoque", value: brl(stockValue), trend: "" }] : []),
        ...productsData.metrics.slice(3, 6).map((m: any) => ({ title: m.title, value: m.value, trend: m.detail || "" })),
    ], [stockValue, productsData])

    const catData = (productsData.categorySales || []).map(c => ({ label: c.label, value: Number(c.value) }))
    const evoData = (productsData.salesEvolution || []).map(e => ({ label: e.label, value: Number(e.value), secondary: Number(e.secondary || 0) }))
    const returnEvoData = (returnsData?.returnEvolution || []).map(r => ({ label: r.label, value: r.value }))
    const idleData = (productsData.idleProducts || []).map(p => ({ id: p.id, label: p.title, value: p.value || "0" }))

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
        { label: "Valor Faturado", value: Math.max(vendidoTotal - devolvidoTotal, 0) },
    ]

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        const rows = kpis.map((m: any) => [m.title, m.value])
        if (fmt === "csv") exportCSV("relatorio-produtos", ["Indicador", "Valor"], rows)
        else await exportXLSX("relatorio-produtos", [{ name: "Produtos", headers: ["Indicador", "Valor"], rows }])
    }, [kpis])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12">
                    <SummaryCards metrics={kpis} variant="horizontal" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-7">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={TrendingUpIcon} title="Evolução de Vendas" />
                        <DashboardLineChart data={mergedEvolution} colors={["#059669", "#ef4444"]} showLegend legendLabels={{ vendidos: "Produtos Vendidos", devolvidos: "Produtos Devolvidos" }} />
                    </div>
                </div>
                <div className="lg:col-span-5">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={CreditCardIcon} title="Faturamento por Produtos" />
                        <DashboardBarChart data={faturamentoData} colors={["#059669", "#ef4444", "#2563eb"]} showLegend />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                        <CardHeader icon={TagIcon} title="Categorias mais Vendidas" />
                        <div className="flex justify-center">
                            <DashboardPieChart data={catData} innerRadius={60} outerRadius={80} className="h-[200px]" showLegend colors={CHART_COLORS_CATEGORY} />
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Produtos mais Vendidos"
                        items={(productsData.topProducts || []).slice(0, 6).map((p: any) => ({ id: p.id, label: p.title, value: p.value }))}
                        variant="compact"
                        icon={AwardIcon}
                    />
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={BoxIcon} title="Produtos sem Movimento" />
                        {idleData.length > 0 ? (
                            <div className="space-y-3">
                                {idleData.slice(0, 6).map((item, i) => (
                                    <div key={item.id} className="flex items-center gap-3">
                                        <div className="w-7 h-7 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center shrink-0 text-xs font-bold text-brand-inactive-text">{i + 1}</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-semibold text-brand-dark dark:text-dark-heading truncate">{item.label}</p>
                                        </div>
                                        <span className="text-[13px] font-bold text-brand-inactive-text shrink-0">{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-brand-inactive-text text-center py-8">Todos os produtos tiveram movimento.</p>
                        )}
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
                        icon={PackageIcon}
                    />
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={PackageIcon} title="Produtos sem Estoque" />
                        <p className="text-[32px] font-bold text-brand-red dark:text-dark-heading">
                            {productsData.metrics.find((m: any) => m.title.includes("sem estoque"))?.value || "0"}
                        </p>
                        <p className="text-[13px] font-medium text-brand-inactive-text">precisam de reposição</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────── 5. Clientes ───────────────────

function CustomersSection({ customerData, period }: { customerData: CustomerReportData | null; period: Period }) {
    const router = useRouter()
    const { setExportHandler } = useDashboard()
    if (!customerData) return <SectionPlaceholder title="Clientes" description="Relatórios de clientes disponíveis com o plano Crescer." />

    const insights = useMemo(() => generateCustomerInsights({
        totalCustomers: customerData.totalCustomers, newCustomers: customerData.newCustomers, activeCustomers: customerData.activeCustomers,
        avgTicket: customerData.avgTicket, previousAvgTicket: customerData.previousAvgTicket,
        topCustomerName: customerData.topCustomers[0]?.label,
        topCustomerRevenue: parseFloat(String(customerData.topCustomers[0]?.value || "0").replace(/[^\d,.-]/g, "").replace(",", ".")),
    }), [customerData])

    const mappedInsights = useMemo(() => {
        return insights.map(ins => ({
            message: ins.message,
            color: INSIGHT_COLORS[ins.tone] || "blue"
        }))
    }, [insights])

    const kpis = useMemo(() => [
        { title: "Total", value: String(customerData.totalCustomers), trend: "" },
        { title: "Ativos", value: String(customerData.activeCustomers), trend: "" },
        { title: "Recorrentes", value: String(customerData.recurringCustomers), trend: "" },
        { title: "Novos", value: String(customerData.newCustomers), trend: "" },
        { title: "Inativos 90d", value: String(customerData.inactiveCustomers), trend: "" },
        { title: "Ticket Médio", value: customerData.avgTicketFormatted, trend: "" },
    ], [customerData])

    const evoData = customerData.customerEvolution.map(d => ({ label: d.label, value: d.ativos, secondary: d.novos }))

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        const rows = [["Total", String(customerData.totalCustomers)], ["Ativos", String(customerData.activeCustomers)]]
        if (fmt === "csv") exportCSV("relatorio-clientes", ["Indicador", "Valor"], rows)
        else await exportXLSX("relatorio-clientes", [{ name: "Clientes", headers: ["Indicador", "Valor"], rows }])
    }, [customerData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12">
                    <SummaryCards metrics={kpis} variant="horizontal" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={TrendingUpIcon} title="Ativos vs Novos" />
                        <DashboardLineChart data={evoData} showLegend legendLabels={{ value: "Ativos", secondary: "Novos" }} />
                    </div>
                </div>
                <div className="lg:col-span-4 flex flex-col gap-6">
                    <ReportRankingCard
                        title="Top Clientes"
                        items={customerData.topCustomers.slice(0, 5).map(c => ({ id: c.id, label: c.label, value: c.value, subtitle: c.subtitle }))}
                        variant="compact"
                        icon={AwardIcon}
                    />
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-[13px] font-bold text-brand-inactive-text">Frequência</h3>
                            <h3 className="text-[13px] font-bold text-brand-inactive-text">Intervalo</h3>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-xl font-bold text-brand-dark dark:text-dark-heading">{customerData.purchaseFrequency} ped./cliente</span>
                            <span className="text-xl font-bold text-brand-dark dark:text-dark-heading">{customerData.avgDaysBetweenPurchases} dias</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Clientes VIP"
                        items={customerData.vipCustomers.slice(0, 6).map(c => ({ id: c.id, label: c.label, value: c.value, subtitle: `${c.orders} pedidos` }))}
                        variant="compact"
                        icon={AwardIcon}
                    />
                </div>
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={Users} title="Recorrência de Clientes" />
                        <div className="flex-1 flex flex-col items-center justify-center py-6">
                            <p className="text-[48px] font-bold text-brand-green dark:text-dark-heading leading-none">{customerData.recurringCustomers}</p>
                            <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading mt-2">clientes recorrentes</p>
                            <p className="text-xs text-brand-inactive-text mt-1">de um total de {customerData.totalCustomers} clientes cadastrados</p>
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
    const { setExportHandler } = useDashboard()
    if (!deliveryData) return <SectionPlaceholder title="Entregas" description="Sem dados de entregas." />
    const insights = useMemo(() => generateDeliveryInsights({
        totalDeliveries: deliveryData.metrics.total, lateCount: deliveryData.metrics.late,
        avgTimeMinutes: deliveryData.metrics.avgTimeMinutes, previousAvgTimeMinutes: deliveryData.metrics.previousAvgTimeMinutes,
        onTimeRate: deliveryData.metrics.onTimeRate,
    }), [deliveryData])

    const mappedInsights = useMemo(() => {
        return insights.map(ins => ({
            message: ins.message,
            color: INSIGHT_COLORS[ins.tone] || "blue"
        }))
    }, [insights])

    const kpis = useMemo(() => [
        { title: "Total", value: String(deliveryData.metrics.total), trend: "" },
        { title: "Pendentes", value: String(deliveryData.metrics.pending), trend: "" },
        { title: "Atrasadas", value: String(deliveryData.metrics.late), trend: "" },
        { title: "No Prazo", value: `${deliveryData.metrics.onTimeRate}%`, trend: "" },
    ], [deliveryData])

    const evoData = deliveryData.evolution.map(e => ({ label: e.label, value: e.value, secondary: e.secondary }))
    const statusData = deliveryData.byStatus.map(s => ({ label: s.label, value: s.value }))

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        const rows = [["Total", String(deliveryData.metrics.total)], ["No Prazo", `${deliveryData.metrics.onTimeRate}%`]]
        if (fmt === "csv") exportCSV("relatorio-entregas", ["Indicador", "Valor"], rows)
        else await exportXLSX("relatorio-entregas", [{ name: "Entregas", headers: ["Indicador", "Valor"], rows }])
    }, [deliveryData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12">
                    <SummaryCards metrics={kpis} variant="horizontal" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={TrendingUpIcon} title="Entregas por Período" />
                        <DashboardLineChart data={evoData} showLegend legendLabels={{ value: "Este Período", secondary: "Anterior" }} />
                    </div>
                </div>
                <div className="lg:col-span-4 flex flex-col gap-6">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                        <CardHeader icon={TruckIcon} title="Situação" />
                        <div className="flex justify-center">
                            <DashboardPieChart data={statusData} totalValue={String(deliveryData.metrics.total)} totalLabel="Total" innerRadius={60} outerRadius={80} className="h-[180px]" showLegend colors={CHART_COLORS_CATEGORY} />
                        </div>
                    </div>
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                        <CardHeader icon={ClockIcon} title="Tempo Médio" />
                        <p className="text-[32px] font-bold text-brand-orange dark:text-dark-heading">{deliveryData.metrics.avgTimeMinutes}min</p>
                        <p className="text-[13px] font-medium text-brand-inactive-text">por entrega</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <ReportTableCard
                        title="Últimas Entregas"
                        columns={[{ key: "id", header: "ID", render: (v: string) => v.slice(0, 8) }, { key: "status", header: "Status" }, { key: "deliveryPerson", header: "Entregador" }, { key: "date", header: "Data" }, { key: "duration", header: "Duração" }]}
                        data={deliveryData.recentDeliveries}
                        icon={TruckIcon}
                    />
                </div>
                <div className="lg:col-span-4">
                    {deliveryData.deliveryPersonRanking.length > 0 ? (
                        <ReportRankingCard
                            title="Ranking de Entregadores"
                            items={deliveryData.deliveryPersonRanking.slice(0, 6).map(p => ({ id: p.id, label: p.name, value: String(p.deliveries), subtitle: "entregas" }))}
                            variant="compact"
                            icon={AwardIcon}
                        />
                    ) : (
                        <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full">
                            <div className="flex items-center space-x-3 mb-6">
                                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                    <AwardIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                </div>
                                <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Ranking de Entregadores</h3>
                            </div>
                            <div className="flex-1 flex items-center justify-center py-8">
                                <p className="text-sm text-brand-inactive-text">Sem entregadores ativos no período.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─────────────────── 8. Ordens de Serviço ───────────────────

function ServiceOrdersSection({ serviceOrdersData }: { serviceOrdersData: ServiceOrderReportData | null }) {
    const router = useRouter()
    const { setExportHandler } = useDashboard()
    if (!serviceOrdersData) return <SectionPlaceholder title="Ordens de Serviço" description="Sem dados de ordens de serviço." />

    const kpis = useMemo(() => [
        { title: "Total OS", value: String(serviceOrdersData.metrics.total), trend: "" },
        { title: "Abertas", value: String(serviceOrdersData.metrics.open), trend: "" },
        { title: "Em Andamento", value: String(serviceOrdersData.metrics.inProgress), trend: "" },
        { title: "Concluídas", value: String(serviceOrdersData.metrics.completed), trend: "" },
        { title: "Canceladas", value: String(serviceOrdersData.metrics.cancelled), trend: "" },
        { title: "Receita", value: serviceOrdersData.metrics.totalRevenueFormatted, trend: "" },
    ], [serviceOrdersData])

    const evoData = serviceOrdersData.evolution.map(e => ({ label: e.label, value: e.value, secondary: e.secondary }))
    const statusData = serviceOrdersData.byStatus.map(s => ({ label: s.label, value: s.value }))

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        const rows = [["Total", String(serviceOrdersData.metrics.total)], ["Receita", serviceOrdersData.metrics.totalRevenueFormatted]]
        if (fmt === "csv") exportCSV("ordens-servico", ["Indicador", "Valor"], rows)
        else await exportXLSX("ordens-servico", [{ name: "Ordens de Serviço", headers: ["Indicador", "Valor"], rows }])
    }, [serviceOrdersData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12">
                    <SummaryCards metrics={kpis} variant="horizontal" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={TrendingUpIcon} title="Evolução" />
                        <DashboardLineChart data={evoData} showLegend legendLabels={{ value: "Ordens", secondary: "Período Anterior" }} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Ranking por Responsável"
                        items={serviceOrdersData.assigneeRanking.slice(0, 5).map(a => ({ id: a.id, label: a.name, value: String(a.count), subtitle: `R$ ${Math.round(a.revenue).toLocaleString("pt-BR")}` }))}
                        variant="compact"
                        icon={AwardIcon}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <ReportTableCard
                        title="Últimas OS"
                        columns={[{ key: "orderNumber", header: "Número" }, { key: "title", header: "Título" }, { key: "status", header: "Status" }, { key: "total", header: "Total" }, { key: "date", header: "Data" }]}
                        data={serviceOrdersData.recentOrders}
                        onRowClick={() => router.push("/erp/service-orders")}
                        icon={ListIcon}
                    />
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={ListIcon} title="Por Status" />
                        <div className="flex justify-center flex-1 items-center">
                            <DashboardPieChart data={statusData} totalValue={String(serviceOrdersData.metrics.total)} totalLabel="Total" innerRadius={60} outerRadius={80} className="h-[200px]" showLegend colors={CHART_COLORS_CATEGORY} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────── 9. Trocas ───────────────────

function ReturnsSection({ returnsData }: { returnsData: ReturnsReportData | null }) {
    const router = useRouter()
    const { setExportHandler } = useDashboard()
    if (!returnsData) return <SectionPlaceholder title="Trocas e Devoluções" description="Relatórios de devoluções disponíveis com o plano Crescer." />

    const insights = useMemo(() => generateReturnsInsights({
        returnRate: returnsData.returnRate, previousReturnRate: returnsData.previousReturnRate,
        totalRefunded: returnsData.totalRefunded, topReason: returnsData.byReason[0]?.label,
        returnCount: returnsData.returnCount,
    }), [returnsData])

    const mappedInsights = useMemo(() => {
        return insights.map(ins => ({
            message: ins.message,
            color: INSIGHT_COLORS[ins.tone] || "blue"
        }))
    }, [insights])

    const kpis = useMemo(() => [
        { title: "Total Devoluções", value: String(returnsData.returnCount), trend: "" },
        { title: "Taxa Devolução", value: `${returnsData.returnRate}%`, trend: "" },
        { title: "Reembolsado", value: returnsData.totalRefundedFormatted, trend: "" },
    ], [returnsData])

    const reasonData = returnsData.byReason.map(r => ({ label: r.label, value: r.value }))
    const statusData = returnsData.byStatus.map(s => ({ label: s.label, value: s.value }))

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        const rows = [["Total", String(returnsData.returnCount)], ["Taxa", `${returnsData.returnRate}%`]]
        if (fmt === "csv") exportCSV("relatorio-trocas", ["Indicador", "Valor"], rows)
        else await exportXLSX("relatorio-trocas", [{ name: "Trocas", headers: ["Indicador", "Valor"], rows }])
    }, [returnsData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12"><SummaryCards metrics={kpis} /></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-7">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={TrendingUpIcon} title="Evolução das Devoluções" />
                        <DashboardBarChart data={returnsData.returnEvolution.map(e => ({ label: e.label, value: e.value }))} colors={CHART_COLORS_VIVID} showLegend />
                    </div>
                </div>
                <div className="lg:col-span-5 flex flex-col gap-6">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                        <CardHeader icon={TagIcon} title="Por Motivo" />
                        <div className="flex justify-center">
                            <DashboardPieChart data={reasonData} totalValue={String(returnsData.returnCount)} totalLabel="Devoluções" innerRadius={60} outerRadius={80} className="h-[190px]" showLegend colors={CHART_COLORS_CATEGORY} />
                        </div>
                    </div>
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                        <CardHeader icon={ListIcon} title="Por Status" />
                        <div className="flex justify-center">
                            <DashboardPieChart data={statusData} totalValue={String(returnsData.byStatus.reduce((a: any, s: any) => a + s.value, 0))} totalLabel="Total" innerRadius={55} outerRadius={72} className="h-[170px]" showLegend colors={CHART_COLORS_CATEGORY} />
                        </div>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-5">
                    {returnsData.topReturnedProducts.length > 0 ? (
                        <ReportRankingCard
                            title="Produtos Mais Devolvidos"
                            items={returnsData.topReturnedProducts.slice(0, 6).map(p => ({ id: String(p.productName), label: p.productName, value: `${p.count}x`, subtitle: `${p.totalQuantity} un.` }))}
                            variant="compact"
                        />
                    ) : (
                        <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex items-center justify-center h-full">
                            <p className="text-sm text-brand-inactive-text">Nenhum produto devolvido.</p>
                        </div>
                    )}
                </div>
                <div className="lg:col-span-7">
                    <ReportTableCard
                        title="Últimas Devoluções"
                        columns={[{ key: "customer", header: "Cliente" }, { key: "reason", header: "Motivo" }, { key: "amount", header: "Valor" }, { key: "status", header: "Status" }, { key: "date", header: "Data" }]}
                        data={returnsData.recentReturns}
                        onRowClick={() => router.push("/erp/returns")}
                    />
                </div>
            </div>
        </div>
    )
}

// ─────────────────── 10. Marketing ───────────────────

function MarketingSection({ marketingData }: { marketingData: MarketingReportData | null }) {
    const router = useRouter()
    const { setExportHandler } = useDashboard()
    if (!marketingData) return <SectionPlaceholder title="Marketing" description="Ative o módulo de vendas para visualizar relatórios de marketing." />

    const insights = useMemo(() => generateMarketingInsights({
        totalCoupons: marketingData.couponStats.total, couponUsageRate: marketingData.couponStats.usageRate,
        revenueBySource: Object.fromEntries(marketingData.revenueBySource.map(s => [s.label, s.value])),
        topSource: marketingData.topSource, topSourcePercent: marketingData.topSourcePercent,
    }), [marketingData])

    const mappedInsights = useMemo(() => {
        return insights.map(ins => ({
            message: ins.message,
            color: INSIGHT_COLORS[ins.tone] || "blue"
        }))
    }, [insights])

    const kpis = useMemo(() => [
        { title: "Faturamento", value: marketingData.totalRevenueFormatted, trend: "" },
        { title: "Top Canal", value: marketingData.topSource, trend: `${marketingData.topSourcePercent}% do total` },
        { title: "Cupons", value: String(marketingData.couponStats.total), trend: "" },
        { title: "Uso Cupons", value: `${marketingData.couponStats.usageRate}%`, trend: "" },
        ...(marketingData.campaigns.length > 0 ? [{ title: "Campanhas", value: String(marketingData.campaigns.filter(c => c.isActive).length), trend: `de ${marketingData.campaigns.length}` }] : []),
    ], [marketingData])

    const sourceData = marketingData.revenueBySource.map(s => ({ label: s.label, value: s.value }))
    const evoData = marketingData.evolution.map(d => ({ label: d.label, value: d.online + d.presencial + d.outros }))

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        const rows = [["Faturamento", marketingData.totalRevenueFormatted], ["Top Canal", marketingData.topSource]]
        if (fmt === "csv") exportCSV("relatorio-marketing", ["Indicador", "Valor"], rows)
        else await exportXLSX("relatorio-marketing", [{ name: "Marketing", headers: ["Indicador", "Valor"], rows }])
    }, [marketingData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12">
                    <SummaryCards metrics={kpis} variant="horizontal" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={TrendingUpIcon} title="Evolução" />
                        <DashboardLineChart data={evoData} showLegend legendLabels={{ value: "Faturamento" }} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                        <CardHeader icon={TagIcon} title="Faturamento por Canal" />
                        <div className="flex justify-center flex-1 items-center">
                            <DashboardPieChart data={sourceData} totalValue={marketingData.totalRevenueFormatted} totalLabel="Total" innerRadius={60} outerRadius={80} className="h-[200px]" showLegend colors={CHART_COLORS_CATEGORY} />
                        </div>
                    </div>
                </div>
            </div>

            {marketingData.topCoupons.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                    <div className="lg:col-span-8">
                        <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                            <CardHeader icon={MegaphoneIcon} title="Campanhas" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {marketingData.campaigns.slice(0, 6).map(c => (
                                    <div key={c.id} className={`rounded-[12px] p-3 border ${c.isActive ? "border-brand-green bg-green-50 dark:bg-green-900/20" : "border-brand-border dark:border-dark-border"}`}>
                                        <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">{c.name}</p>
                                        <p className={`text-[11px] font-medium mt-0.5 ${c.isActive ? "text-brand-green" : "text-brand-inactive-text"}`}>{c.isActive ? "Ativa" : "Inativa"}</p>
                                    </div>
                                ))}
                                {marketingData.campaigns.length === 0 && <p className="text-sm text-brand-inactive-text col-span-2">Nenhuma campanha cadastrada.</p>}
                            </div>
                        </div>
                    </div>
                    <div className="lg:col-span-4">
                        <ReportRankingCard
                            title="Cupons Mais Usados"
                            items={marketingData.topCoupons.slice(0, 6).map(c => ({
                                id: c.id,
                                label: c.code,
                                value: `${c.usageCount} usos`,
                                subtitle: c.discountType === "percentage" ? `${c.discountValue}%` : brl(c.discountValue),
                            }))}
                            variant="compact"
                            icon={TagIcon}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

// ─────────────────── 11. Produtividade ───────────────────

function ProductivitySection({ productivityData, goalData }: { productivityData: ProductivityReportData | null; goalData: GoalReportData | null }) {
    const router = useRouter()
    const { setExportHandler } = useDashboard()
    if (!productivityData) return <SectionPlaceholder title="Produtividade" description="Ative o módulo de serviços." />

    const insights = useMemo(() => generateProductivityInsights({
        topStaffName: productivityData.staffRanking[0]?.label, topStaffRevenue: productivityData.staffRanking[0]?.revenue,
        staffCount: productivityData.staffRanking.length, totalRevenue: productivityData.metrics.totalRevenue,
    }), [productivityData])

    const mappedInsights = useMemo(() => {
        return insights.map(ins => ({
            message: ins.message,
            color: INSIGHT_COLORS[ins.tone] || "blue"
        }))
    }, [insights])

    const kpis = useMemo(() => [
        { title: "Atendimentos", value: String(productivityData.metrics.totalAppointments), trend: "" },
        { title: "Receita", value: productivityData.metrics.totalRevenueFormatted, trend: "" },
        { title: "Ticket Médio", value: brl(productivityData.metrics.avgTicketPerStaff), trend: "" },
        { title: "Tempo Médio", value: `${productivityData.metrics.avgDuration}min`, trend: "" },
        { title: "Comparecimento", value: `${productivityData.metrics.attendanceRate}%`, trend: "" },
        ...(goalData && goalData.totalCount > 0 ? [{ title: "Metas", value: `${goalData.achievedCount}/${goalData.totalCount}`, trend: `${goalData.overallProgress}%` }] : []),
    ], [productivityData, goalData])

    const evoData = productivityData.dailyEvolution.map(d => ({ label: d.label, value: d.atendimentos, secondary: d.receita }))

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        const rows = [["Atendimentos", String(productivityData.metrics.totalAppointments)], ["Receita", productivityData.metrics.totalRevenueFormatted]]
        if (fmt === "csv") exportCSV("relatorio-produtividade", ["Indicador", "Valor"], rows)
        else await exportXLSX("relatorio-produtividade", [{ name: "Produtividade", headers: ["Indicador", "Valor"], rows }])
    }, [productivityData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12">
                    <SummaryCards metrics={kpis} variant="horizontal" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={TrendingUpIcon} title="Atendimentos por Dia" />
                        <DashboardLineChart data={evoData} showLegend legendLabels={{ value: "Atendimentos", secondary: "Receita" }} />
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <ReportRankingCard
                        title="Ranking da Equipe"
                        items={productivityData.staffRanking.slice(0, 6).map(s => ({
                            id: s.id,
                            label: s.label,
                            value: `${s.appointments} atd.`,
                            subtitle: `Ticket: R$ ${s.ticketMedio}`,
                        }))}
                        variant="compact"
                        icon={AwardIcon}
                    />
                </div>
            </div>

            {goalData && goalData.totalCount > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                    <div className="lg:col-span-12">
                        <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                            <CardHeader icon={TargetIcon} title="Progresso das Metas" />
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {goalData.goals.slice(0, 6).map(g => {
                                    const pct = Math.min(g.progressPct, 100)
                                    const barColor = g.achieved ? "bg-brand-green" : pct >= 80 ? "bg-brand-orange" : pct >= 50 ? "bg-brand-blue" : "bg-brand-red"
                                    const textColor = g.achieved ? "text-brand-green" : "text-brand-dark dark:text-dark-heading"
                                    return (
                                        <div key={g.id} className="bg-brand-bg dark:bg-dark-elevated rounded-[16px] p-4 border border-brand-border dark:border-dark-border">
                                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{g.name}</p>
                                            <p className="text-xs text-brand-inactive-text mt-1">Meta: {g.targetFormatted}</p>
                                            <div className="mt-3 flex items-center gap-2">
                                                <div className="flex-1 h-2 bg-brand-border dark:bg-dark-border rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className={`text-[13px] font-bold ${textColor}`}>{g.achieved ? "✅ 100%" : `${pct}%`}</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ─────────────────── Serviços ───────────────────

function ServicesSection({ servicesData }: { servicesData: ServicesDashboardData }) {
    const router = useRouter()
    const { setExportHandler } = useDashboard()

    const parseBrl = (val?: string) => {
        if (!val) return 0
        const clean = val.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
        return Number(clean) || 0
    }

    const totalCategoryServices = (servicesData.categoryRows || []).reduce((acc, c) => acc + (Number(c.value) || 0), 0)
    const staffChartData = (servicesData.staffRows || []).map(s => ({ label: s.title, value: parseBrl(s.value) }))
    const serviceChartData = (servicesData.serviceRows || []).map(s => ({ label: s.title, value: parseBrl(s.value) }))
    const todayCount = servicesData.todayAppointments?.length || 0
    const staffCount = servicesData.staffRows?.length || 0
    const topStaffName = servicesData.staffRows?.[0]?.title
    const topStaffRevenue = parseBrl(servicesData.staffRows?.[0]?.value)

    const insights = useMemo(() => generateServicesInsights({
        todayAppointments: todayCount,
        cancelledCount: Number(servicesData.metrics.find((m: any) => m.title.includes("Cancelados"))?.value || 0),
        totalAppointments: Number(servicesData.metrics.find((m: any) => m.title.includes("Total"))?.value || 0),
        attendanceRate: Number(String(servicesData.metrics.find((m: any) => m.title.includes("Comparecimento"))?.value || "100").replace("%", "")),
        topStaffName,
        topStaffRevenue,
    }), [servicesData])

    const mappedInsights = useMemo(() => {
        return insights.map(ins => ({
            message: ins.message,
            color: INSIGHT_COLORS[ins.tone] || "blue"
        }))
    }, [insights])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        const rows = [["Atendimentos", String(servicesData.metrics[0]?.value || "0")]]
        if (fmt === "csv") exportCSV("servicos", ["Indicador", "Valor"], rows)
        else await exportXLSX("servicos", [{ name: "Serviços", headers: ["Indicador", "Valor"], rows }])
    }, [servicesData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12"><SummaryCards metrics={servicesData.metrics} /></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-5">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                        <CardHeader icon={TagIcon} title="Distribuição por Categoria" />
                        <div className="flex justify-center">
                            <DashboardPieChart
                                data={(servicesData.categoryRows || []).map(c => ({ label: c.title, value: Number(c.value || 0) }))}
                                totalValue={String(totalCategoryServices)} totalLabel="Serviços"
                                innerRadius={60} outerRadius={80} className="h-[200px]" showLegend colors={CHART_COLORS_CATEGORY}
                            />
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-7">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={WrenchIcon} title="Faturamento por Serviço" />
                        <DashboardLineChart data={serviceChartData} showLegend />
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-5">
                    <ReportRankingCard
                        title="Ranking da Equipe"
                        items={(servicesData.staffRows || []).slice(0, 6).map(s => ({ id: s.id, label: s.title, value: s.value || "0", subtitle: s.subtitle }))}
                        variant="compact"
                    />
                </div>
                <div className="lg:col-span-7">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={CalendarIcon} title="Agendamentos de Hoje" />
                        {todayCount === 0 ? (
                            <p className="text-sm text-brand-inactive-text py-8 text-center">Nenhum agendamento para hoje.</p>
                        ) : (
                            <div className="space-y-2">
                                {(servicesData.todayAppointments || []).slice(0, 5).map(a => (
                                    <div key={a.id} className="flex items-center justify-between py-2 border-b border-brand-border dark:border-dark-border last:border-0">
                                        <div>
                                            <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{a.title}</p>
                                            <p className="text-[11px] text-brand-inactive-text">{a.subtitle}{a.meta ? ` · ${a.meta}` : ""}</p>
                                        </div>
                                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{a.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────── Financeiro ───────────────────

function FinancialSection({ financialData }: { financialData: FinancialDashboardData }) {
    const router = useRouter()
    const { setExportHandler } = useDashboard()

    const totalDistribution = (financialData.distribution || []).reduce((acc, d) => acc + Number(d.value), 0)
    const cashflowData = (financialData.cashflow || []).map(p => ({ label: p.label, value: Number(p.value), secondary: Number(p.secondary || 0) }))

    const insights = useMemo(() => generateFinancialInsights({
        balance: Number(financialData.metrics.find((m: any) => m.title.includes("Saldo"))?.value?.replace(/[^\d,.-]/g, "").replace(",", ".") || 0),
        receivable: Number(financialData.metrics.find((m: any) => m.title.includes("Receber"))?.value?.replace(/[^\d,.-]/g, "").replace(",", ".") || 0),
        payable: Number(financialData.metrics.find((m: any) => m.title.includes("Pagar"))?.value?.replace(/[^\d,.-]/g, "").replace(",", ".") || 0),
        incomeTotal: totalDistribution,
        expenseTotal: Number(financialData.metrics.find((m: any) => m.title.includes("Despesas"))?.value?.replace(/[^\d,.-]/g, "").replace(",", ".") || 0),
    }), [financialData])

    const mappedInsights = useMemo(() => {
        return insights.map(ins => ({
            message: ins.message,
            color: INSIGHT_COLORS[ins.tone] || "blue"
        }))
    }, [insights])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        const rows = [["Saldo", financialData.metrics.find((m: any) => m.title.includes("Saldo"))?.value || "R$ 0,00"]]
        if (fmt === "csv") exportCSV("financeiro", ["Indicador", "Valor"], rows)
        else await exportXLSX("financeiro", [{ name: "Financeiro", headers: ["Indicador", "Valor"], rows }])
    }, [financialData])

    useEffect(() => { setExportHandler(onExport); return () => setExportHandler(null) }, [onExport, setExportHandler])

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <InsightsRegister insights={mappedInsights} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12">
                    <SummaryCards metrics={financialData.metrics} variant="horizontal" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={MoneyIcon} title="Fluxo de Caixa" />
                        <DashboardLineChart data={cashflowData} showLegend legendLabels={{ value: "Entradas", secondary: "Saídas" }} />
                    </div>
                </div>
                <div className="lg:col-span-4 flex flex-col gap-6">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                        <CardHeader icon={ChartIcon} title="Distribuição Financeira" />
                        <div className="flex justify-center">
                            <DashboardPieChart
                                data={(financialData.distribution || []).map(d => ({ label: d.label, value: Number(d.value) }))}
                                totalValue={brl(totalDistribution)} totalLabel="Movimentação"
                                innerRadius={60} outerRadius={80} className="h-[190px]" showLegend colors={CHART_COLORS_CATEGORY}
                            />
                        </div>
                    </div>
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                        <CardHeader icon={TagIcon} title="Despesas por Categoria" />
                        <DashboardBarChart data={(financialData.expensesByCategory || []).map(e => ({ label: e.label, value: Number(e.value) }))} colors={CHART_COLORS_VIVID} showLegend />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                        <CardHeader icon={CreditCardIcon} title="Contas Vencidas / Pendentes" />
                        {(financialData.overdueAccounts || []).length === 0 ? (
                            <p className="text-sm text-brand-inactive-text py-6 text-center">Nenhuma conta vencida ou pendente.</p>
                        ) : (
                            <div className="space-y-2">
                                {(financialData.overdueAccounts || []).slice(0, 6).map(a => (
                                    <div key={a.id} className="flex items-center justify-between py-2 border-b border-brand-border dark:border-dark-border last:border-0">
                                        <div>
                                            <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{a.title}</p>
                                            <p className="text-[11px] text-brand-inactive-text">{a.subtitle}{a.meta ? ` · Venc: ${a.meta}` : ""}</p>
                                        </div>
                                        <span className={`text-[13px] font-bold ${a.tone === "red" ? "text-brand-red" : "text-brand-orange"}`}>{a.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full">
                        <CardHeader icon={ListIcon} title="Últimas Movimentações" />
                        <div className="space-y-4">
                            {(financialData.latestMovements || []).slice(0, 5).map(m => (
                                <div key={m.id} className="flex items-center justify-between py-1">
                                    <div>
                                        <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{m.title}</p>
                                        <p className="text-[11px] text-brand-inactive-text">{m.subtitle}{m.meta ? ` · ${m.meta}` : ""}</p>
                                    </div>
                                    <span className={`text-[13px] font-bold ${m.tone === "red" ? "text-brand-red" : "text-brand-green"}`}>{m.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
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

// ─────────────────── 10. Assinaturas ───────────────────

function SubscriptionSection({ subscriptionData }: { subscriptionData: SubscriptionReportData | null }) {
    const router = useRouter()
    const { setExportHandler } = useDashboard()

    if (!subscriptionData) {
        return (
            <SectionPlaceholder
                title="Assinaturas Recorrentes"
                description="Dados e métricas de assinaturas recorrentes indisponíveis."
            />
        )
    }

    const kpis = useMemo(() => [
        { title: "MRR (Ativo)", value: brl(subscriptionData.mrr), trend: "" },
        { title: "ARR (Anualizado)", value: brl(subscriptionData.arr), trend: "" },
        { title: "LTV Médio", value: brl(subscriptionData.ltv), trend: "" },
        { title: "Taxa de Renovação", value: `${subscriptionData.renewalRate.toFixed(1)}%`, trend: "" },
        { title: "Churn (30 dias)", value: `${subscriptionData.churnRate.toFixed(1)}%`, trend: "" },
    ], [subscriptionData])

    const statusMetrics = useMemo(() => [
        { title: "Assinaturas Ativas", value: String(subscriptionData.activeCount), color: "text-brand-green" },
        { title: "Em Pausa", value: String(subscriptionData.pausedCount), color: "text-brand-orange" },
        { title: "Aguardando Reposição", value: String(subscriptionData.delinquentCount), color: "text-brand-red" },
        { title: "Canceladas (Total)", value: String(subscriptionData.cancelledCount), color: "text-brand-inactive-text" },
    ], [subscriptionData])

    const onExport = useCallback(async (fmt: "csv" | "xlsx") => {
        const rows = [
            ["MRR Ativo", brl(subscriptionData.mrr)],
            ["ARR Anualizado", brl(subscriptionData.arr)],
            ["LTV Médio", brl(subscriptionData.ltv)],
            ["Taxa de Renovação", `${subscriptionData.renewalRate.toFixed(1)}%`],
            ["Churn Rate (30d)", `${subscriptionData.churnRate.toFixed(1)}%`],
            ["Assinantes Ativos", String(subscriptionData.activeCount)],
            ["Assinantes Pausados", String(subscriptionData.pausedCount)],
            ["Aguardando Reposição", String(subscriptionData.delinquentCount)],
            ["Canceladas", String(subscriptionData.cancelledCount)]
        ]
        if (fmt === "csv") {
            exportCSV("relatorio-assinaturas", ["Indicador", "Valor"], rows)
        } else {
            await exportXLSX("relatorio-assinaturas", [{ name: "Assinaturas", headers: ["Indicador", "Valor"], rows }])
        }
    }, [subscriptionData])

    useEffect(() => {
        setExportHandler(onExport)
        return () => setExportHandler(null)
    }, [onExport, setExportHandler])

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Analytics de Assinaturas</h2>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">Visão geral do desempenho, faturamento recorrente e demanda prevista de produtos.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => onExport("csv")} variant="outline" size="sm" leftIcon={<ExportFileIcon size={18} />}>Exportar CSV</Button>
                    <Button onClick={() => onExport("xlsx")} variant="outline" size="sm" leftIcon={<ExportFileIcon size={18} />}>Exportar Excel</Button>
                </div>
            </div>

            {/* Main KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 w-full">
                {kpis.map((k, idx) => (
                    <div key={idx} className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border shadow-sm flex flex-col justify-between">
                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">{k.title}</span>
                        <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-2">{k.value}</span>
                    </div>
                ))}
            </div>

            {/* Status Counters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 w-full">
                {statusMetrics.map((sm, idx) => (
                    <div key={idx} className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border shadow-sm flex items-center justify-between">
                        <div>
                            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">{sm.title}</span>
                            <p className="text-3xl font-black text-brand-dark dark:text-dark-heading mt-1">{sm.value}</p>
                        </div>
                        <span className={`h-3.5 w-3.5 rounded-full ${sm.color === "text-brand-green" ? "bg-brand-green" : sm.color === "text-brand-orange" ? "bg-brand-orange" : sm.color === "text-brand-red" ? "bg-brand-red" : "bg-gray-400"}`} />
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
                {/* Left: Projected stock demand for next 30 days */}
                <div className="lg:col-span-6 bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border shadow-sm flex flex-col">
                    <CardHeader icon={BoxIcon} title="Demanda Prevista de Produtos (Próximos 30 dias)" />
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">Total planejado de reposição física exigida para atender as entregas dos ciclos futuros.</p>

                    {subscriptionData.projectedProducts.length === 0 ? (
                        <div className="flex-grow flex items-center justify-center py-12 text-sm text-brand-inactive-text dark:text-dark-body">
                            Nenhuma demanda de produtos físicos prevista para os próximos 30 dias.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-brand-border dark:border-dark-border text-brand-inactive-text font-semibold">
                                        <th className="pb-3">Produto</th>
                                        <th className="pb-3 text-right">Qtd Prevista</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                    {subscriptionData.projectedProducts.map((p) => (
                                        <tr key={p.id} className="hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                                            <td className="py-3 font-medium text-brand-dark dark:text-dark-heading">{p.name}</td>
                                            <td className="py-3 text-right font-bold text-brand-dark dark:text-dark-heading">{p.quantity} un</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Right: Credits usage & projected cycle billing */}
                <div className="lg:col-span-6 flex flex-col gap-6">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border shadow-sm">
                        <CardHeader icon={CreditCardIcon} title="Uso de Créditos de Assinatura" />
                        <div className="grid grid-cols-2 gap-4 mt-2">
                            <div className="bg-brand-gray/30 dark:bg-dark-border/20 rounded-xl p-4 flex flex-col">
                                <span className="text-xs text-brand-inactive-text dark:text-dark-body">Créditos Utilizados</span>
                                <span className="text-2xl font-extrabold text-brand-green mt-1">{subscriptionData.creditsUsedCount}</span>
                            </div>
                            <div className="bg-brand-gray/30 dark:bg-dark-border/20 rounded-xl p-4 flex flex-col">
                                <span className="text-xs text-brand-inactive-text dark:text-dark-body">Créditos Expirados</span>
                                <span className="text-2xl font-extrabold text-brand-red mt-1">{subscriptionData.creditsExpiredCount}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border shadow-sm flex flex-col flex-grow">
                        <CardHeader icon={TrendingUpIcon} title="Faturamento Previsto (Próximos 30 dias)" />
                        <div className="space-y-4 my-auto">
                            <div className="flex justify-between items-center pb-2 border-b border-brand-border dark:border-dark-border">
                                <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">Ciclos Previstos</span>
                                <span className="text-lg font-bold text-brand-dark dark:text-dark-heading">{subscriptionData.projectedOrders30Days} ciclos</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-brand-border dark:border-dark-border">
                                <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">Previsão Financeira</span>
                                <span className="text-2xl font-black text-brand-green">{brl(subscriptionData.projectedRevenue30Days)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
