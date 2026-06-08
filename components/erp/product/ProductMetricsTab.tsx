"use client"

import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

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

export function ProductMetricsTab({ productData }: ProductMetricsTabProps) {
    const hasId = !!productData?.id

    const overviewItems = useMemo(() => {
        if (!hasId) return []
        return [
            { label: "Visualizações totais", value: formatMetric(productData.views_count), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
            { label: "Visualizações (30 dias)", value: formatMetric(productData.views_last_30_days), color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" },
            { label: "Favoritos", value: formatMetric(productData.favorites_count), color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950/30" },
            { label: "Vendas totais", value: formatMetric(productData.total_sales), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: "Vendas (30 dias)", value: formatMetric(productData.sales_last_30_days), color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: "Vendas (7 dias)", value: formatMetric(productData.sales_last_7_days), color: "text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: "Score Marketplace", value: formatScore(productData.marketplace_score), color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
        ]
    }, [productData, hasId])

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
            <div className="flex items-center justify-center py-20 text-brand-inactive-text dark:text-dark-body text-sm">
                Salve o produto para visualizar as métricas.
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {overviewItems.map((item) => (
                    <div key={item.label} className={`rounded-xl border border-brand-border dark:border-dark-border p-5 ${item.bg}`}>
                        <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body uppercase tracking-wide mb-1">
                            {item.label}
                        </p>
                        <p className={`text-2xl font-bold ${item.color}`}>
                            {item.value}
                        </p>
                    </div>
                ))}
            </div>

            <div className="rounded-xl border border-brand-border dark:border-dark-border p-6">
                <h3 className="text-sm font-semibold text-brand-dark dark:text-dark-heading mb-4">
                    Comparativo: Total vs Últimos 30 dias
                </h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={comparisonData} barGap={4} barCategoryGap="20%">
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                            <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: "12px",
                                    border: "1px solid #e5e7eb",
                                    fontSize: "13px",
                                }}
                            />
                            <Bar dataKey="total" name="Total" radius={[6, 6, 0, 0]} fill="#059669" />
                            <Bar dataKey="recente" name="Últimos 30 dias" radius={[6, 6, 0, 0]} fill="#6ee7b7" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {productData.last_sale_at && (
                <div className="rounded-xl border border-brand-border dark:border-dark-border p-6">
                    <h3 className="text-sm font-semibold text-brand-dark dark:text-dark-heading mb-2">
                        Última venda
                    </h3>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                        {new Date(productData.last_sale_at).toLocaleDateString("pt-BR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                        })}
                    </p>
                </div>
            )}
        </div>
    )
}
