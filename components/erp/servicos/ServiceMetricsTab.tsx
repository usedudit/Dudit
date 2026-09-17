"use client"

import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { EyeIcon, HeartIcon, SalesIcon, StarIcon, CalendarIcon, TrendingUpIcon, AnalyticsIcon } from "@/lib/icons"
import { IconPlaceholder } from "@/components/reusable"
import { HorizontalKPICard } from "@/components/erp/dashboard/cards/HorizontalKPICard"

interface ServiceMetricsTabProps {
    serviceData: any
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

export function ServiceMetricsTab({ serviceData }: ServiceMetricsTabProps) {
    const hasId = !!serviceData?.id

    const comparisonData = useMemo(() => {
        if (!hasId) return []
        return [
            {
                name: "Visualizações",
                total: Number(serviceData.views_count ?? 0),
                recente: 0,
            },
            {
                name: "Reservas",
                total: Number(serviceData.total_bookings ?? 0),
                recente: Number(serviceData.bookings_last_30_days ?? 0),
            },
            {
                name: "Favoritos",
                total: Number(serviceData.favorites_count ?? 0),
                recente: 0,
            },
        ]
    }, [serviceData, hasId])

    if (!hasId) {
        return (
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex items-center justify-center min-h-[300px]">
                <IconPlaceholder
                    icon={AnalyticsIcon}
                    title="Nenhuma Métrica Disponível"
                    subtitle="Salve o serviço para visualizar as métricas."
                />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                {/* Left/Main Column */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                    {/* KPI Cards */}
                    <HorizontalKPICard
                        items={[
                            {
                                title: "Visitas Totais",
                                value: formatMetric(serviceData.views_count),
                                subtext: "Total de visualizações",
                                icon: EyeIcon,
                            },
                            {
                                title: "Reservas Totais",
                                value: formatMetric(serviceData.total_bookings),
                                subtext: `${formatMetric(serviceData.bookings_last_30_days)} nos últimos 30 dias`,
                                icon: SalesIcon,
                            },
                            {
                                title: "Reservas (7d)",
                                value: formatMetric(serviceData.bookings_last_7_days),
                                subtext: "Volume nos últimos 7 dias",
                                icon: TrendingUpIcon,
                            },
                            {
                                title: "Favoritos",
                                value: formatMetric(serviceData.favorites_count),
                                subtext: "Desejado por clientes",
                                icon: HeartIcon,
                            },
                        ]}
                    />

                    {/* Comparison Chart */}
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col">
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-6">
                            Comparativo: Histórico vs Últimos 30 dias
                        </h3>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
                                        cursor={{ fill: "var(--color-brand-green-light)", opacity: 0.1 }}
                                    />
                                    <Bar dataKey="total" name="Total Histórico" radius={[6, 6, 0, 0]} fill="var(--color-brand-green)" />
                                    <Bar dataKey="recente" name="Últimos 30 Dias" radius={[6, 6, 0, 0]} fill="var(--color-brand-dark)" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    {/* Score / Reputation Gauge */}
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col items-center justify-between">
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
                                    strokeDashoffset={251.2 - (251.2 * Math.min(Math.max(Number(serviceData.marketplace_score ?? 0), 0), 5)) / 5}
                                    strokeLinecap="round"
                                    className="transition-all duration-1000 ease-out"
                                />
                            </svg>
                            <div className="absolute flex flex-col items-center justify-center">
                                <span className="text-3xl font-extrabold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                    {formatScore(serviceData.marketplace_score)}
                                </span>
                                <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body mt-1 uppercase tracking-wider">
                                    de 5.0
                                </span>
                            </div>
                        </div>

                        <div className="text-center mt-2 w-full border-t border-brand-border dark:border-dark-border pt-4">
                            <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                Nota de relevância baseada em visualizações, favoritos e conversão de reservas.
                            </p>
                        </div>
                    </div>

                    {/* Last Booking card */}
                    {serviceData.last_booking_at ? (
                        <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center shrink-0 text-brand-dark dark:text-dark-heading">
                                    <CalendarIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                </div>
                                <div>
                                    <h4 className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">Última Reserva</h4>
                                    <p className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">Registro de atividade</p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <span className="text-2xl font-extrabold text-brand-dark dark:text-dark-heading tracking-tight">
                                    {new Date(serviceData.last_booking_at).toLocaleDateString("pt-BR", {
                                        day: "numeric",
                                        month: "long",
                                        year: "numeric",
                                    })}
                                </span>
                                <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                    Realizada às {new Date(serviceData.last_booking_at).toLocaleTimeString("pt-BR", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center shrink-0 text-brand-dark dark:text-dark-heading">
                                    <CalendarIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                </div>
                                <div>
                                    <h4 className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">Última Reserva</h4>
                                    <p className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">Registro de atividade</p>
                                </div>
                            </div>

                            <div className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body py-2">
                                Este serviço ainda não possui reservas registradas.
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
