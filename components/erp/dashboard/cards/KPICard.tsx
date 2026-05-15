import { cn } from "@/lib/utils"
import {
    ArrowDownIcon,
    ArrowUpIcon,
} from "@/lib/icons"

interface KPICardProps {
    title: string
    value: string | number
    trend?: string
    isLast?: boolean
    className?: string
}

export function KPICard({ title, value, trend, isLast, className }: KPICardProps) {
    const trendClean = trend?.trim() || ""
    const trendPositive = trendClean.startsWith("+")
    const trendNegative = trendClean.startsWith("-")
    const TrendIcon = trendPositive ? ArrowUpIcon : trendNegative ? ArrowDownIcon : null

    // Split "+10% vs período anterior" -> ["+10%", "vs período anterior"]
    const trendParts = trendClean.split(" ")
    const trendValue = trendParts[0] || ""
    const trendLabel = trendParts.slice(1).join(" ")

    return (
        <div className={cn("relative flex flex-col gap-1.5 p-6 flex-1 min-w-0", className)}>
            {/* Title */}
            <span className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body truncate uppercase tracking-tight">
                {title}
            </span>

            {/* Value + Trend */}
            <div className="flex items-baseline gap-2 flex-wrap min-h-[32px]">
                <span className="text-[28px] font-bold tracking-tight text-brand-dark dark:text-dark-heading leading-none">
                    {value}
                </span>

                {trendValue && (
                    <div className="flex items-center gap-1">
                        <span className={cn(
                            "flex items-center gap-0.5 text-[13px] font-bold whitespace-nowrap",
                            trendPositive ? "text-brand-green" : trendNegative ? "text-brand-red" : "text-brand-inactive-text dark:text-dark-body/60"
                        )}>
                            {TrendIcon && <TrendIcon className="h-3 w-3" />}
                            {trendValue}
                        </span>
                        {trendLabel && (
                            <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body/60 whitespace-nowrap">
                                {trendLabel}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Vertical Divider (Desktop) */}
            {!isLast && (
                <div className="hidden md:block absolute right-0 top-8 bottom-8 w-px bg-brand-border/60 dark:bg-dark-border/40" />
            )}

            {/* Horizontal Divider (Mobile) */}
            {!isLast && (
                <div className="md:hidden absolute bottom-0 left-8 right-8 h-px bg-brand-border/60 dark:bg-dark-border/40" />
            )}
        </div>
    )
}
