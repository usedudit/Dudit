"use client"

import React, { useState, useEffect, useMemo } from "react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    Legend
} from "recharts"
import {
    MoneyIcon,
    SalesIcon,
    TagIcon,
    TrendingUpIcon,
    ShoppingCartIcon,
    Users,
    CalendarIcon,
    HeartIcon,
    StarIcon,
    AnalyticsIcon,
    CheckCircleIcon,
    InfoIcon,
    TargetIcon,
    AwardIcon
} from "@/lib/icons"
import { Badge, Button, IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
import { HorizontalKPICard } from "@/components/erp/dashboard/cards/HorizontalKPICard"
import { formatCurrency } from "@/lib/utils"
import { getCampaignMetricsAction } from "@/app/actions/shared/promotions"

interface CampaignMetricsTabProps {
    campaign: any
    promotions: any[]
    partnerId: string
    scopeData?: { products: any[]; categories: any[]; customers: any[]; services?: any[] }
}

function formatMetricNumber(value: number | string | null | undefined): string {
    const n = Number(value ?? 0)
    return new Intl.NumberFormat("pt-BR").format(n)
}

function formatScore(value: number | string | null | undefined): string {
    return Number(value ?? 0).toFixed(1)
}

const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-3.5 shadow-lg flex flex-col gap-2 font-sans min-w-[170px]">
                <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading border-b border-brand-border dark:border-dark-border pb-1.5">
                    {label}
                </p>
                <div className="flex flex-col gap-1.5">
                    {payload.map((entry: any, index: number) => {
                        const color = entry.fill || "var(--color-brand-green)"
                        const isCurrency = entry.dataKey === "receita" || entry.dataKey === "desconto"
                        return (
                            <div key={index} className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                    <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">
                                        {entry.name}
                                    </span>
                                </div>
                                <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
                                    {isCurrency ? formatCurrency(entry.value) : `${formatMetricNumber(entry.value)} pedidos`}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }
    return null
}

export default function CampaignMetricsTab({
    campaign,
    promotions,
    partnerId,
    scopeData
}: CampaignMetricsTabProps) {
    const hasId = !!campaign?.id

    const [isLoading, setIsLoading] = useState(true)
    const [realMetrics, setRealMetrics] = useState<any>(null)
    const [useSimulatedMode, setUseSimulatedMode] = useState(false)

    // Primary rule from campaign promotions
    const primaryRule = useMemo(() => {
        if (!promotions || promotions.length === 0) return null
        return promotions[0]
    }, [promotions])

    // Load actual database metrics
    useEffect(() => {
        if (!hasId || !partnerId) {
            setIsLoading(false)
            return
        }

        let isMounted = true
        setIsLoading(true)

        getCampaignMetricsAction(partnerId, campaign.id)
            .then((res) => {
                if (isMounted && res.success && res.data) {
                    setRealMetrics(res.data)
                    // If no real orders exist yet, automatically start in simulated projection mode
                    if (!res.data.hasRealData) {
                        setUseSimulatedMode(true)
                    }
                }
            })
            .catch((err) => {
                console.error("Erro ao carregar métricas da campanha:", err)
            })
            .finally(() => {
                if (isMounted) setIsLoading(false)
            })

        return () => {
            isMounted = false
        }
    }, [hasId, partnerId, campaign?.id])

    // Generate intelligent simulation data based on campaign configuration
    const simulatedData = useMemo(() => {
        const discountType = primaryRule?.discount_type || "percentage"
        const discountVal = Number(primaryRule?.discount_value || 15)
        const minSpend = Number(primaryRule?.min_spend_amount || 80)
        const avgOrder = Math.max(minSpend * 1.35, 145)

        const estDiscountPerOrder = discountType === "percentage"
            ? (avgOrder * (discountVal / 100))
            : Math.min(discountVal, avgOrder * 0.3)

        const simulatedOrdersCount = 28
        const simulatedRevenue = Math.round(simulatedOrdersCount * avgOrder)
        const simulatedDiscount = Math.round(simulatedOrdersCount * estDiscountPerOrder)
        const simulatedROI = simulatedDiscount > 0 ? Number((simulatedRevenue / simulatedDiscount).toFixed(1)) : 8.5

        // 7-day timeline simulation
        const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
        const simulatedTimeline = days.map((day, idx) => {
            const factor = [0.8, 1.1, 0.9, 1.3, 1.8, 2.1, 1.4][idx]
            const dayOrders = Math.max(1, Math.round(4 * factor))
            const dayRevenue = Math.round(dayOrders * avgOrder)
            const dayDiscount = Math.round(dayOrders * estDiscountPerOrder)
            return {
                date: day,
                receita: dayRevenue,
                desconto: dayDiscount,
                pedidos: dayOrders,
            }
        })

        // Sample top products from scopeData or default placeholders
        const availableProducts = scopeData?.products || []
        const topProducts = availableProducts.slice(0, 4).map((p: any, idx: number) => {
            const qty = Math.max(2, 12 - idx * 3)
            return {
                id: p.id || String(idx),
                name: p.name || `Produto Promocional ${idx + 1}`,
                quantity: qty,
                totalRevenue: qty * Number(p.price || avgOrder * 0.8),
            }
        })

        if (topProducts.length === 0) {
            topProducts.push(
                { id: "1", name: "Item em Destaque 1", quantity: 14, totalRevenue: 1820 },
                { id: "2", name: "Item em Destaque 2", quantity: 9, totalRevenue: 1080 },
                { id: "3", name: "Item em Destaque 3", quantity: 5, totalRevenue: 590 }
            )
        }

        return {
            hasRealData: false,
            totalRevenue: simulatedRevenue,
            totalDiscount: simulatedDiscount,
            totalOrders: simulatedOrdersCount,
            totalUses: simulatedOrdersCount,
            averageOrderValue: avgOrder,
            roiMultiplier: simulatedROI,
            newCustomersPercentage: 42,
            returningCustomersPercentage: 58,
            usageLimit: primaryRule?.usage_limit || 100,
            usageCount: simulatedOrdersCount,
            usagePercentage: Math.min(100, Math.round((simulatedOrdersCount / (primaryRule?.usage_limit || 100)) * 100)),
            efficiencyScore: 8.7,
            lastUsedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
            timeline: simulatedTimeline,
            topProducts,
        }
    }, [primaryRule, scopeData])

    // Effective metrics to display
    const metrics = useMemo(() => {
        if (!realMetrics) return simulatedData
        if (!realMetrics.hasRealData && useSimulatedMode) return simulatedData
        return realMetrics
    }, [realMetrics, useSimulatedMode, simulatedData])

    // Campaign duration calculations
    const durationInfo = useMemo(() => {
        const starts = campaign?.starts_at ? new Date(campaign.starts_at) : null
        const ends = campaign?.ends_at ? new Date(campaign.ends_at) : null
        const now = new Date()

        let statusText = "Em andamento"
        let statusBadgeVariant: "green" | "orange" | "gray" | "blue" = "green"
        let remainingDays: number | null = null

        if (ends) {
            const diffTime = ends.getTime() - now.getTime()
            remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
            if (remainingDays < 0) {
                statusText = "Encerrada"
                statusBadgeVariant = "gray"
            } else if (remainingDays === 0) {
                statusText = "Termina hoje"
                statusBadgeVariant = "orange"
            } else {
                statusText = `${remainingDays} dias restantes`
                statusBadgeVariant = "green"
            }
        } else {
            statusText = "Sem data de término"
            statusBadgeVariant = "blue"
        }

        return { starts, ends, statusText, statusBadgeVariant, remainingDays }
    }, [campaign])

    if (!hasId) {
        return (
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-8 border border-brand-border dark:border-dark-border flex items-center justify-center min-h-[360px]">
                <IconPlaceholder
                    icon={AnalyticsIcon}
                    title="Nenhuma Métrica Disponível"
                    subtitle="Salve os dados da campanha para ativar o acompanhamento de métricas e conversões."
                />
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-12 border border-brand-border dark:border-dark-border flex flex-col items-center justify-center min-h-[400px]">
                <ThreeDotsLoader />
                <p className="mt-4 text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                    Carregando indicadores da campanha...
                </p>
            </div>
        )
    }

    const isDisplayingSimulation = !realMetrics?.hasRealData && useSimulatedMode

    return (
        <div className="flex flex-col gap-6">
            {/* Simulation / Notice Banner */}
            {!realMetrics?.hasRealData && (
                <div className="bg-brand-green-light/40 dark:bg-brand-green/10 border border-brand-green/20 dark:border-brand-green/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-brand-green/20 text-brand-green flex items-center justify-center shrink-0">
                            <InfoIcon size={18} />
                        </div>
                        <div>
                            <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                {isDisplayingSimulation ? "Projeção Inteligente de Desempenho" : "Campanha sem resgates registrados"}
                            </p>
                            <p className="text-[12px] text-brand-inactive-text dark:text-dark-body">
                                {isDisplayingSimulation
                                    ? "Exibindo simulação baseada nas regras configuradas e ticket estimado da loja."
                                    : "Nenhum pedido com este benefício foi finalizado até o momento."}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                        <Button
                            variant={isDisplayingSimulation ? "outline" : "filled"}
                            size="sm"
                            onClick={() => setUseSimulatedMode(!useSimulatedMode)}
                            className="text-xs h-8"
                        >
                            {isDisplayingSimulation ? "Ver dados reais (zerados)" : "Visualizar projeção / simulação"}
                        </Button>
                    </div>
                </div>
            )}

            {/* Top KPI Cards (HorizontalKPICard) */}
            <HorizontalKPICard
                items={[
                    {
                        title: "Receita Gerada",
                        value: formatCurrency(metrics.totalRevenue),
                        subtext: "Faturamento bruto influenciado",
                        icon: MoneyIcon,
                    },
                    {
                        title: "Descontos Aplicados",
                        value: formatCurrency(metrics.totalDiscount),
                        subtext: metrics.totalRevenue > 0
                            ? `${Math.round((metrics.totalDiscount / metrics.totalRevenue) * 100)}% da receita gerada`
                            : "Total concedido",
                        icon: TagIcon,
                    },
                    {
                        title: "Usos / Resgates",
                        value: `${formatMetricNumber(metrics.totalUses)} ${metrics.totalUses === 1 ? "pedido" : "pedidos"}`,
                        subtext: metrics.usageLimit
                            ? `De ${metrics.usageLimit} limite total`
                            : "Volume de pedidos com benefício",
                        icon: SalesIcon,
                    },
                    {
                        title: "ROI do Desconto",
                        value: metrics.roiMultiplier > 0 ? `${metrics.roiMultiplier}x` : "-",
                        subtext: metrics.roiMultiplier > 0
                            ? `R$ ${metrics.roiMultiplier.toFixed(2)} por R$ 1 concedido`
                            : "Retorno sobre abatimento",
                        icon: TrendingUpIcon,
                    },
                    {
                        title: "Ticket Médio",
                        value: formatCurrency(metrics.averageOrderValue),
                        subtext: "Média por pedido com desconto",
                        icon: ShoppingCartIcon,
                    },
                ]}
            />

            {/* Main Grid: Left (8 cols) and Right (4 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
                {/* Left/Main Column */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                    {/* Primary Chart: Evolution Timeline */}
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                    Desempenho: Receita Gerada vs. Desconto Concedido
                                </h3>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                    Acompanhamento diário das vendas influenciadas pelo benefício
                                </p>
                            </div>
                            <Badge variant="blue" className="text-xs">
                                {metrics.timeline.length > 0 ? `${metrics.timeline.length} pontos temporais` : "Sem dados"}
                            </Badge>
                        </div>

                        <div className="h-72 w-full">
                            {metrics.timeline.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <BarChart data={metrics.timeline} barGap={8} barCategoryGap="25%">
                                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-brand-border)" />
                                        <XAxis
                                            dataKey="date"
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{
                                                fill: "currentColor",
                                                className: "text-brand-inactive-text dark:text-dark-body",
                                                fontSize: 12,
                                                fontWeight: 500,
                                            }}
                                        />
                                        <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(val) => `R$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                                            tick={{
                                                fill: "currentColor",
                                                className: "text-brand-inactive-text dark:text-dark-body",
                                                fontSize: 12,
                                                fontWeight: 500,
                                            }}
                                        />
                                        <Tooltip
                                            content={<CustomChartTooltip />}
                                            cursor={{ fill: "var(--color-brand-green-light)", opacity: 0.15 }}
                                        />
                                        <Legend
                                            verticalAlign="top"
                                            align="right"
                                            wrapperStyle={{ paddingBottom: 16 }}
                                            formatter={(value) => (
                                                <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                                    {value}
                                                </span>
                                            )}
                                        />
                                        <Bar
                                            dataKey="receita"
                                            name="Receita Gerada"
                                            radius={[6, 6, 0, 0]}
                                            fill="var(--color-brand-green)"
                                        />
                                        <Bar
                                            dataKey="desconto"
                                            name="Desconto Aplicado"
                                            radius={[6, 6, 0, 0]}
                                            fill="var(--color-brand-dark)"
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-sm text-brand-inactive-text dark:text-dark-body">
                                    Nenhum histórico diário disponível para este período.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Secondary Cards: Audience breakdown & Top Products */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Audience Profile: New vs Returning Customers */}
                        <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                                            <Users size={16} />
                                        </div>
                                        <h4 className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                            Perfil de Clientes
                                        </h4>
                                    </div>
                                    <Badge variant="green" className="text-xs">
                                        Aquisição vs Retenção
                                    </Badge>
                                </div>

                                <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-5">
                                    Comportamento dos consumidores que utilizaram a promoção nas compras.
                                </p>

                                {/* Segmented Progress Bar */}
                                <div className="space-y-2 mb-4">
                                    <div className="w-full h-3 rounded-full bg-gray-100 dark:bg-dark-border/40 overflow-hidden flex">
                                        <div
                                            className="h-full bg-brand-green transition-all duration-700"
                                            style={{ width: `${metrics.returningCustomersPercentage}%` }}
                                        />
                                        <div
                                            className="h-full bg-blue-500 transition-all duration-700"
                                            style={{ width: `${metrics.newCustomersPercentage}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="flex items-center gap-1.5 font-medium text-brand-dark dark:text-dark-heading">
                                            <span className="w-2.5 h-2.5 rounded-full bg-brand-green inline-block" />
                                            Recorrentes ({metrics.returningCustomersPercentage}%)
                                        </span>
                                        <span className="flex items-center gap-1.5 font-medium text-brand-dark dark:text-dark-heading">
                                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                                            Novos ({metrics.newCustomersPercentage}%)
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-brand-border dark:border-dark-border text-xs text-brand-inactive-text dark:text-dark-body">
                                {metrics.returningCustomersPercentage >= 50
                                    ? "A campanha está gerando excelente fidelização e recompra na base existente."
                                    : "A campanha está com alto poder de atração de novos clientes para a loja."}
                            </div>
                        </div>

                        {/* Top Redeemed Items */}
                        <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                                            <AwardIcon size={16} />
                                        </div>
                                        <h4 className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                            Itens Mais Movimentados
                                        </h4>
                                    </div>
                                    <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                                        Ranking
                                    </span>
                                </div>

                                <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">
                                    Produtos que mais converteram dentro do escopo da promoção.
                                </p>

                                <div className="flex flex-col gap-2.5">
                                    {metrics.topProducts && metrics.topProducts.length > 0 ? (
                                        metrics.topProducts.map((prod: any, idx: number) => (
                                            <div
                                                key={prod.id || idx}
                                                className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-brand-border/60 dark:border-dark-border/40 bg-gray-50/50 dark:bg-dark-border/10"
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <span className="w-5 h-5 rounded-full bg-brand-dark/5 dark:bg-dark-border/60 flex items-center justify-center text-[10px] font-bold text-brand-dark dark:text-dark-heading shrink-0">
                                                        {idx + 1}
                                                    </span>
                                                    <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading truncate">
                                                        {prod.name}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0 text-right">
                                                    <Badge variant="gray" className="text-[10px] py-0.5 px-2">
                                                        {prod.quantity} un
                                                    </Badge>
                                                    <span className="text-xs font-bold text-brand-dark dark:text-dark-heading min-w-[70px]">
                                                        {formatCurrency(prod.totalRevenue)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body py-4 text-center">
                                            Nenhum item específico contabilizado ainda.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column (4 cols) */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    {/* Campaign Efficiency Score Gauge */}
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col items-center justify-between">
                        <div className="flex items-center justify-between w-full mb-4">
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                Eficiência da Campanha
                            </h3>
                            <StarIcon className="text-brand-green fill-brand-green w-5 h-5" />
                        </div>

                        {/* Circular Progress Gauge */}
                        <div className="relative flex items-center justify-center w-36 h-36 my-3">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="40"
                                    stroke="var(--color-brand-border)"
                                    className="stroke-brand-border dark:stroke-dark-border/40"
                                    strokeWidth="8"
                                    fill="transparent"
                                />
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="40"
                                    stroke="var(--color-brand-green)"
                                    strokeWidth="8"
                                    fill="transparent"
                                    strokeDasharray="251.2"
                                    strokeDashoffset={
                                        251.2 - (251.2 * Math.min(Math.max(Number(metrics.efficiencyScore ?? 0), 0), 10)) / 10
                                    }
                                    strokeLinecap="round"
                                    className="transition-all duration-1000 ease-out"
                                />
                            </svg>
                            <div className="absolute flex flex-col items-center justify-center">
                                <span className="text-3xl font-extrabold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                    {formatScore(metrics.efficiencyScore)}
                                </span>
                                <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body mt-1 uppercase tracking-wider">
                                    de 10.0
                                </span>
                            </div>
                        </div>

                        <Badge
                            variant={metrics.efficiencyScore >= 7.5 ? "green" : metrics.efficiencyScore >= 5 ? "blue" : "orange"}
                            className="text-xs mb-3"
                        >
                            {metrics.efficiencyScore >= 8.5
                                ? "Excelente Rentabilidade"
                                : metrics.efficiencyScore >= 7.0
                                ? "Alto Desempenho"
                                : metrics.efficiencyScore >= 5.0
                                ? "Desempenho Estável"
                                : "Em Aquecimento"}
                        </Badge>

                        <div className="text-center w-full border-t border-brand-border dark:border-dark-border pt-4">
                            <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                Pontuação calculada a partir do retorno sobre desconto (ROI), ticket médio e ritmo de resgate.
                            </p>
                        </div>
                    </div>

                    {/* Usage Limits / Burn Rate Card */}
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                                    <TargetIcon size={16} />
                                </div>
                                <h4 className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                    Consumo de Limite
                                </h4>
                            </div>
                            <Badge variant={metrics.usagePercentage && metrics.usagePercentage > 85 ? "orange" : "blue"} className="text-xs">
                                {metrics.usageLimit ? `${metrics.usagePercentage ?? 0}%` : "Ilimitada"}
                            </Badge>
                        </div>

                        {metrics.usageLimit ? (
                            <div className="space-y-3">
                                <div className="flex justify-between text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                    <span>{metrics.usageCount} resgates realizados</span>
                                    <span className="text-brand-inactive-text dark:text-dark-body">
                                        Teto: {metrics.usageLimit}
                                    </span>
                                </div>
                                <div className="w-full h-2.5 rounded-full bg-gray-100 dark:bg-dark-border/40 overflow-hidden">
                                    <div
                                        className="h-full bg-brand-green transition-all duration-700"
                                        style={{ width: `${metrics.usagePercentage ?? 0}%` }}
                                    />
                                </div>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body pt-1">
                                    {metrics.usagePercentage && metrics.usagePercentage >= 90
                                        ? "Atenção: A campanha está próxima de atingir o limite global estabelecido."
                                        : "O volume de resgates está operando dentro da margem planejada."}
                                </p>
                            </div>
                        ) : (
                            <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                Esta campanha não possui limite global de usos cadastrado. Qualquer cliente elegível poderá aproveitar enquanto estiver ativa.
                            </div>
                        )}
                    </div>

                    {/* Validity & Activity Info Card */}
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                <CalendarIcon size={18} />
                            </div>
                            <div>
                                <h4 className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                    Vigência da Campanha
                                </h4>
                                <Badge variant={durationInfo.statusBadgeVariant} className="text-[11px] mt-1">
                                    {durationInfo.statusText}
                                </Badge>
                            </div>
                        </div>

                        <div className="border-t border-brand-border dark:border-dark-border pt-3 space-y-2 text-xs">
                            <div className="flex justify-between">
                                <span className="text-brand-inactive-text dark:text-dark-body">Início:</span>
                                <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                    {durationInfo.starts
                                        ? durationInfo.starts.toLocaleDateString("pt-BR")
                                        : "Imediato"}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-brand-inactive-text dark:text-dark-body">Encerramento:</span>
                                <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                    {durationInfo.ends
                                        ? durationInfo.ends.toLocaleDateString("pt-BR")
                                        : "Indeterminado"}
                                </span>
                            </div>
                            {metrics.lastUsedAt && (
                                <div className="flex justify-between pt-2 border-t border-brand-border/40 dark:border-dark-border/40">
                                    <span className="text-brand-inactive-text dark:text-dark-body">Último resgate:</span>
                                    <span className="font-bold text-brand-green">
                                        {new Date(metrics.lastUsedAt).toLocaleDateString("pt-BR", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
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
