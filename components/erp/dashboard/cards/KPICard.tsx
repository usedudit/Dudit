import { cn } from "@/lib/utils"
import { ArrowDownIcon, ArrowUpIcon, MoneyIcon } from "@/lib/icons"
import { Badge } from "@/components/reusable/Badge"

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
        <div className={cn("relative flex flex-col p-5 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl", className)}>
            {/* Top Row: Icon + Title -> Badge */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-brand-green/10 text-brand-green shrink-0">
                        <MoneyIcon className="w-5 h-5" />
                    </div>
                    <span className="text-[15px] font-medium text-brand-dark dark:text-dark-heading">
                        {title}
                    </span>
                </div>
                {trendValue && (
                    <Badge 
                        variant={trendPositive ? "green" : trendNegative ? "red" : "gray"}
                        className="shrink-0"
                        icon={TrendIcon ? <TrendIcon className="stroke-[3]" /> : null}
                    >
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
