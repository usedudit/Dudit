import type { Metric } from "@/lib/data/dashboard"
import { cn } from "@/lib/utils"
import { ArrowDownIcon, ArrowUpIcon, InfoIcon } from "@/lib/icons"

const toneClasses: Record<NonNullable<Metric["tone"]>, string> = {
  default: "bg-white dark:bg-dark-surface",
  green: "bg-white dark:bg-dark-surface",
  red: "bg-white dark:bg-dark-surface",
  orange: "bg-white dark:bg-dark-surface",
  blue: "bg-[#eef7ff] dark:bg-blue-950/20",
}

const iconClasses: Record<NonNullable<Metric["tone"]>, string> = {
  default: "text-brand-inactive-text",
  green: "text-brand-green",
  red: "text-brand-red",
  orange: "text-brand-orange",
  blue: "text-brand-primary",
}

export function DashboardMetricCard({ metric, featured = false }: { metric: Metric; featured?: boolean }) {
  const trendPositive = metric.trend?.trim().startsWith("+")
  const TrendIcon = trendPositive ? ArrowUpIcon : ArrowDownIcon

  return (
    <section
      className={cn(
        "rounded-[24px] border border-brand-border dark:border-dark-border p-3 shadow-sm shadow-brand-dark/5",
        toneClasses[metric.tone || "default"],
        featured && "md:row-span-2 bg-[#eef7ff] dark:bg-blue-950/20",
      )}
    >
      <div className="flex items-center justify-between px-1 pb-3">
        <p className="text-[14px] font-bold text-brand-inactive-text dark:text-dark-body">{metric.title}</p>
        <InfoIcon className={cn("h-4 w-4", iconClasses[metric.tone || "default"])} />
      </div>
      <div className={cn("rounded-[18px] border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-4", featured ? "min-h-[148px]" : "min-h-[72px]")}>
        <p className={cn("font-bold tracking-tight text-brand-dark dark:text-dark-heading", featured ? "text-[30px]" : "text-[25px]")}>{metric.value}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
          {metric.trend && (
            <span className={cn("inline-flex items-center gap-1 font-bold", trendPositive ? "text-brand-green" : "text-brand-red")}>
              <TrendIcon className="h-3.5 w-3.5" />
              {metric.trend}
            </span>
          )}
          {metric.detail && <span>{metric.detail}</span>}
        </div>
      </div>
    </section>
  )
}
