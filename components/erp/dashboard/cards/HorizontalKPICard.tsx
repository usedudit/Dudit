"use client"

import { MoneyIcon, ShoppingCartIcon, Users, CreditCardIcon, AlertTriangleIcon, ClockIcon, CheckCircleIcon, FileIcon } from "@/lib/icons"
import { formatCurrency as brl } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface KPIItem {
    title: string
    value: string | number
    trend?: string
    subtext?: string
    icon?: React.ComponentType<{ size?: number; className?: string }>
    iconBg?: string
    iconColor?: string
}

interface HorizontalKPICardProps {
    items: KPIItem[]
    className?: string
}

export function HorizontalKPICard({ items, className }: HorizontalKPICardProps) {
    const defaultIcons = [MoneyIcon, ShoppingCartIcon, Users, CreditCardIcon]

    const columns = items.length >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"

    const parseTrend = (trendStr?: string) => {
        if (!trendStr) return { percent: "↑ 0 %", isPositive: true, change: "0%", vsText: "período anterior" }
        const isPositive = !trendStr.trim().startsWith("-")
        const percentMatch = trendStr.match(/([0-9.,]+)%/)
        const percentValue = percentMatch ? percentMatch[1] : "0"
        const changeMatch = trendStr.match(/^[+-]?[0-9.,]+%/)
        const change = changeMatch ? changeMatch[0] : "0%"
        const vsMatch = trendStr.match(/vs\s+(.+)/i)
        const vsText = vsMatch ? vsMatch[1] : "período anterior"

        return {
            percent: `${isPositive ? "↑" : "↓"} ${percentValue} %`,
            isPositive,
            change,
            vsText
        }
    }

    return (
        <div className={cn("bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-brand-border dark:divide-dark-border w-full", columns, className)}>
            {items.slice(0, 5).map((item, i) => {
                const CardIcon = item.icon || defaultIcons[i % defaultIcons.length]
                const { percent, isPositive, change, vsText } = parseTrend(item.trend)
                const iconBg = item.iconBg || "bg-brand-green-light dark:bg-dark-border/40"
                const iconColor = item.iconColor || "text-brand-dark dark:text-dark-heading"

                return (
                    <div key={item.title} className="p-6 flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center space-x-3">
                                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0", iconBg)}>
                                    <CardIcon size={18} className={iconColor} />
                                </div>
                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{item.title}</span>
                            </div>
                            {item.trend && (
                                <span className={cn(
                                    "text-[12px] font-bold px-2.5 py-1 rounded-full flex items-center space-x-1",
                                    isPositive ? "bg-brand-green-secondary text-brand-green" : "bg-[#fce6e5] text-[#cc4745]"
                                )}>
                                    <span>{percent.split(" ")[0]}</span>
                                    <span>{percent.split(" ")[1]}</span>
                                    <span>{percent.split(" ")[2]}</span>
                                </span>
                            )}
                        </div>

                        <div className="flex items-baseline space-x-2 mt-2">
                            <h2 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">{item.value}</h2>
                            {item.trend && (
                                <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                                    <span className="text-brand-dark dark:text-dark-heading">{change}</span> vs {vsText}
                                </span>
                            )}
                        </div>
                        {item.subtext && (
                            <div className="mt-3 text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                                {item.subtext}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}