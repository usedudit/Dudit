"use client"

import Link from "next/link"
import { MoneyIcon, ShoppingCartIcon, Users, CreditCardIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"
import { FitText } from "@/components/ui/fit-text"

export interface KPIItem {
    title: string
    value: string | number
    trend?: string
    badgeText?: string
    badgeVariant?: "green" | "red" | "orange" | "blue" | "gray"
    subtext?: string
    icon?: React.ComponentType<{ size?: number; className?: string }>
    iconBg?: string
    iconColor?: string
    href?: string
}

interface HorizontalKPICardProps {
    items: KPIItem[]
    className?: string
}

export function HorizontalKPICard({ items, className }: HorizontalKPICardProps) {
    const defaultIcons = [MoneyIcon, ShoppingCartIcon, Users, CreditCardIcon]

    const getGridCols = () => {
        const count = items.length
        if (count <= 1) return "grid-cols-1"
        if (count === 2) return "sm:grid-cols-2"
        if (count === 3) return "sm:grid-cols-2 lg:grid-cols-3"
        if (count === 4) return "sm:grid-cols-2 lg:grid-cols-4"
        return "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
    }

    const parseTrend = (trendStr?: string) => {
        if (!trendStr) return { percent: "↑ 0 %", isPositive: true }
        const isPositive = !trendStr.trim().startsWith("-")
        const percentMatch = trendStr.match(/([0-9.,]+)%/)
        const percentValue = percentMatch ? percentMatch[1] : "0"

        return {
            percent: `${isPositive ? "↑" : "↓"} ${percentValue} %`,
            isPositive,
        }
    }

    return (
        <div className={cn(
            "bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border grid divide-y sm:divide-y-0 sm:divide-x divide-brand-border dark:divide-dark-border w-full",
            getGridCols(),
            className
        )}>
            {items.slice(0, 5).map((item, i) => {
                const CardIcon = item.icon || defaultIcons[i % defaultIcons.length]
                const { percent, isPositive } = parseTrend(item.trend)
                const iconBg = item.iconBg || "bg-brand-green-light dark:bg-dark-border/40"
                const iconColor = item.iconColor || "text-brand-dark dark:text-dark-heading"

                const cardContent = (
                    <>
                        <div className="flex items-start justify-between gap-2 mb-3 sm:mb-4">
                            <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                                <div className={cn("w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-full flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0", iconBg)}>
                                    <CardIcon size={16} className={iconColor} />
                                </div>
                                <FitText
                                    textClassName="text-[12px] sm:text-[13px] lg:text-[14px] font-bold text-brand-dark dark:text-dark-heading"
                                    minSize={9}
                                >
                                    {item.title}
                                </FitText>
                            </div>
                            {item.badgeText ? (
                                <span className={cn(
                                    "text-[10px] sm:text-[11px] lg:text-[12px] font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full whitespace-nowrap shrink-0",
                                    item.badgeVariant === "red" || item.badgeVariant === "orange"
                                        ? "bg-[#fce6e5] text-[#cc4745] dark:bg-red-950/40 dark:text-red-400"
                                        : item.badgeVariant === "blue"
                                            ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                                            : "bg-brand-green-secondary text-brand-green dark:bg-green-950/40 dark:text-green-400"
                                )}>
                                    {item.badgeText}
                                </span>
                            ) : item.trend ? (
                                <span className={cn(
                                    "text-[10px] sm:text-[11px] lg:text-[12px] font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full whitespace-nowrap shrink-0",
                                    isPositive ? "bg-brand-green-secondary text-brand-green" : "bg-[#fce6e5] text-[#cc4745]"
                                )}>
                                    {percent}
                                </span>
                            ) : null}
                        </div>

                        <div className="min-w-0">
                            <h2 className="text-[22px] sm:text-[26px] lg:text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none group-hover:text-brand-green transition-colors">
                                <FitText minSize={14}>{item.value}</FitText>
                            </h2>
                        </div>
                    </>
                )

                if (item.href) {
                    return (
                        <Link
                            key={item.title}
                            href={item.href}
                            className="p-4 sm:p-5 lg:p-6 flex flex-col justify-between min-w-0 overflow-hidden hover:bg-brand-green-light/10 dark:hover:bg-dark-border/20 transition-colors group"
                        >
                            {cardContent}
                        </Link>
                    )
                }

                return (
                    <div key={item.title} className="p-4 sm:p-5 lg:p-6 flex flex-col justify-between min-w-0 overflow-hidden">
                        {cardContent}
                    </div>
                )
            })}
        </div>
    )
}