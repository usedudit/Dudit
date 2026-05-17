import { cn } from "@/lib/utils"
import { ArrowDownIcon, ArrowUpIcon, MoneyIcon } from "@/lib/icons"
import { Badge } from "@/components/ui/badge"

interface KPICardProps {
    title: string
    value: string | number
    trend?: string
    isLast?: boolean
    className?: string
}

export function KPICard({ title, value, trend, className }: KPICardProps) {
    const trendClean = trend?.trim() || ""
    const trendPositive = trendClean.startsWith("+")
    const trendNegative = trendClean.startsWith("-")
    const TrendIcon = trendPositive ? ArrowUpIcon : trendNegative ? ArrowDownIcon : null

    const trendParts = trendClean.split(" ")
    const trendValue = trendParts[0] || ""
    const trendLabel = trendParts.slice(1).join(" ")

    return (
        <div className={cn("relative flex flex-col p-5 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl shadow-sm shadow-brand-dark/5", className)}>
            {/* Top Row: Icon + Title -> Badge */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-green/10 text-brand-green shrink-0">
                        <MoneyIcon className="w-5 h-5" />
                    </div>
                    <span className="text-[15px] font-medium text-brand-dark dark:text-dark-heading">
                        {title}
                    </span>
                </div>
                {trendValue && (
                    <Badge 
                        variant="outline" 
                        className={cn(
                            "border-0 shrink-0 font-bold",
                            trendPositive ? "bg-[#e5f7e6] text-[#2ebd3a] dark:bg-brand-green/20 dark:text-brand-green" 
                            : trendNegative ? "bg-red-100 text-red-600 dark:bg-brand-red/20 dark:text-brand-red" 
                            : "bg-gray-100 text-gray-600 dark:bg-dark-border dark:text-dark-body"
                        )}
                    >
                        {TrendIcon && <TrendIcon className="w-3 h-3 mr-1 stroke-[3]" />}
                        {trendValue.replace('+', '').replace('-', '')}
                    </Badge>
                )}
            </div>

            {/* Bottom Row: Value -> Subtext */}
            <div className="flex items-end justify-between gap-4">
                <span className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading leading-none">
                    {value}
                </span>
                
                {trendLabel && (
                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-body mb-0.5 text-right leading-tight">
                        <span className={cn(
                            "font-bold",
                            trendPositive ? "text-brand-dark dark:text-dark-heading" : trendNegative ? "text-brand-dark dark:text-dark-heading" : "text-brand-inactive-text dark:text-dark-body/60"
                        )}>{trendValue}</span> {trendLabel}
                    </span>
                )}
            </div>
        </div>
    )
}
