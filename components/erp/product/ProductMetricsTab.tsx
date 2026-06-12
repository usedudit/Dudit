"use client"

import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { EyeIcon, HeartIcon, SalesIcon, StarIcon, CalendarIcon, TrendingUpIcon } from "@/lib/icons"

interface ProductMetricsTabProps {
    productData: any
}

function formatMetric(value: number | string | null | undefined): string {
    const n = Number(value ?? 0)
    return new Intl.NumberFormat("pt-BR").format(n)
}

function formatScore(value: number | string | null | undefined): string {
    return Number(value ?? 0).toFixed(2)
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-3.5 shadow-lg flex flex-col gap-2 font-sans min-w-[150px]">
                <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{label}</p>
                <div className="flex flex-col gap-1.5">
                    {payload.map((entry: any, index: number) => {
                        const color = entry.fill || "var(--color-brand-green)"
                        return (
                            <div key={index} className="flex items-center justify-between gap-6">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded bg-current shrink-0" style={{ color }} />
                                    <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                                        {entry.name}
                                    </span>
                                </div>
                                <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
                                    {formatMetric(entry.value)}
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

interface KPICardProps {
    icon: any
    title: string
    value: string
    subtext: string
    iconBgClass: string
}

function KPICard({ icon: Icon, title, value, subtext, iconBgClass }: KPICardProps) {
    return (
        <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between shadow-sm">
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconBgClass}`}>
                        <Icon size={18} className="currentColor" />
                    </div>
                    <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{title}</span>
                </div>
            </div>
            <div className="flex items-baseline space-x-2 mt-2">
                <h2 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                    {value}
                </h2>
            </div>
            <div className="mt-3 text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                {subtext}
            </div>
        </div>
    )
}

export function ProductMetricsTab({ productData }: ProductMetricsTabProps) {
    const hasId = !!productData?.id

    const comparisonData = useMemo(() => {
        if (!hasId) return []
        return [
            {
                name: "Visualizações",
                total: Number(productData.views_count ?? 0),
                recente: Number(productData.views_last_30_days ?? 0),
            },
            {
                name: "Vendas",
                total: Number(productData.total_sales ?? 0),
                recente: Number(productData.sales_last_30_days ?? 0),
            },
            {
                name: "Favoritos",
                total: Number(productData.favorites_count ?? 0),
                recente: 0,
            },
        ]
    }, [productData, hasId])

    if (!hasId) {
        return (
            <div className="flex items-center justify-center py-20 text-brand-inactive-text dark:text-dark-body text-sm bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] shadow-sm">
                Salve o produto para visualizar as métricas.
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                {/* Left/Main Column */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                    {/* KPI Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                        <KPICard
                            icon={EyeIcon}
                            title="Visitas Totais"
                            value={formatMetric(productData.views_count)}
                            subtext={`${formatMetric(productData.views_last_30_days)} nos últimos 30 dias`}
                            iconBgClass="bg-blue-500/10 text-blue-500 dark:bg-blue-500/20"
                        />
                        <KPICard
                            icon={SalesIcon}
                            title="Vendas Totais"
                            value={formatMetric(productData.total_sales)}
                            subtext={`${formatMetric(productData.sales_last_30_days)} nos últimos 30 dias`}
                            iconBgClass="bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20"
                        />
                        <KPICard
                            icon={TrendingUpIcon}
                            title="Vendas (7d)"
                            value={formatMetric(productData.sales_last_7_days)}
                            subtext="Volume nos últimos 7 dias"
                            iconBgClass="bg-teal-500/10 text-teal-500 dark:bg-teal-500/20"
                        />
                        <KPICard
                            icon={HeartIcon}
                            title="Favoritos"
                            value={formatMetric(productData.favorites_count)}
                            subtext="Desejado por clientes"
                            iconBgClass="bg-rose-500/10 text-rose-500 dark:bg-rose-500/20"
                        />
                    </div>

                    {/* Comparison Chart */}
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col shadow-sm">
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-6">
                            Comparativo: Histórico vs Últimos 30 dias
                        </h3>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={comparisonData} barGap={6} barCategoryGap="25%">
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-brand-border)" />
                                    <XAxis
                                        dataKey="name"
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: "currentColor", className: "text-brand-inactive-text dark:text-dark-body", fontSize: 12, fontWeight: 500 }}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: "currentColor", className: "text-brand-inactive-text dark:text-dark-body", fontSize: 12, fontWeight: 500 }}
                                    />
                                    <Tooltip
                                        content={<CustomTooltip />}
                                        cursor={{ fill: "rgba(0, 0, 0, 0.02)", radius: 6 }}
                                    />
                                    <Bar dataKey="total" name="Total Histórico" radius={[6, 6, 0, 0]} fill="var(--color-brand-green)" />
                                    <Bar dataKey="recente" name="Últimos 30 Dias" radius={[6, 6, 0, 0]} fill="#3b82f6" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    {/* Score / Reputation Gauge */}
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col items-center justify-between shadow-sm">
                        <div className="flex items-center justify-between w-full mb-6">
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Score no Marketplace</h3>
                            <StarIcon className="text-yellow-500 fill-yellow-500 w-5 h-5" />
                        </div>

                        <div className="relative flex items-center justify-center w-36 h-36 my-4">
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
                                    strokeDashoffset={251.2 - (251.2 * Math.min(Math.max(Number(productData.marketplace_score ?? 0), 0), 5)) / 5}
                                    strokeLinecap="round"
                                    className="transition-all duration-1000 ease-out"
                                />
                            </svg>
                            <div className="absolute flex flex-col items-center justify-center">
                                <span className="text-3xl font-extrabold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                    {formatScore(productData.marketplace_score)}
                                </span>
                                <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body mt-1 uppercase tracking-wider">
                                    de 5.0
                                </span>
                            </div>
                        </div>

                        <div className="text-center mt-2 w-full border-t border-brand-border dark:border-dark-border pt-4">
                            <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                Nota de relevância baseada em visualizações, favoritos e conversão de vendas.
                            </p>
                        </div>
                    </div>

                    {/* Last Sale card */}
                    {productData.last_sale_at ? (
                        <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col shadow-sm">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-full bg-brand-green/10 text-brand-green flex items-center justify-center shrink-0">
                                    <CalendarIcon size={18} />
                                </div>
                                <div>
                                    <h4 className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">Última Venda</h4>
                                    <p className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">Registro de atividade</p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <span className="text-2xl font-extrabold text-brand-dark dark:text-dark-heading tracking-tight">
                                    {new Date(productData.last_sale_at).toLocaleDateString("pt-BR", {
                                        day: "numeric",
                                        month: "long",
                                        year: "numeric",
                                    })}
                                </span>
                                <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                    Realizada às {new Date(productData.last_sale_at).toLocaleTimeString("pt-BR", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-slate-800 text-brand-inactive-text flex items-center justify-center shrink-0">
                                    <CalendarIcon size={18} />
                                </div>
                                <div>
                                    <h4 className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">Última Venda</h4>
                                    <p className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">Registro de atividade</p>
                                </div>
                            </div>

                            <div className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body py-2">
                                Este produto ainda não possui vendas registradas.
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
